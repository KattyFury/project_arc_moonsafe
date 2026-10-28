// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DcaTestBase} from "./DcaPlan.Base.t.sol";
import {DcaPlan} from "../DcaPlan.sol";
import {ForceSender} from "../test-helpers/Actors.sol";
import {DcaOwner, ReenterMode} from "../test-helpers/DcaActors.sol";

contract DcaPlanCancelTest is DcaTestBase {
    // ───────────────────────── cancel ─────────────────────────

    function test_Cancel_SendsWholeBalanceToOwner() public {
        uint256 ownerBefore = owner.balance;
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Cancelled(owner);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, DEPOSIT, 0);
        vm.prank(owner);
        plan.cancel();
        assertEq(owner.balance, ownerBefore + DEPOSIT);
        assertEq(address(plan).balance, 0);
        assertEq(plan.roundsLeft(), 0);
        assertEq(plan.principalLeft(), 0);
        assertFalse(plan.isDue());
    }

    function test_Cancel_MidScheduleReturnsRemainder() public {
        for (uint256 i; i < 3; i++) {
            _exec();
            skip(INTERVAL);
        }
        uint256 expected = DEPOSIT - 3 * (uint256(AMOUNT) * 1e12 + TIP); // 70.7 USDC
        assertEq(expected, 70.7e18);
        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        plan.cancel();
        assertEq(owner.balance - ownerBefore, expected);
        assertEq(btc.balanceOf(owner), 3 * BTC_OUT, "cirBTC already bought is untouched");
    }

    function test_Cancel_StopsFurtherRounds() public {
        vm.prank(owner);
        plan.cancel();
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector), PYTH_FEE, BTC_OUT);
        skip(30 days);
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector), PYTH_FEE, BTC_OUT);
    }

    function test_Cancel_NonOwnerReverts() public {
        address[4] memory callers = [keeper, other, address(factory), address(this)];
        for (uint256 i; i < 4; i++) {
            Snap memory s = _snap();
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(DcaPlan.Unauthorized.selector, callers[i]));
            plan.cancel();
            _assertUnchanged(s);
        }
    }

    function test_Cancel_SecondCallIsHarmlessAndCannotReviveRounds() public {
        vm.prank(owner);
        plan.cancel();
        uint256 ownerBefore = owner.balance;
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Cancelled(owner);
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 0, 0);
        vm.prank(owner);
        plan.cancel();
        assertEq(owner.balance, ownerBefore);
        assertEq(plan.roundsLeft(), 0);
        assertFalse(plan.isDue());
    }

    function test_Cancel_IncludesForcedValueAndDust() public {
        new ForceSender{value: 3e18}(payable(address(plan)));
        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        plan.cancel();
        assertEq(owner.balance - ownerBefore, DEPOSIT + 3e18);
    }

    function test_Cancel_AfterCompletionReturnsDust() public {
        DcaPlan p = _createPlan(owner, AMOUNT, 2, INTERVAL, DEV, 20e18 + 2 * 1e17 + 1);
        _runAll(p, 2);
        assertEq(address(p).balance, 1);
        uint256 ownerBefore = owner.balance;
        vm.prank(owner);
        p.cancel();
        assertEq(owner.balance - ownerBefore, 1);
    }

    function test_Cancel_OwnerRejects_StopsScheduleAndKeepsFunds() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = _planOwnedBy(o);
        o.setReject(true);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Cancelled(address(o));
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, 0);
        o.cancelPlan(); // must not revert
        assertEq(p.roundsLeft(), 0, "schedule stopped");
        assertFalse(p.isDue());
        assertEq(address(p).balance, DEPOSIT, "funds stay in the plan");
        assertEq(address(o).balance, 0);
        // the stopped schedule cannot run
        _fresh();
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector));
        p.executeRound{value: PYTH_FEE}(_swapCall(p, AMOUNT, BTC_OUT), _updates());
        skip(30 days);
        _fresh();
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector));
        p.executeRound{value: PYTH_FEE}(_swapCall(p, AMOUNT, BTC_OUT), _updates());
        // sweep while the owner still rejects: no revert, nothing paid
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, 0);
        p.sweep();
        assertEq(address(p).balance, DEPOSIT);
        // owner recovers: a later sweep by anyone pays everything exactly once
        o.setReject(false);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), DEPOSIT, 0);
        vm.prank(other);
        p.sweep();
        assertEq(address(o).balance, DEPOSIT);
        assertEq(address(p).balance, 0);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, 0);
        p.sweep();
        assertEq(address(o).balance, DEPOSIT);
    }

    function test_Cancel_OwnerRejects_ThenOwnerCancelsAgainToRecover() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = _planOwnedBy(o);
        o.setReject(true);
        o.cancelPlan();
        o.setReject(false);
        o.cancelPlan();
        assertEq(address(o).balance, DEPOSIT);
        assertEq(p.roundsLeft(), 0);
    }

    function test_Cancel_OwnerCannotReenterFromReceive() public {
        ReenterMode[3] memory modes = [ReenterMode.Cancel, ReenterMode.Sweep, ReenterMode.ExecuteRound];
        for (uint256 i; i < 3; i++) {
            DcaOwner o = new DcaOwner(factory);
            DcaPlan p = _planOwnedBy(o);
            o.setReenter(modes[i], false);
            o.cancelPlan();
            assertTrue(o.attempted());
            assertFalse(o.reentrySucceeded());
            assertEq(bytes4(o.reentryRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
            assertEq(address(o).balance, DEPOSIT);
            assertEq(address(p).balance, 0);
        }
    }

    function test_Cancel_OwnerBubbledReentryDoesNotRevertCancel() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = _planOwnedBy(o);
        o.setReenter(ReenterMode.Cancel, true); // owner reverts its own receive after the blocked re-entry
        o.cancelPlan();
        assertEq(p.roundsLeft(), 0);
        assertEq(address(p).balance, DEPOSIT, "payout failed, funds kept");
        assertFalse(o.attempted(), "owner's receive reverted, so its own bookkeeping rolled back");
    }

    // ───────────────────────── sweep ─────────────────────────

    function test_Sweep_RevertsWhileRoundsRemain() public {
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.PlanStillActive.selector, ROUNDS));
        plan.sweep();
        _exec();
        vm.expectRevert(abi.encodeWithSelector(DcaPlan.PlanStillActive.selector, ROUNDS - 1));
        vm.prank(other);
        plan.sweep();
        assertEq(address(plan).balance, DEPOSIT - uint256(AMOUNT) * 1e12 - TIP);
    }

    function test_Sweep_AfterCompletionSendsDustToOwnerNotCaller() public {
        DcaPlan p = _createPlan(owner, AMOUNT, 10, INTERVAL, DEV, DEPOSIT + 7);
        assertEq(p.tipPerRound(), TIP);
        _runAll(p, 10);
        assertEq(address(p).balance, 7);

        uint256 ownerBefore = owner.balance;
        uint256 otherBefore = other.balance;
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(owner, 7, 0);
        vm.prank(other);
        p.sweep();
        assertEq(owner.balance - ownerBefore, 7);
        assertEq(other.balance, otherBefore, "caller gets nothing");
        assertEq(address(p).balance, 0);
    }

    function test_Sweep_ReturnsUnspentUsdcFromUnderfilledRounds() public {
        adapter.setPullOverride(true, 9e6); // adapter only ever takes 9 of 10 USDC
        DcaPlan p = _createPlan(owner, AMOUNT, 2, INTERVAL, DEV, 20e18 + 0.2e18);
        _runAllWith(p, 2, 9e6);
        assertEq(address(p).balance, 2e18, "two unspent USDC remain");
        uint256 ownerBefore = owner.balance;
        p.sweep();
        assertEq(owner.balance - ownerBefore, 2e18);
    }

    function test_Sweep_AfterCancelReturnsLateForcedValue() public {
        vm.prank(owner);
        plan.cancel();
        new ForceSender{value: 1e18}(payable(address(plan)));
        uint256 ownerBefore = owner.balance;
        vm.prank(keeper);
        plan.sweep();
        assertEq(owner.balance - ownerBefore, 1e18);
        assertEq(address(plan).balance, 0);
    }

    function test_Sweep_EmptyBalanceSucceedsAndOwnerCanCall() public {
        vm.prank(owner);
        plan.cancel();
        vm.expectEmit(true, false, false, true, address(plan));
        emit DcaPlan.Swept(owner, 0, 0);
        vm.prank(owner);
        plan.sweep();
        plan.sweep();
    }

    function test_Sweep_DoesNotReviveRounds() public {
        vm.prank(owner);
        plan.cancel();
        plan.sweep();
        _expectExecRevert(abi.encodeWithSelector(DcaPlan.NoRoundsLeft.selector), PYTH_FEE, BTC_OUT);
    }

    function test_Sweep_OwnerRejects_DoesNotRevertAndKeepsFunds() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = _planOwnedBy(o);
        o.cancelPlan();
        new ForceSender{value: 1e18}(payable(address(p)));
        o.setReject(true);
        vm.expectEmit(true, false, false, true, address(p));
        emit DcaPlan.Swept(address(o), 0, 0);
        p.sweep();
        assertEq(address(p).balance, 1e18, "funds stay until owner accepts");
        o.setReject(false);
        p.sweep();
        assertEq(address(o).balance, 1e18 + DEPOSIT);
    }

    function test_Sweep_OwnerCannotReenter() public {
        DcaOwner o = new DcaOwner(factory);
        DcaPlan p = _planOwnedBy(o);
        o.cancelPlan();
        new ForceSender{value: 1e18}(payable(address(p)));
        o.setReenter(ReenterMode.Sweep, false);
        p.sweep();
        assertTrue(o.attempted());
        assertFalse(o.reentrySucceeded());
        assertEq(bytes4(o.reentryRevertData()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    // ───────────────────────── helpers ─────────────────────────

    function _planOwnedBy(DcaOwner o) internal returns (DcaPlan p) {
        p = DcaPlan(payable(o.create{value: DEPOSIT}(AMOUNT, ROUNDS, INTERVAL, DEV)));
        // after creating, owner's balance is 0 so receipts are easy to read
        assertEq(address(o).balance, 0);
    }

    function _runAll(DcaPlan p, uint256 n) internal {
        _runAllWith(p, n, AMOUNT);
    }

    function _runAllWith(DcaPlan p, uint256 n, uint256 usdcIn) internal {
        for (uint256 i; i < n; i++) {
            _fresh();
            vm.prank(keeper);
            p.executeRound{value: PYTH_FEE}(_swapCall(p, usdcIn, BTC_OUT), _updates());
            skip(INTERVAL);
        }
        assertEq(p.roundsLeft(), 0);
    }
}
