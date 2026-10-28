// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {RejectingReceiver, VaultActor} from "../test-helpers/Actors.sol";

contract VaultFactoryCreateTest is VaultTestBase {
    bytes32 internal constant VAULT_CREATED_SIG = keccak256("VaultCreated(address,address)");
    bytes32 internal constant RECEIVED_SIG = keccak256("Received(uint256)");

    // ---------------------------------------------------------------- constructor

    function test_Constructor_StoresConfig() public view {
        assertEq(factory.implementation(), address(impl));
        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(factory.fee(), FEE);
        assertEq(factory.owner(), owner);
        assertEq(factory.pendingOwner(), address(0));
        assertEq(factory.accruedFees(), 0);
        assertFalse(factory.creationPaused());
        assertEq(factory.MAX_FEE(), 10 ether);
    }

    function test_Constructor_AcceptsMaxFee() public {
        VaultFactory f = new VaultFactory(address(impl), feeRecipient, 10 ether, owner);
        assertEq(f.fee(), 10 ether);
    }

    function test_Constructor_AcceptsZeroFee() public {
        VaultFactory f = new VaultFactory(address(impl), feeRecipient, 0, owner);
        assertEq(f.fee(), 0);
    }

    function test_Constructor_RevertsZeroImplementation() public {
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InvalidImplementation.selector, address(0)));
        new VaultFactory(address(0), feeRecipient, FEE, owner);
    }

    function test_Constructor_RevertsNonContractImplementation() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InvalidImplementation.selector, eoa));
        new VaultFactory(eoa, feeRecipient, FEE, owner);
    }

    function test_CreateVault_RevertsWithStoredImplementationWhenCodeGone() public {
        // Implementation code disappearing after deployment must be reported with the stored address.
        vm.etch(address(impl), "");
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.InvalidImplementation.selector, address(impl))
        );
        factory.createVault{value: FEE}();
        assertFalse(factory.hasVault(alice));
        assertEq(factory.accruedFees(), 0);
    }

    function test_Constructor_RevertsZeroRecipient() public {
        vm.expectRevert(VaultFactory.ZeroFeeRecipient.selector);
        new VaultFactory(address(impl), payable(address(0)), FEE, owner);
    }

    function test_Constructor_RevertsFeeOverMax() public {
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.FeeTooHigh.selector, 10 ether + 1, 10 ether));
        new VaultFactory(address(impl), feeRecipient, 10 ether + 1, owner);
    }

    function test_Constructor_RevertsZeroInitialOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new VaultFactory(address(impl), feeRecipient, FEE, address(0));
    }

    // ---------------------------------------------------------------- createVault happy path

    function test_CreateVault_InitializesCloneToCaller() public {
        VaultProxy v = _create(alice, FEE);
        assertTrue(address(v) != address(0));
        assertTrue(address(v) != address(impl));
        assertEq(v.owner(), alice);
        assertEq(factory.getVault(alice), address(v));
        assertTrue(factory.hasVault(alice));
        assertEq(v.getBalance(), 0, "creation payment must not fund vault");
    }

    function test_CreateVault_FeeStaysInFactoryAndAccrues() public {
        uint256 recBefore = feeRecipient.balance;
        _create(alice, FEE);
        assertEq(feeRecipient.balance, recBefore, "recipient is not paid at creation");
        assertEq(address(factory).balance, FEE);
        assertEq(factory.accruedFees(), FEE);
    }

    function test_CreateVault_AccruedFeesAccumulate() public {
        _create(alice, FEE);
        vm.prank(owner);
        factory.setFee(2 ether);
        _create(bob, 2 ether);
        assertEq(factory.accruedFees(), 3 ether);
        assertEq(address(factory).balance, 3 ether);
    }

    function test_CreateVault_ExactFeeNoRefund() public {
        uint256 aliceBefore = alice.balance;
        _create(alice, FEE);
        assertEq(alice.balance, aliceBefore - FEE);
    }

    function test_CreateVault_RefundsExcess() public {
        uint256 aliceBefore = alice.balance;
        _create(alice, FEE + 3 ether);
        assertEq(alice.balance, aliceBefore - FEE, "alice pays only the fee");
        assertEq(address(factory).balance, FEE, "only the fee stays");
        assertEq(factory.accruedFees(), FEE);
    }

    function test_CreateVault_ZeroFeeRefundsEverything() public {
        vm.prank(owner);
        factory.setFee(0);
        uint256 aliceBefore = alice.balance;
        VaultProxy v = _create(alice, 2 ether);
        assertEq(alice.balance, aliceBefore);
        assertEq(address(factory).balance, 0);
        assertEq(factory.accruedFees(), 0);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_ZeroFeeZeroValue() public {
        vm.prank(owner);
        factory.setFee(0);
        VaultProxy v = _create(alice, 0);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_EmitsVaultCreated() public {
        vm.expectEmit(true, false, false, false, address(factory));
        emit VaultFactory.VaultCreated(alice, address(0)); // vault address unknown up front: only owner topic checked
        _create(alice, FEE);
    }

    function test_CreateVault_EmitsVaultCreatedExactlyOnceWithCorrectArgs() public {
        vm.recordLogs();
        VaultProxy v = _create(alice, FEE + 1 ether);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(_countLogs(logs, address(factory), VAULT_CREATED_SIG), 1, "exactly one VaultCreated");
        Vm.Log memory l = logs[_indexOfLog(logs, address(factory), VAULT_CREATED_SIG)];
        assertEq(address(uint160(uint256(l.topics[1]))), alice);
        assertEq(address(uint160(uint256(l.topics[2]))), address(v));
        assertEq(l.data.length, 0);
    }

    function test_CreateVault_DistinctVaultsPerWallet() public {
        VaultProxy a = _create(alice, FEE);
        VaultProxy b = _create(bob, FEE);
        assertTrue(address(a) != address(b));
        assertEq(a.owner(), alice);
        assertEq(b.owner(), bob);
    }

    function test_CreateVault_CloneIsIndependentOfImplementation() public {
        VaultProxy v = _create(alice, FEE);
        assertEq(impl.owner(), address(0));
        assertEq(v.owner(), alice);
    }

    // ---------------------------------------------------------------- event ordering vs refund

    function test_CreateVault_VaultCreatedEmittedBeforeRefundCall() public {
        VaultActor actor = new VaultActor(factory);
        vm.recordLogs();
        address v = actor.create{value: FEE + 2 ether}();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 created = _indexOfLog(logs, address(factory), VAULT_CREATED_SIG);
        uint256 refunded = _indexOfLog(logs, address(actor), RECEIVED_SIG);
        assertTrue(created != type(uint256).max, "VaultCreated emitted");
        assertTrue(refunded != type(uint256).max, "refund receiver was called");
        assertLt(created, refunded, "VaultCreated precedes the refund callback");
        assertEq(address(actor).balance, 2 ether);
        assertEq(v, factory.getVault(address(actor)));
    }

    function test_CreateVault_StateFinalBeforeRefundCallback() public {
        VaultActor actor = new VaultActor(factory);
        address v = actor.create{value: FEE + 1 ether}();
        assertEq(actor.vaultAtReceive(), v, "vault already registered when refund arrives");
        assertEq(actor.accruedAtReceive(), FEE, "fee already accrued when refund arrives");
    }

    // ---------------------------------------------------------------- createVault reverts

    function test_CreateVault_RevertsUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InsufficientFee.selector, FEE - 1, FEE));
        factory.createVault{value: FEE - 1}();
        assertFalse(factory.hasVault(alice));
        assertEq(factory.accruedFees(), 0);
    }

    function test_CreateVault_RevertsNoValueWhenFeeSet() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InsufficientFee.selector, 0, FEE));
        factory.createVault();
    }

    function test_CreateVault_SecondVaultSameWalletReverts() public {
        VaultProxy first = _create(alice, FEE);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.VaultAlreadyExists.selector, alice, address(first))
        );
        factory.createVault{value: FEE}();
        assertEq(factory.getVault(alice), address(first));
        assertEq(factory.accruedFees(), FEE, "failed second creation accrues nothing");
    }

    function test_CreateVault_RefundFailureRevertsWithContext() public {
        VaultActor actor = new VaultActor(factory);
        actor.setMode(VaultActor.Mode.Reject);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.RefundFailed.selector, address(actor), 1 ether)
        );
        actor.create{value: FEE + 1 ether}();

        assertFalse(factory.hasVault(address(actor)), "registry rolled back");
        assertEq(factory.accruedFees(), 0, "accrual rolled back");
        assertEq(address(factory).balance, 0);
    }

    function test_CreateVault_ContractCallerExactFeeNeedsNoRefund() public {
        VaultActor actor = new VaultActor(factory);
        actor.setMode(VaultActor.Mode.Reject); // never receives value at exact fee
        actor.create{value: FEE}();
        assertTrue(factory.hasVault(address(actor)));
        assertEq(VaultProxy(payable(factory.getVault(address(actor)))).owner(), address(actor));
    }

    // ---------------------------------------------------------------- fee recipient cannot block creation

    function test_CreateVault_RejectingFeeRecipientDoesNotBlockCreation() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(bad)));

        VaultProxy v = _create(alice, FEE + 1 ether);
        assertEq(v.owner(), alice);
        assertEq(factory.accruedFees(), FEE);
        assertEq(address(factory).balance, FEE);
        assertEq(address(bad).balance, 0);
    }

    function test_CreateVault_RevertingRecipientAtZeroFeeStillCreates() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.startPrank(owner);
        factory.setFeeRecipient(payable(address(bad)));
        factory.setFee(0);
        vm.stopPrank();
        VaultProxy v = _create(alice, 0);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_FeeRecipientNeverCalled() public {
        // A recipient address with no payable receive, and one that rejects: neither is touched.
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(this))); // test contract has no receive()
        VaultProxy v = _create(alice, FEE);
        assertEq(v.owner(), alice);
    }

    // ---------------------------------------------------------------- reentrancy through the refund

    function test_Reentrancy_RefundReentersCreateVault_Blocked() public {
        VaultActor actor = new VaultActor(factory);
        actor.setMode(VaultActor.Mode.ReenterFactory);

        address v = actor.create{value: FEE + 2 ether}();

        assertTrue(actor.attempted(), "refund callback ran");
        assertFalse(actor.reentrySucceeded(), "re-entry must fail");
        assertEq(
            actor.revertData(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(factory.getVault(address(actor)), v);
        assertEq(address(factory).balance, FEE);
        assertEq(factory.accruedFees(), FEE);
        assertEq(address(actor).balance, 2 ether);
    }

    function test_Reentrancy_RefundReentersWithdrawFees_Blocked() public {
        VaultActor actor = new VaultActor(factory);
        actor.setMode(VaultActor.Mode.ReenterWithdrawFees);
        uint256 recBefore = feeRecipient.balance;

        actor.create{value: FEE + 2 ether}();

        assertTrue(actor.attempted());
        assertFalse(actor.reentrySucceeded(), "withdrawFees during refund must fail");
        assertEq(
            actor.revertData(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(factory.accruedFees(), FEE, "fees untouched");
        assertEq(feeRecipient.balance, recBefore);
    }

    // ---------------------------------------------------------------- views

    function test_Views_NoVault() public view {
        assertFalse(factory.hasVault(alice));
        assertEq(factory.getVault(alice), address(0));
        assertFalse(factory.vaultMeetsMinimum(alice, 0));
        assertFalse(factory.vaultMeetsMinimum(alice, 1));
    }

    function test_VaultMeetsMinimum_ReflectsBalance() public {
        VaultProxy v = _create(alice, FEE);
        assertTrue(factory.vaultMeetsMinimum(alice, 0));
        assertFalse(factory.vaultMeetsMinimum(alice, 1));

        vm.prank(alice);
        v.deposit{value: 5 ether}();
        assertTrue(factory.vaultMeetsMinimum(alice, 5 ether));
        assertFalse(factory.vaultMeetsMinimum(alice, 5 ether + 1));
        assertFalse(factory.vaultMeetsMinimum(bob, 0), "bob has no vault");
    }

    function test_Views_HasAndGetVault() public {
        VaultProxy v = _create(alice, FEE);
        assertTrue(factory.hasVault(alice));
        assertEq(factory.getVault(alice), address(v));
        assertFalse(factory.hasVault(bob));
    }
}
