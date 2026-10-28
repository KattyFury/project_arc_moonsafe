// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {
    RejectingReceiver,
    ReentrantFeeRecipient,
    ForceSender,
    AcceptingReceiver
} from "../test-helpers/Actors.sol";
import {PingRecipient} from "../test-helpers/PingRecipient.sol";

contract VaultFactoryFeesTest is VaultTestBase {
    bytes32 internal constant FEES_WITHDRAWN_SIG = keccak256("FeesWithdrawn(address,uint256)");
    bytes32 internal constant PINGED_SIG = keccak256("Pinged(uint256)");
    uint256 internal constant ACCRUED = 2 * FEE;

    function setUp() public override {
        super.setUp();
        _create(alice, FEE);
        _create(bob, FEE);
    }

    function _guardRevert() internal pure returns (bytes memory) {
        return abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    // ---------------------------------------------------------------- happy path

    function test_WithdrawFees_SendsExactlyAccruedToRecipient() public {
        assertEq(factory.accruedFees(), ACCRUED);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED);
        assertEq(factory.accruedFees(), 0);
        assertEq(address(factory).balance, 0);
    }

    function test_WithdrawFees_AnyoneCanCallAndCallerGetsNothing() public {
        uint256 callerBefore = attacker.balance;
        vm.prank(attacker);
        factory.withdrawFees();
        assertEq(attacker.balance, callerBefore, "caller is not paid");
        assertEq(feeRecipient.balance, ACCRUED);
    }

    function test_WithdrawFees_RecipientItselfCanCall() public {
        vm.prank(feeRecipient);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED);
    }

    function test_WithdrawFees_EmitsFeesWithdrawn() public {
        vm.expectEmit(true, false, false, true, address(factory));
        emit VaultFactory.FeesWithdrawn(feeRecipient, ACCRUED);
        factory.withdrawFees();
    }

    function test_WithdrawFees_EmitsExactlyOneEventWithArgs() public {
        vm.recordLogs();
        factory.withdrawFees();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_countLogs(logs, address(factory), FEES_WITHDRAWN_SIG), 1);
        Vm.Log memory l = logs[_indexOfLog(logs, address(factory), FEES_WITHDRAWN_SIG)];
        assertEq(address(uint160(uint256(l.topics[1]))), feeRecipient);
        assertEq(abi.decode(l.data, (uint256)), ACCRUED);
    }

    function test_WithdrawFees_AccruesAgainAfterWithdraw() public {
        factory.withdrawFees();
        address carol = makeAddr("carol");
        vm.deal(carol, 5 ether);
        _create(carol, FEE);
        assertEq(factory.accruedFees(), FEE);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED + FEE);
    }

    function test_WithdrawFees_ExcessRefundIsNotWithdrawn() public {
        address carol = makeAddr("carol");
        vm.deal(carol, 10 ether);
        _create(carol, FEE + 4 ether);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED + FEE);
        assertEq(carol.balance, 10 ether - FEE);
    }

    function test_WithdrawFees_FeeChangeAfterAccrualDoesNotAffectAmount() public {
        vm.prank(owner);
        factory.setFee(0);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED);
    }

    function test_WithdrawFees_UsesCurrentRecipient() public {
        address payable newRec = payable(makeAddr("newRec"));
        vm.prank(owner);
        factory.setFeeRecipient(newRec);
        factory.withdrawFees();
        assertEq(newRec.balance, ACCRUED);
        assertEq(feeRecipient.balance, 0);
    }

    // ---------------------------------------------------------------- NoFeesAccrued

    function test_WithdrawFees_RevertsWhenNothingAccrued() public {
        factory.withdrawFees();
        vm.expectRevert(VaultFactory.NoFeesAccrued.selector);
        factory.withdrawFees();
    }

    function test_WithdrawFees_RevertsOnFreshFactory() public {
        VaultFactory f = new VaultFactory(address(impl), feeRecipient, FEE, owner);
        vm.expectRevert(VaultFactory.NoFeesAccrued.selector);
        f.withdrawFees();
    }

    function test_WithdrawFees_ZeroFeeVaultsAccrueNothing() public {
        factory.withdrawFees();
        vm.prank(owner);
        factory.setFee(0);
        _create(attacker, 0);
        vm.expectRevert(VaultFactory.NoFeesAccrued.selector);
        factory.withdrawFees();
    }

    // ---------------------------------------------------------------- forced value

    function test_WithdrawFees_ForcedValueIsNotWithdrawable() public {
        new ForceSender{value: 5 ether}(payable(address(factory)));
        assertEq(address(factory).balance, ACCRUED + 5 ether);
        assertEq(factory.accruedFees(), ACCRUED, "forced value is not accounted as fees");

        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED, "only accrued fees are sent");
        assertEq(address(factory).balance, 5 ether, "forced value stays stuck");
        assertEq(factory.accruedFees(), 0);
    }

    function test_WithdrawFees_OnlyForcedValueRevertsNoFeesAccrued() public {
        factory.withdrawFees();
        new ForceSender{value: 3 ether}(payable(address(factory)));
        vm.expectRevert(VaultFactory.NoFeesAccrued.selector);
        factory.withdrawFees();
        assertEq(address(factory).balance, 3 ether);
    }

    function test_Factory_PlainNativeTransferRejected() public {
        vm.prank(alice);
        (bool ok, ) = address(factory).call{value: 1 ether}("");
        assertFalse(ok, "factory has no receive/fallback");
    }

    // ---------------------------------------------------------------- failing recipient

    function test_WithdrawFees_RejectingRecipientRevertsWithContextAndRollsBack() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(bad)));

        // The event is now emitted BEFORE the native call; the failed call reverts the whole tx.
        // vm.getRecordedLogs still returns logs of reverted frames, so assert state, not log absence.
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.WithdrawFeesFailed.selector, address(bad), ACCRUED)
        );
        factory.withdrawFees();

        assertEq(factory.accruedFees(), ACCRUED, "accruedFees restored");
        assertEq(address(factory).balance, ACCRUED, "factory balance unchanged");
        assertEq(address(bad).balance, 0, "recipient balance unchanged");
        assertEq(feeRecipient.balance, 0, "previous recipient not paid");
    }

    function test_WithdrawFees_FailedWithdrawalCanBeRetriedAfterRecipientFixed() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(bad)));
        vm.expectRevert();
        factory.withdrawFees();

        vm.prank(owner);
        factory.setFeeRecipient(feeRecipient);
        vm.expectEmit(true, false, false, true, address(factory));
        emit VaultFactory.FeesWithdrawn(feeRecipient, ACCRUED);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED);
        assertEq(factory.accruedFees(), 0);
    }

    // ---------------------------------------------------------------- event ordering

    function test_WithdrawFees_FeesWithdrawnEmittedBeforeRecipientCallback() public {
        PingRecipient ping = new PingRecipient();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(ping)));

        vm.recordLogs();
        factory.withdrawFees();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 feesIdx = _indexOfLog(logs, address(factory), FEES_WITHDRAWN_SIG);
        uint256 pingIdx = _indexOfLog(logs, address(ping), PINGED_SIG);
        assertTrue(feesIdx != type(uint256).max, "FeesWithdrawn emitted");
        assertTrue(pingIdx != type(uint256).max, "callback event emitted");
        assertLt(feesIdx, pingIdx, "FeesWithdrawn precedes recipient callback");
        assertEq(_countLogs(logs, address(factory), FEES_WITHDRAWN_SIG), 1);
        assertEq(address(uint160(uint256(logs[feesIdx].topics[1]))), address(ping));
        assertEq(abi.decode(logs[feesIdx].data, (uint256)), ACCRUED);
        assertEq(abi.decode(logs[pingIdx].data, (uint256)), ACCRUED);
        assertEq(address(ping).balance, ACCRUED);
    }

    function test_WithdrawFees_ExpectEmitOrderFeesWithdrawnThenCallback() public {
        PingRecipient ping = new PingRecipient();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(ping)));

        // expectEmit matches in order: FeesWithdrawn first, then the callback's Pinged.
        vm.expectEmit(true, false, false, true, address(factory));
        emit VaultFactory.FeesWithdrawn(address(ping), ACCRUED);
        vm.expectEmit(false, false, false, true, address(ping));
        emit PingRecipient.Pinged(ACCRUED);
        factory.withdrawFees();
    }

    function test_WithdrawFees_RecipientWithoutReceiveFails() public {
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(this))); // test contract cannot receive value
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.WithdrawFeesFailed.selector, address(this), ACCRUED)
        );
        factory.withdrawFees();
    }

    function test_WithdrawFees_WorksAfterOwnerReplacesBadRecipient() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(bad)));
        _create(attacker, FEE); // creation is not blocked by the bad recipient
        assertEq(factory.accruedFees(), ACCRUED + FEE);

        vm.expectRevert();
        factory.withdrawFees();

        address payable good = payable(address(new AcceptingReceiver()));
        vm.prank(owner);
        factory.setFeeRecipient(good);
        factory.withdrawFees();

        assertEq(good.balance, ACCRUED + FEE, "all fees accrued while bad are recovered");
        assertEq(factory.accruedFees(), 0);
        assertEq(address(factory).balance, 0);
    }

    function test_WithdrawFees_RecoversWhenRecipientStopsRejecting() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.startPrank(owner);
        factory.setFeeRecipient(payable(address(bad)));
        factory.setFeeRecipient(feeRecipient);
        vm.stopPrank();
        factory.withdrawFees();
        assertEq(feeRecipient.balance, ACCRUED);
    }

    // ---------------------------------------------------------------- reentrancy

    function _installReentrantRecipient(ReentrantFeeRecipient.Mode m, bool bubble)
        internal
        returns (ReentrantFeeRecipient rec)
    {
        rec = new ReentrantFeeRecipient();
        rec.setFactory(factory);
        rec.setMode(m);
        rec.setBubble(bubble);
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(rec)));
    }

    function test_WithdrawFees_ReentrantWithdrawFeesBlocked() public {
        ReentrantFeeRecipient rec = _installReentrantRecipient(ReentrantFeeRecipient.Mode.WithdrawFees, false);
        factory.withdrawFees();

        assertTrue(rec.attempted(), "callback ran");
        assertFalse(rec.reentrySucceeded());
        assertEq(rec.revertData(), _guardRevert(), "blocked by nonReentrant, not by NoFeesAccrued");
        assertEq(address(rec).balance, ACCRUED, "paid exactly once");
        assertEq(address(factory).balance, 0);
        assertEq(factory.accruedFees(), 0);
    }

    function test_WithdrawFees_ReentrantCreateVaultBlocked() public {
        ReentrantFeeRecipient rec = _installReentrantRecipient(ReentrantFeeRecipient.Mode.CreateVault, false);
        factory.withdrawFees();

        assertTrue(rec.attempted());
        assertFalse(rec.reentrySucceeded());
        assertEq(rec.revertData(), _guardRevert());
        assertFalse(factory.hasVault(address(rec)));
        assertEq(address(factory).balance, 0);
        assertEq(address(rec).balance, ACCRUED);
    }

    function test_WithdrawFees_ReentrantBubbleRollsEverythingBack() public {
        ReentrantFeeRecipient rec = _installReentrantRecipient(ReentrantFeeRecipient.Mode.WithdrawFees, true);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.WithdrawFeesFailed.selector, address(rec), ACCRUED)
        );
        factory.withdrawFees();
        assertEq(factory.accruedFees(), ACCRUED);
        assertEq(address(factory).balance, ACCRUED);
    }

    function test_WithdrawFees_CounterZeroedBeforeTransfer() public {
        ReentrantFeeRecipient rec = _installReentrantRecipient(ReentrantFeeRecipient.Mode.WithdrawFees, false);
        factory.withdrawFees();
        assertEq(rec.accruedAtReceive(), 0, "accruedFees already 0 when recipient is called");
    }
}
