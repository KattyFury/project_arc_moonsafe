// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {
    RejectingReceiver,
    ReentrantFeeRecipient,
    VaultActor
} from "../test-helpers/Actors.sol";

contract VaultFactoryCreateTest is VaultTestBase {
    // ---------------------------------------------------------------- constructor

    function test_Constructor_StoresConfig() public view {
        assertEq(factory.implementation(), address(impl));
        assertEq(factory.feeRecipient(), feeRecipient);
        assertEq(factory.fee(), FEE);
        assertEq(factory.owner(), owner);
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
        vm.expectRevert(VaultFactory.InvalidImplementation.selector);
        new VaultFactory(address(0), feeRecipient, FEE, owner);
    }

    function test_Constructor_RevertsNonContractImplementation() public {
        vm.expectRevert(VaultFactory.InvalidImplementation.selector);
        new VaultFactory(makeAddr("eoa"), feeRecipient, FEE, owner);
    }

    function test_Constructor_RevertsZeroRecipient() public {
        vm.expectRevert(VaultFactory.ZeroFeeRecipient.selector);
        new VaultFactory(address(impl), payable(address(0)), FEE, owner);
    }

    function test_Constructor_RevertsFeeOverMax() public {
        vm.expectRevert(VaultFactory.FeeExceedsMaximum.selector);
        new VaultFactory(address(impl), feeRecipient, 10 ether + 1, owner);
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

    function test_CreateVault_ForwardsFeeToRecipient() public {
        uint256 before = feeRecipient.balance;
        _create(alice, FEE);
        assertEq(feeRecipient.balance, before + FEE);
        assertEq(address(factory).balance, 0);
    }

    function test_CreateVault_ExactFeeNoRefund() public {
        uint256 aliceBefore = alice.balance;
        _create(alice, FEE);
        assertEq(alice.balance, aliceBefore - FEE);
    }

    function test_CreateVault_RefundsExcess() public {
        uint256 aliceBefore = alice.balance;
        uint256 recBefore = feeRecipient.balance;
        _create(alice, FEE + 3 ether);
        assertEq(alice.balance, aliceBefore - FEE, "alice pays only the fee");
        assertEq(feeRecipient.balance, recBefore + FEE);
        assertEq(address(factory).balance, 0);
    }

    function test_CreateVault_ZeroFeeRefundsEverything() public {
        vm.prank(owner);
        factory.setFee(0);
        uint256 aliceBefore = alice.balance;
        uint256 recBefore = feeRecipient.balance;
        VaultProxy v = _create(alice, 2 ether);
        assertEq(alice.balance, aliceBefore);
        assertEq(feeRecipient.balance, recBefore);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_ZeroFeeZeroValue() public {
        vm.prank(owner);
        factory.setFee(0);
        VaultProxy v = _create(alice, 0);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_EmitsVaultCreated() public {
        vm.recordLogs();
        VaultProxy v = _create(alice, FEE + 1 ether);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 sig = keccak256("VaultCreated(address,address)");
        uint256 found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(factory) && logs[i].topics[0] == sig) {
                found++;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), alice);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), address(v));
            }
        }
        assertEq(found, 1, "exactly one VaultCreated");
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

    // ---------------------------------------------------------------- createVault reverts

    function test_CreateVault_RevertsUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(VaultFactory.InsufficientFee.selector);
        factory.createVault{value: FEE - 1}();
        assertFalse(factory.hasVault(alice));
    }

    function test_CreateVault_RevertsNoValueWhenFeeSet() public {
        vm.prank(alice);
        vm.expectRevert(VaultFactory.InsufficientFee.selector);
        factory.createVault();
    }

    function test_CreateVault_SecondVaultSameWalletReverts() public {
        VaultProxy first = _create(alice, FEE);
        vm.prank(alice);
        vm.expectRevert(VaultFactory.VaultAlreadyExists.selector);
        factory.createVault{value: FEE}();
        assertEq(factory.getVault(alice), address(first));
    }

    function test_CreateVault_FeeRecipientRejectingReverts() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(bad)));

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        vm.expectRevert(VaultFactory.FeeTransferFailed.selector);
        factory.createVault{value: FEE}();
        assertFalse(factory.hasVault(alice), "state rolled back");
        assertEq(alice.balance, aliceBefore);
    }

    function test_CreateVault_RejectingRecipientIsRecoverable() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.startPrank(owner);
        factory.setFeeRecipient(payable(address(bad)));
        factory.setFeeRecipient(feeRecipient);
        vm.stopPrank();
        VaultProxy v = _create(alice, FEE);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_RejectingRecipientIrrelevantAtZeroFee() public {
        RejectingReceiver bad = new RejectingReceiver();
        vm.startPrank(owner);
        factory.setFeeRecipient(payable(address(bad)));
        factory.setFee(0);
        vm.stopPrank();
        VaultProxy v = _create(alice, 0);
        assertEq(v.owner(), alice);
    }

    function test_CreateVault_RefundFailureReverts() public {
        VaultActor actor = new VaultActor(factory);
        actor.setMode(VaultActor.Mode.Reject);
        vm.deal(address(actor), 0);
        vm.deal(alice, 10 ether);

        vm.prank(alice);
        vm.expectRevert(VaultFactory.RefundFailed.selector);
        actor.create{value: FEE + 1 ether}();

        assertFalse(factory.hasVault(address(actor)));
        assertEq(feeRecipient.balance, 0, "fee payment rolled back");
    }

    function test_CreateVault_ContractCallerExactFeeNeedsNoRefund() public {
        VaultActor actor = new VaultActor(factory);
        actor.setMode(VaultActor.Mode.Reject); // never receives value at exact fee
        actor.create{value: FEE}();
        assertTrue(factory.hasVault(address(actor)));
        assertEq(VaultProxy(payable(factory.getVault(address(actor)))).owner(), address(actor));
    }

    // ---------------------------------------------------------------- reentrancy

    function test_Reentrancy_CallerReentersViaRefund_Blocked() public {
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
        assertEq(address(factory).balance, 0);
        // actor was refunded its 2 ether excess and paid exactly the fee
        assertEq(address(actor).balance, 2 ether);
    }

    function test_Reentrancy_FeeRecipientReentersSwallowed_Blocked() public {
        ReentrantFeeRecipient rec = new ReentrantFeeRecipient();
        rec.setFactory(factory);
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(rec)));

        VaultProxy v = _create(alice, FEE);

        assertTrue(rec.attempted());
        assertFalse(rec.reentrySucceeded());
        assertEq(
            rec.revertData(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(v.owner(), alice);
        // recipient keeps the fee (it forwarded it into the failed call, which reverted)
        assertEq(address(rec).balance, FEE);
        assertEq(address(factory).balance, 0);
        assertFalse(factory.hasVault(address(rec)));
    }

    function test_Reentrancy_FeeRecipientReentersBubbled_FeeTransferFailed() public {
        ReentrantFeeRecipient rec = new ReentrantFeeRecipient();
        rec.setFactory(factory);
        rec.setBubble(true);
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(rec)));

        vm.prank(alice);
        vm.expectRevert(VaultFactory.FeeTransferFailed.selector);
        factory.createVault{value: FEE}();
        assertFalse(factory.hasVault(alice));
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
