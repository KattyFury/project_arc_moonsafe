// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan} from "../DcaPlan.sol";
import {MockCirBtc} from "../test-helpers/MockCirBtc.sol";
import {ForceSender} from "../test-helpers/Actors.sol";
import {DcaOwner, ReenterMode} from "../test-helpers/DcaActors.sol";

/// @dev Settlement (`cancel` / `sweep`) pays native and cirBTC independently and never reverts;
/// stranded cirBTC always reaches the owner.
contract DcaPlanSettleTest is DcaTestBase {
    uint256 internal constant DONATION = 777;

    // ───────────────────────── exact amounts ─────────────────────────

    function test_Cancel_PaysNativeAndStrandedCirBtc_SweptExact() public {
        btc.mint(address(plan), DONATION);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Cancelled(owner);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, DEPOSIT, DONATION);
        uint256 nativeBefore = owner.balance;
        vm.prank(owner);
        plan.cancel();
        assertEq(owner.balance - nativeBefore, DEPOSIT);
        assertEq(btc.balanceOf(owner), DONATION);
        assertEq(address(plan).balance, 0);
        assertEq(btc.balanceOf(address(plan)), 0);
        assertEq(plan.roundsLeft(), 0);
    }

    function test_Sweep_PaysNativeAndStrandedCirBtc_SweptExact() public {
        vm.prank(owner);
        plan.cancel();
        btc.mint(address(plan), DONATION);
        new ForceSender{value: 3e18}(payable(address(plan)));
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 3e18, DONATION);
        uint256 nativeBefore = owner.balance;
        uint256 otherBefore = other.balance;
        vm.prank(other);
        plan.sweep();
        assertEq(owner.balance - nativeBefore, 3e18);
        assertEq(btc.balanceOf(owner), DONATION);
        assertEq(other.balance, otherBefore, "caller gets nothing");
        assertEq(btc.balanceOf(other), 0);
    }

    function testFuzz_Cancel_SweptAmountsExact(uint96 forced, uint64 donated, uint8 modeSeed) public {
        MockCirBtc.Block mode = MockCirBtc.Block(modeSeed % 3);
        vm.deal(address(this), uint256(forced));
        new ForceSender{value: forced}(payable(address(plan)));
        btc.mint(address(plan), donated);
        btc.setBlock(owner, mode);

        uint256 nativeExpected = DEPOSIT + uint256(forced);
        uint256 btcExpected = mode == MockCirBtc.Block.None ? uint256(donated) : 0;
        uint256 nativeBefore = owner.balance;
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, nativeExpected, btcExpected);
        vm.prank(owner);
        plan.cancel();

        assertEq(owner.balance - nativeBefore, nativeExpected);
        assertEq(btc.balanceOf(owner), btcExpected);
        assertEq(btc.balanceOf(address(plan)), uint256(donated) - btcExpected, "unpaid part stays");
        assertEq(address(plan).balance, 0);
    }

    // ───────────────────────── independence (cirBTC blocked) ─────────────────────────

    function test_Cancel_CirBtcTransferReverts_NativeStillPaid() public {
        _cancelWithBlockedCirBtc(MockCirBtc.Block.Revert);
    }

    function test_Cancel_CirBtcTransferReturnsFalse_NativeStillPaid() public {
        _cancelWithBlockedCirBtc(MockCirBtc.Block.ReturnFalse);
    }

    function _cancelWithBlockedCirBtc(MockCirBtc.Block mode) internal {
        btc.mint(address(plan), DONATION);
        btc.setBlock(owner, mode);
        uint256 nativeBefore = owner.balance;
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, DEPOSIT, 0);
        vm.prank(owner);
        plan.cancel(); // must not revert
        assertEq(owner.balance - nativeBefore, DEPOSIT, "native paid despite blocked cirBTC");
        assertEq(btc.balanceOf(owner), 0);
        assertEq(btc.balanceOf(address(plan)), DONATION, "cirBTC kept for a later attempt");
        assertEq(plan.roundsLeft(), 0, "schedule stopped");

        // still blocked: sweep emits zeros and does not revert
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 0, 0);
        plan.sweep();
        assertEq(btc.balanceOf(address(plan)), DONATION);

        // unblocked: next sweep delivers it
        btc.setBlock(owner, MockCirBtc.Block.None);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 0, DONATION);
        vm.prank(other);
        plan.sweep();
        assertEq(btc.balanceOf(owner), DONATION);
        assertEq(btc.balanceOf(address(plan)), 0);
    }

    function test_Sweep_CirBtcBlocked_NativeStillPaid_BothModes() public {
        for (uint256 i = 1; i <= 2; i++) {
            DcaPlan p = _createPlan(owner, AMOUNT, 1, INTERVAL, DEV, 10e18 + 1e17);
            vm.prank(owner);
            p.cancel();
            btc.mint(address(p), DONATION);
            new ForceSender{value: 2e18}(payable(address(p)));
            btc.setBlock(owner, MockCirBtc.Block(i));
            uint256 nativeBefore = owner.balance;
            vm.expectEmit(true, false, false, true, address(p));
            emit DcaPlan.Swept(owner, 2e18, 0);
            p.sweep();
            assertEq(owner.balance - nativeBefore, 2e18);
            assertEq(btc.balanceOf(address(p)), DONATION);
            btc.setBlock(owner, MockCirBtc.Block.None);
        }
    }

    // ───────────────────────── independence (native rejected) ─────────────────────────

    function test_Cancel_NativeRejected_CirBtcStillPaid() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = DcaPlan(payable(o.create{value: DEPOSIT}(AMOUNT, ROUNDS, INTERVAL, DEV)));
        btc.mint(address(p), DONATION);
        o.setReject(true);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, DONATION);
        o.cancelPlan(); // must not revert
        assertEq(btc.balanceOf(address(o)), DONATION, "cirBTC paid despite rejecting native");
        assertEq(address(p).balance, DEPOSIT, "native kept");
        assertEq(p.roundsLeft(), 0);

        o.setReject(false);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), DEPOSIT, 0);
        p.sweep();
        assertEq(address(o).balance, DEPOSIT);
    }

    function test_Sweep_NativeRejected_CirBtcStillPaid() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = DcaPlan(payable(o.create{value: DEPOSIT}(AMOUNT, ROUNDS, INTERVAL, DEV)));
        o.setReject(true);
        o.cancelPlan();
        btc.mint(address(p), DONATION);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, DONATION);
        p.sweep();
        assertEq(btc.balanceOf(address(o)), DONATION);
        assertEq(address(p).balance, DEPOSIT);
    }

    function test_Cancel_BothPartsFail_NoRevert_BothRecoverLater() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = DcaPlan(payable(o.create{value: DEPOSIT}(AMOUNT, ROUNDS, INTERVAL, DEV)));
        btc.mint(address(p), DONATION);
        o.setReject(true);
        btc.setBlock(address(o), MockCirBtc.Block.Revert);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, 0);
        o.cancelPlan();
        assertEq(p.roundsLeft(), 0);
        assertEq(address(p).balance, DEPOSIT);
        assertEq(btc.balanceOf(address(p)), DONATION);

        o.setReject(false);
        btc.setBlock(address(o), MockCirBtc.Block.None);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), DEPOSIT, DONATION);
        p.sweep();
        assertEq(address(o).balance, DEPOSIT);
        assertEq(btc.balanceOf(address(o)), DONATION);
    }

    // ───────────────────────── stranded cirBTC reaches the owner ─────────────────────────

    function test_Stranded_DonatedBeforeRound_PaidWithRound() public {
        btc.mint(address(plan), DONATION);
        _fresh();
        vm.expectEmit(false, false, false, true, address(plan));
        emit DcaPlan.RoundExecuted(ROUNDS - 1, uint256(AMOUNT), BTC_OUT, PRICE, keeper);
        vm.prank(keeper);
        plan.executeRound{value: PYTH_FEE}(_swapCall(BTC_OUT), _updates());
        assertEq(btc.balanceOf(owner), BTC_OUT + DONATION);
        assertEq(btc.balanceOf(address(plan)), 0);
    }

    function test_Stranded_DonatedBeforeEachRound_AllPaid() public {
        uint256 total;
        for (uint256 i; i < 3; i++) {
            btc.mint(address(plan), 100 + i);
            total += 100 + i;
            _exec();
            assertEq(btc.balanceOf(address(plan)), 0);
            skip(INTERVAL);
        }
        assertEq(btc.balanceOf(owner), 3 * BTC_OUT + total);
    }

    function test_Stranded_DonatedAfterPlanEnded_ReachesOwnerViaSweep() public {
        DcaPlan p = _createPlan(owner, AMOUNT, 2, INTERVAL, DEV, 20e18 + 2e17);
        for (uint256 i; i < 2; i++) {
            _fresh();
            vm.prank(keeper);
            p.executeRound{value: PYTH_FEE}(_swapCall(p, AMOUNT, BTC_OUT), _updates());
            skip(INTERVAL);
        }
        assertEq(p.roundsLeft(), 0);
        assertEq(btc.balanceOf(address(p)), 0);
        assertEq(address(p).balance, 0);
        btc.mint(address(p), DONATION);
        uint256 ownerBtc = btc.balanceOf(owner);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(owner, 0, DONATION);
        vm.prank(other);
        p.sweep();
        assertEq(btc.balanceOf(owner) - ownerBtc, DONATION);
        assertEq(btc.balanceOf(address(p)), 0);
    }

    function test_Stranded_DonatedAfterCancel_ReachesOwnerViaSweep() public {
        vm.prank(owner);
        plan.cancel();
        btc.mint(address(plan), DONATION);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 0, DONATION);
        vm.prank(keeper);
        plan.sweep();
        assertEq(btc.balanceOf(owner), DONATION);
    }

    function test_Stranded_DonatedMidSchedule_ReachesOwnerViaCancel() public {
        _exec();
        skip(INTERVAL);
        btc.mint(address(plan), DONATION);
        uint256 expectedNative = DEPOSIT - uint256(AMOUNT) * 1e12 - TIP;
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, expectedNative, DONATION);
        vm.prank(owner);
        plan.cancel();
        assertEq(btc.balanceOf(owner), BTC_OUT + DONATION);
        assertEq(btc.balanceOf(address(plan)), 0);
    }

    function test_Round_OwnerCirBtcTransferFails_RoundRevertsAtomically() public {
        btc.setBlock(owner, MockCirBtc.Block.ReturnFalse);
        _expectExecRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(btc)), PYTH_FEE, BTC_OUT);
    }

    // ───────────────────────── repeat / empty ─────────────────────────

    function test_Cancel_Twice_SecondEmitsZerosAndDoesNotRevert() public {
        btc.mint(address(plan), DONATION);
        vm.prank(owner);
        plan.cancel();
        uint256 nativeBefore = owner.balance;
        uint256 btcBefore = btc.balanceOf(owner);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Cancelled(owner);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 0, 0);
        vm.prank(owner);
        plan.cancel();
        assertEq(owner.balance, nativeBefore);
        assertEq(btc.balanceOf(owner), btcBefore);
        assertEq(plan.roundsLeft(), 0);
    }

    function test_Sweep_OnEmptyPlan_EmitsZerosAndDoesNotRevert() public {
        vm.prank(owner);
        plan.cancel();
        for (uint256 i; i < 2; i++) {
            vm.expectEmit(true, false, false, true, address(plan));
            emit DcaPlan.Swept(owner, 0, 0);
            plan.sweep();
        }
    }

    function test_Settlement_DoesNotReviveRounds() public {
        vm.prank(owner);
        plan.cancel();
        btc.mint(address(plan), DONATION);
        plan.sweep();
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector), PYTH_FEE, BTC_OUT);
    }

    // ───────────────────────── reentrancy ─────────────────────────

    function test_Sweep_OwnerReentryBlocked_AmountsStillExact() public {
        ReenterMode[3] memory modes = [ReenterMode.Cancel, ReenterMode.Sweep, ReenterMode.ExecuteRound];
        for (uint256 i; i < 3; i++) {
            DcaOwner o = new DcaOwner(factory);
            DcaPlan p = DcaPlan(payable(o.create{value: DEPOSIT}(AMOUNT, ROUNDS, INTERVAL, DEV)));
            o.cancelPlan();
            btc.mint(address(p), DONATION);
            new ForceSender{value: 1e18}(payable(address(p)));
            o.setReenter(modes[i], false);
            uint256 before_ = address(o).balance;
            vm.expectEmit(true, false, false, true, address(p));
            emit DcaPlan.Swept(address(o), 1e18, DONATION);
            p.sweep();
            assertTrue(o.attempted());
            assertFalse(o.reentrySucceeded());
            assertEq(bytes4(o.reentryRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
            assertEq(address(o).balance - before_, 1e18);
            assertEq(btc.balanceOf(address(o)), DONATION);
            assertEq(address(p).balance, 0);
        }
    }

    function test_Cancel_OwnerReentryBlocked_CirBtcAlsoPaid() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = DcaPlan(payable(o.create{value: DEPOSIT}(AMOUNT, ROUNDS, INTERVAL, DEV)));
        btc.mint(address(p), DONATION);
        o.setReenter(ReenterMode.Sweep, false);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), DEPOSIT, DONATION);
        o.cancelPlan();
        assertTrue(o.attempted());
        assertFalse(o.reentrySucceeded());
        assertEq(bytes4(o.reentryRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(btc.balanceOf(address(o)), DONATION);
        assertEq(address(o).balance, DEPOSIT);
    }
}
