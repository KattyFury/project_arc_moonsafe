// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan} from "../DcaPlan.sol";
import {MockPyth} from "../test-helpers/MockPyth.sol";

contract DcaPlanRoundTest is DcaTestBase {
    // ───────────────────────── happy path ─────────────────────────

    function test_Execute_HappyPath() public {
        Snap memory a = _snap();
        _fresh();
        vm.expectEmit(false, false, false, true, address(plan));
        emit DcaPlan.RoundExecuted(9, AMOUNT, BTC_OUT, PRICE, keeper);
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE + 0.5e18}(_swapCall(BTC_OUT), _updates());
        Snap memory b = _snap();

        assertEq(b.ownerBtc - a.ownerBtc, BTC_OUT, "cirBTC goes to the owner");
        assertEq(b.planBtc, 0, "plan holds no cirBTC");
        assertEq(b.keeperNative + PYTH_FEE, a.keeperNative + TIP, "keeper nets tip minus pyth fee, excess refunded");
        assertEq(b.pythNative - a.pythNative, PYTH_FEE, "pyth update fee paid");
        assertEq(a.planNative - b.planNative, uint256(AMOUNT) * 1e12 + TIP, "plan pays swap + tip only");
        assertEq(b.adapterNative - a.adapterNative, uint256(AMOUNT) * 1e12, "adapter received the USDC");
        assertEq(b.ownerNative, a.ownerNative, "owner gets no native during a round");
        assertEq(b.roundsLeft, ROUNDS - 1);
        assertEq(b.nextDue, a.nextDue + INTERVAL);
        assertEq(b.allowance, 0, "allowance reset");
        assertEq(pyth.updateCalls(), 1);
    }

    function test_Execute_AdapterSeesApprovalAndNoNativeValue() public {
        _exec();
        assertEq(adapter.allowanceSeen(), AMOUNT, "adapter was approved exactly amountPerRound");
        assertEq(adapter.lastCallValue(), 0, "adapter called with zero native value");
        assertEq(adapter.lastCaller(), address(plan));
        assertEq(usdc.allowance(address(plan), address(adapter)), 0);
    }

    function test_Execute_RefundsExcessToKeeper() public {
        uint256 before_ = keeper.balance;
        _exec(keeper, PYTH_FEE + 3e18, BTC_OUT);
        assertEq(keeper.balance, before_ - PYTH_FEE + TIP);
        assertEq(address(plan).balance, DEPOSIT - uint256(AMOUNT) * 1e12 - TIP, "excess never stays in the plan");
    }

    function test_Execute_ExactFeeNoRefund() public {
        uint256 before_ = keeper.balance;
        _exec(keeper, PYTH_FEE, BTC_OUT);
        assertEq(keeper.balance, before_ - PYTH_FEE + TIP);
    }

    function test_Execute_ZeroFeeZeroValue() public {
        pyth.setFee(0);
        uint256 before_ = keeper.balance;
        _exec(keeper, 0, BTC_OUT);
        assertEq(keeper.balance, before_ + TIP);
        assertEq(address(pyth).balance, 0);
    }

    function test_Execute_AnyoneIncludingOwnerCanKeep() public {
        _exec(owner, PYTH_FEE, BTC_OUT);
        assertEq(plan.roundsLeft(), ROUNDS - 1);
        assertEq(btc.balanceOf(owner), BTC_OUT);
    }

    function test_Execute_ZeroTipPaysNothing() public {
        DcaPlan raw = DcaPlan(payable(Clones.clone(address(impl))));
        raw.initialize{value: 10e18}(owner, AMOUNT, 1, INTERVAL, DEV, 0);
        _fresh();
        uint256 before_ = keeper.balance;
        vm.prank(keeper);
        raw.executeRound{value: PYTH_FEE}(_swapCall(raw, AMOUNT, BTC_OUT), _updates());
        assertEq(keeper.balance, before_ - PYTH_FEE);
        assertEq(raw.roundsLeft(), 0);
        assertEq(btc.balanceOf(owner), BTC_OUT);
    }

    function test_Execute_EventCarriesActualSpendAndOutput() public {
        // adapter pulls less than approved: event reports the real spend
        adapter.setPullOverride(true, 4e6);
        _fresh();
        vm.expectEmit(false, false, false, true, address(plan));
        emit DcaPlan.RoundExecuted(9, 4e6, 16_700, PRICE, other);
        vm.prank(other);
        plan.executeRound{value: PYTH_FEE}(_swapCall(16_700), _updates());
    }

    function test_Execute_FullScheduleRunsAllRoundsAndEndsClean() public {
        uint256 keeperStart = keeper.balance;
        for (uint256 i; i < ROUNDS; i++) {
            assertEq(plan.roundsLeft(), ROUNDS - i);
            _exec();
            skip(INTERVAL);
        }
        assertEq(plan.roundsLeft(), 0);
        assertEq(btc.balanceOf(owner), uint256(ROUNDS) * BTC_OUT);
        assertEq(address(plan).balance, 0, "no dust when reserve divides evenly");
        assertEq(keeper.balance, keeperStart + 10 * TIP - 10 * PYTH_FEE);
        assertEq(address(adapter).balance, 100e18);
        vm.expectRevert(DcaPlan.NoRoundsLeft.selector);
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE}(_swapCall(BTC_OUT), _updates());
    }

    // ───────────────────────── schedule ─────────────────────────

    function test_NextDue_AdvancesFromPreviousDueNotFromNow() public {
        skip(3 days + 1234);
        _exec();
        assertEq(plan.nextDue(), T0 + INTERVAL, "anchored to the previous nextDue");
        _exec();
        assertEq(plan.nextDue(), T0 + 2 * INTERVAL);
    }

    function test_CatchUp_ThreeMissedRoundsOnePerCall() public {
        _exec(); // round at T0
        skip(3 * INTERVAL + 5); // misses rounds due at T0+1d, +2d, +3d
        uint32 left = plan.roundsLeft();
        for (uint256 i; i < 3; i++) {
            assertTrue(plan.isDue());
            _exec();
            left--;
            assertEq(plan.roundsLeft(), left, "exactly one round per call");
            assertEq(plan.nextDue(), T0 + (i + 2) * INTERVAL);
        }
        assertFalse(plan.isDue());
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.RoundNotDue.selector, block.timestamp, uint64(T0 + 4 * INTERVAL)));
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE}(_swapCall(BTC_OUT), _updates());
        assertEq(btc.balanceOf(owner), 4 * BTC_OUT);
    }

    function test_NotDue_RevertsWithTimestampAndNextDue() public {
        _exec();
        Snap memory s = _snap();
        bytes memory err = abi.encodeWithSelector(DcaPlan.RoundNotDue.selector, block.timestamp, uint64(T0 + INTERVAL));
        _expectExecRevert(err, PYTH_FEE, BTC_OUT);
        s = _snap();
        skip(INTERVAL - 1);
        err = abi.encodeWithSelector(DcaPlan.RoundNotDue.selector, block.timestamp, uint64(T0 + INTERVAL));
        _expectExecRevert(err, PYTH_FEE, BTC_OUT);
    }

    function test_Due_ExactlyAtNextDuePasses() public {
        _exec();
        skip(INTERVAL);
        assertEq(block.timestamp, plan.nextDue());
        _exec();
        assertEq(plan.roundsLeft(), ROUNDS - 2);
    }

    function test_NoRoundsLeft_TakesPrecedenceOverNotDue() public {
        vm.prank(owner);
        plan.cancel();
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector), PYTH_FEE, BTC_OUT);
    }

    function test_NotDue_CheckedBeforeAnyOracleWork() public {
        _exec();
        pyth.setRevertOnUpdate(true); // would revert with a different error if reached
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.RoundNotDue.selector, block.timestamp, uint64(T0 + INTERVAL)), 0, 0
        );
    }

    // ───────────────────────── update fee ─────────────────────────

    function test_InsufficientUpdateFee() public {
        _expectExecRevert(
            abi.encodeWithSelector(DcaPlan.InsufficientUpdateFee.selector, PYTH_FEE - 1, PYTH_FEE),
            PYTH_FEE - 1,
            BTC_OUT
        );
    }

    function test_PythUpdateRevertBubblesAndRestoresRound() public {
        pyth.setRevertOnUpdate(true);
        _expectExecRevert(abi.encodeWithSelector(MockPyth.UpdateReverted.selector), PYTH_FEE, BTC_OUT);
    }

    // ───────────────────────── minOut formula ─────────────────────────

    function _checkMinOut(uint96 amount, int64 price, int32 expo, uint16 dev, uint256 want) internal {
        vm.warp(block.timestamp + 1);
        pyth.setPrice(price, 0, expo);
        DcaPlan p = _createPlan(owner, amount, 1, INTERVAL, dev, uint256(amount) * 1e12 + 1e17);
        _fresh();
        // one unit below the floor reverts with exact args
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, want - 1, want));
        vm.prank(keeper);
        p.executeRound{value: PYTH_FEE}(_swapCall(p, amount, want - 1), _updates());
        assertEq(p.roundsLeft(), 1, "failed attempt leaves the round pending");
        // exactly the floor passes
        vm.prank(keeper);
        p.executeRound{value: PYTH_FEE}(_swapCall(p, amount, want), _updates());
        assertEq(p.roundsLeft(), 0);
        assertEq(btc.balanceOf(owner), want);
        btc.burn(owner, want);
    }

    function test_MinOut_Btc60kExpoM8() public {
        _checkMinOut(10e6, 6_000_000_000_000, -8, 100, 16_499); // 16666 sats * 99%
    }

    function test_MinOut_OddPriceExpoM8() public {
        _checkMinOut(10e6, 9_712_345_678_901, -8, 100, 10_193); // 10296 sats * 99%
    }

    function test_MinOut_ExpoM5() public {
        _checkMinOut(10e6, 6_000_000_000, -5, 100, 16_499);
    }

    function test_MinOut_ExpoZero() public {
        _checkMinOut(10e6, 60_000, 0, 100, 16_499);
    }

    function test_MinOut_ExpoM18MaxDeviation() public {
        _checkMinOut(10e6, 5e18, -18, 5000, 100_000_000); // $5/BTC: 10 USD = 2 BTC, floor 1 BTC
    }

    function test_MinOut_FractionalAmount() public {
        _checkMinOut(123_456_789, 4_321_012_345_678, -8, 250, 278_569);
    }

    function test_MinOut_ExpoM10MinDeviation() public {
        _checkMinOut(1e6, 1e15, -10, 10, 999); // $100,000/BTC
    }

    function test_MinOut_LargeAmount() public {
        _checkMinOut(25e6, 10_000_000_000_000, -8, 10, 24_975); // $100,000/BTC
    }

    function test_MinOut_ZeroDeviationRequiresFullExpected() public {
        DcaPlan raw = DcaPlan(payable(Clones.clone(address(impl))));
        raw.initialize{value: 10e18}(owner, AMOUNT, 1, INTERVAL, 0, 0);
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.BelowOracleFloor.selector, 16_665, 16_666));
        vm.prank(keeper);
        raw.executeRound{value: PYTH_FEE}(_swapCall(raw, AMOUNT, 16_665), _updates());
    }

    function test_MinOut_ZeroRevertsAsZeroMinimumOutput() public {
        pyth.setPrice(9e18, 0, -8); // $9e10 per BTC: 1 USD buys < 1 sat
        DcaPlan p = _createPlan(owner, 1e6, 1, INTERVAL, 10, 2e18);
        _fresh();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.ZeroMinimumOutput.selector, uint96(1e6), int64(9e18)));
        vm.prank(keeper);
        p.executeRound{value: PYTH_FEE}(_swapCall(p, 1e6, 1_000), _updates());
        assertEq(p.roundsLeft(), 1);
    }

    function testFuzz_MinOut_BoundsTrueValue(uint96 amount, uint64 priceRaw, int32 expo, uint16 dev) public {
        amount = uint96(bound(amount, 1e6, 1e12));
        int64 price = int64(uint64(bound(priceRaw, 1, uint64(type(int64).max))));
        expo = int32(bound(expo, -18, 0));
        dev = uint16(bound(dev, 10, 5000));
        pyth.setPrice(price, 0, expo);
        DcaPlan p = _createPlan(owner, amount, 1, INTERVAL, dev, uint256(amount) * 1e12 + 1e17);
        _fresh();

        vm.prank(keeper);
        (bool ok, bytes memory ret) =
            address(p).call{value: PYTH_FEE}(abi.encodeCall(DcaPlan.executeRound, (_swapCall(p, amount, 0), _updates())));
        assertFalse(ok);
        bytes4 sel = bytes4(ret);
        if (sel == DcaPlan.ZeroMinimumOutput.selector) {
            // true floor is below 3 units (floor(floor(E) * f) == 0 => T < 2 + rounding)
            uint256 e = uint256(amount) * 100 * 10 ** uint32(-expo);
            assertLt(e * (10_000 - dev), uint256(uint64(price)) * 10_000 * 2);
            return;
        }
        assertEq(sel, DcaPlan.BelowOracleFloor.selector);
        uint256 minOut;
        assembly {
            minOut := mload(add(ret, 68))
        }
        // minOut = floor(floor(E) * f): never above the exact value, and less than 2 units below it.
        uint256 num = uint256(amount) * 100 * 10 ** uint32(-expo) * (10_000 - dev); // exact T = num / (price*10000)
        uint256 den = uint256(uint64(price)) * 10_000;
        assertLe(minOut * den, num, "floor never exceeds the exact discounted value");
        assertGt((minOut + 2) * den, num, "floor within 2 units of the exact discounted value");
    }
}
