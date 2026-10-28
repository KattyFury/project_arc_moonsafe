// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan} from "../DcaPlan.sol";
import {MockPyth} from "../test-helpers/MockPyth.sol";
import {MockAdapter} from "../test-helpers/MockAdapter.sol";
import {DcaKeeper, ReenterMode} from "../test-helpers/DcaActors.sol";

/// @dev Every protective revert must leave the plan exactly as it was (see _expectExecRevert).
contract DcaPlanProtectTest is DcaTestBase {
    // ───────────────────────── oracle checks ─────────────────────────

    function test_StalePrice_Reverts() public {
        pyth.setPublishTime(block.timestamp - 61);
        _expectExecRevertKeepPrice(
            abi.encodeWithSelector(MockPyth.StalePrice.selector, block.timestamp - 61, uint256(60)), PYTH_FEE, BTC_OUT
        );
    }

    function test_PriceExactlyAtMaxAge_Passes() public {
        pyth.setPublishTime(block.timestamp - 60);
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE}(_swapCall(BTC_OUT), _updates());
        assertEq(plan.roundsLeft(), ROUNDS - 1);
    }

    function test_MaxPriceAgeConstant() public view {
        assertEq(plan.MAX_PRICE_AGE(), 60);
    }

    function test_ZeroPrice_Reverts() public {
        pyth.setPrice(0, 0, -8);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.InvalidPrice.selector, int64(0), int32(-8)), PYTH_FEE, BTC_OUT);
    }

    function test_NegativePrice_Reverts() public {
        pyth.setPrice(-5, 0, -8);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.InvalidPrice.selector, int64(-5), int32(-8)), PYTH_FEE, BTC_OUT);
        pyth.setPrice(type(int64).min, 0, -8);
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.InvalidPrice.selector, type(int64).min, int32(-8)), PYTH_FEE, BTC_OUT
        );
    }

    function test_ExpoTooNegative_Reverts() public {
        pyth.setPrice(PRICE, 0, -19);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.InvalidPrice.selector, PRICE, int32(-19)), PYTH_FEE, BTC_OUT);
    }

    function test_PositiveExpo_Reverts() public {
        pyth.setPrice(PRICE, 0, 1);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.InvalidPrice.selector, PRICE, int32(1)), PYTH_FEE, BTC_OUT);
    }

    function test_ConfidenceAboveOnePercent_Reverts() public {
        uint64 limit = uint64(uint64(PRICE) / 100); // exactly 1%
        pyth.setPrice(PRICE, limit + 1, -8);
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.PriceTooUncertain.selector, limit + 1, PRICE), PYTH_FEE, BTC_OUT
        );
    }

    function test_ConfidenceExactlyOnePercent_Passes() public {
        pyth.setPrice(PRICE, uint64(PRICE) / 100, -8);
        _exec();
        assertEq(plan.roundsLeft(), ROUNDS - 1);
    }

    function test_ConfidenceHugeDoesNotOverflow() public {
        pyth.setPrice(PRICE, type(uint64).max, -8);
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.PriceTooUncertain.selector, type(uint64).max, PRICE), PYTH_FEE, BTC_OUT
        );
    }

    // ───────────────────────── deviation floor ─────────────────────────

    function test_Floor_ExactlyAtFloorPasses() public {
        _exec(keeper, PYTH_FEE, MIN_OUT);
        assertEq(btc.balanceOf(owner), MIN_OUT);
        assertEq(plan.roundsLeft(), ROUNDS - 1);
    }

    function test_Floor_OneUnitBelowReverts() public {
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, MIN_OUT - 1, MIN_OUT), PYTH_FEE, MIN_OUT - 1
        );
    }

    function test_Floor_FollowsLivePriceNotCachedOne() public {
        _exec(); // price 60k
        skip(INTERVAL);
        pyth.setPrice(30_000e8, 0, -8); // price halves => twice as many sats expected (33,333 sats * 99%)
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, BTC_OUT, 32_999), PYTH_FEE, BTC_OUT
        );
    }

    // ───────────────────────── adapter behaviour ─────────────────────────

    function test_AdapterReverts_AdapterCallFailed() public {
        adapter.setRevertAll(true);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.AdapterCallFailed.selector, address(adapter)), PYTH_FEE, BTC_OUT);
    }

    function test_AdapterUnknownSelector_AdapterCallFailed() public {
        Snap memory s = _snap();
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.AdapterCallFailed.selector, address(adapter)));
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE}(hex"12345678", _updates());
        _assertUnchanged(s);
    }

    function test_AdapterPullsMoreThanApproved_FailsOnAllowance() public {
        adapter.setPullOverride(true, uint256(AMOUNT) + 1);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.AdapterCallFailed.selector, address(adapter)), PYTH_FEE, BTC_OUT);
    }

    function test_AdapterSpendsMoreThanAmount_SpentTooMuch() public {
        adapter.setRogueSpend(1); // takes one extra unit without allowance
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.SpentTooMuch.selector, uint256(AMOUNT) + 1, uint256(AMOUNT)),
            PYTH_FEE,
            BTC_OUT
        );
    }

    function test_AdapterRefundsUsdc_UnexpectedUsdcIncrease() public {
        vm.deal(address(adapter), 5e12);
        adapter.setSkipPull(true);
        adapter.setRogueReturn(5);
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.UnexpectedUsdcIncrease.selector, 101_000_000, 101_000_005), PYTH_FEE, BTC_OUT
        );
    }

    function test_AdapterBurnsPlanBtc_BtcBalanceDecreased() public {
        btc.mint(address(plan), 20_000);
        adapter.setBurnFromCaller(20_000);
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.BtcBalanceDecreased.selector, 20_000, BTC_OUT), PYTH_FEE, BTC_OUT
        );
    }

    function test_AdapterPaysSomeoneElse_BelowOracleFloor() public {
        adapter.setDeliverTo(other);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, 0, MIN_OUT), PYTH_FEE, BTC_OUT);
        assertEq(btc.balanceOf(other), 0, "misdirected mint rolled back");
    }

    function test_AdapterDeliversTooLittle_BelowOracleFloor() public {
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, MIN_OUT - 1, MIN_OUT), PYTH_FEE, MIN_OUT - 1
        );
    }

    function test_AdapterDeliversNothing_BelowOracleFloor() public {
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, 0, MIN_OUT), PYTH_FEE, 0);
    }

    function test_AdapterDeliversMore_OwnerGetsAll() public {
        _exec(keeper, PYTH_FEE, 50_000);
        assertEq(btc.balanceOf(owner), 50_000);
    }

    function test_AdapterPullsNoUsdc_RoundStillConsumedAndAllowanceCleared() public {
        adapter.setSkipPull(true);
        uint256 planBefore = address(plan).balance;
        _exec();
        assertEq(plan.roundsLeft(), ROUNDS - 1);
        assertEq(address(plan).balance, planBefore - TIP, "no USDC left the plan");
        assertEq(usdc.allowance(address(plan), address(adapter)), 0);
    }

    function test_AdapterPullsLess_LeftoverStaysAndAllowanceCleared() public {
        adapter.setPullOverride(true, 3e6);
        uint256 planBefore = address(plan).balance;
        _exec();
        assertEq(address(plan).balance, planBefore - 3e12 * 1e6 - TIP);
        assertEq(usdc.allowance(address(plan), address(adapter)), 0);
    }

    function test_AllowanceZeroAfterEverySuccessfulRound() public {
        for (uint256 i; i < 3; i++) {
            _exec();
            assertEq(usdc.allowance(address(plan), address(adapter)), 0);
            skip(INTERVAL);
        }
    }

    function test_DonatedCirBtcIsNotCountedAsOutputButIsPaidOut() public {
        btc.mint(address(plan), 1e6);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, 0, MIN_OUT), PYTH_FEE, 0);
        _fresh();
        vm.expectEmit(false, false, false, true, address(plan));
        emit DcaPlan.RoundExecuted(ROUNDS - 1, uint256(AMOUNT), BTC_OUT, PRICE, keeper);
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE}(_swapCall(BTC_OUT), _updates());
        assertEq(btc.balanceOf(owner), BTC_OUT + 1e6, "donation is paid out with the round");
        assertEq(btc.balanceOf(address(plan)), 0, "nothing stranded");
    }

    // ───────────────────────── reentrancy ─────────────────────────

    function _assertGuard(bytes memory ret) internal pure {
        assertEq(bytes4(ret), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function test_Reentrancy_AdapterCannotReenterExecuteCancelSweep() public {
        MockAdapter.Reenter[3] memory modes =
            [MockAdapter.Reenter.ExecuteRound, MockAdapter.Reenter.Cancel, MockAdapter.Reenter.Sweep];
        for (uint256 i; i < 3; i++) {
            adapter.setReenter(modes[i], false);
            uint32 before_ = plan.roundsLeft();
            _exec();
            assertTrue(adapter.reentryAttempted());
            assertFalse(adapter.reentrySucceeded(), "reentry blocked");
            _assertGuard(adapter.reentryRevertData());
            assertEq(plan.roundsLeft(), before_ - 1, "exactly one round executed");
            skip(INTERVAL);
        }
    }

    function test_Reentrancy_BubbledAdapterFailureRevertsRound() public {
        adapter.setReenter(MockAdapter.Reenter.ExecuteRound, true);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.AdapterCallFailed.selector, address(adapter)), PYTH_FEE, BTC_OUT);
    }

    function _keeperRun(DcaKeeper k, uint256 value) internal {
        _fresh();
        vm.prank(other);
        k.run{value: value}(_swapCall(BTC_OUT), _updates());
    }

    function test_Reentrancy_KeeperCannotReenterOnRefundOrTip() public {
        ReenterMode[3] memory modes = [ReenterMode.ExecuteRound, ReenterMode.Cancel, ReenterMode.Sweep];
        for (uint256 i; i < 3; i++) {
            DcaKeeper k = new DcaKeeper(plan);
            k.setReenter(modes[i], false, _swapCall(BTC_OUT));
            uint32 before_ = plan.roundsLeft();
            _keeperRun(k, PYTH_FEE + 1e15);
            assertTrue(k.attempted());
            assertFalse(k.reentrySucceeded());
            _assertGuard(k.reentryRevertData());
            assertEq(k.receiveCount(), 2, "refund and tip");
            assertEq(k.totalReceived(), 1e15 + TIP);
            assertEq(plan.roundsLeft(), before_ - 1);
            skip(INTERVAL);
        }
    }

    function test_Reentrancy_KeeperBubbleOnRefundFailsRound() public {
        DcaKeeper k = new DcaKeeper(plan);
        k.setReenter(ReenterMode.Cancel, true, "");
        Snap memory s = _snap();
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.RefundFailed.selector, address(k), 1e15));
        vm.prank(other);
        k.run{value: PYTH_FEE + 1e15}(_swapCall(BTC_OUT), _updates());
        _assertUnchanged(s);
    }

    // ───────────────────────── keeper payment failures ─────────────────────────

    function test_KeeperRejectsTip_TipFailedAndRoundRestored() public {
        DcaKeeper k = new DcaKeeper(plan);
        k.setRejectAt(1); // exact fee => first payment is the tip
        Snap memory s = _snap();
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.TipFailed.selector, address(k), TIP));
        vm.prank(other);
        k.run{value: PYTH_FEE}(_swapCall(BTC_OUT), _updates());
        _assertUnchanged(s);
        assertEq(address(k).balance, 0);
        // the round is still available to a well-behaved keeper
        _exec();
        assertEq(plan.roundsLeft(), ROUNDS - 1);
    }

    function test_KeeperRejectsRefund_RefundFailed() public {
        DcaKeeper k = new DcaKeeper(plan);
        k.setRejectAt(1); // refund comes first
        Snap memory s = _snap();
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.RefundFailed.selector, address(k), 7e14));
        vm.prank(other);
        k.run{value: PYTH_FEE + 7e14}(_swapCall(BTC_OUT), _updates());
        _assertUnchanged(s);
    }

    function test_KeeperAcceptsRefundButRejectsTip_TipFailed() public {
        DcaKeeper k = new DcaKeeper(plan);
        k.setRejectAt(2);
        Snap memory s = _snap();
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.TipFailed.selector, address(k), TIP));
        vm.prank(other);
        k.run{value: PYTH_FEE + 7e14}(_swapCall(BTC_OUT), _updates());
        _assertUnchanged(s);
    }

    function test_ContractKeeper_ReceivesRefundAndTip() public {
        DcaKeeper k = new DcaKeeper(plan);
        _keeperRun(k, PYTH_FEE + 7e14);
        assertEq(k.receiveCount(), 2);
        assertEq(address(k).balance, 7e14 + TIP);
        assertEq(btc.balanceOf(owner), BTC_OUT);
    }
}
