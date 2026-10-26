// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {RejectingReceiver, VaultActor} from "../test-helpers/Actors.sol";

contract VaultProxyTest is VaultTestBase {
    VaultProxy internal vault;

    function setUp() public override {
        super.setUp();
        vault = _create(alice, FEE);
    }

    // ---------------------------------------------------------------- initialize

    function test_Initialize_CloneRejectsReinit() public {
        vm.prank(attacker);
        vm.expectRevert(VaultProxy.AlreadyInitialized.selector);
        vault.initialize(attacker);
        assertEq(vault.owner(), alice);
    }

    function test_Initialize_OwnerCannotReinit() public {
        vm.prank(alice);
        vm.expectRevert(VaultProxy.AlreadyInitialized.selector);
        vault.initialize(bob);
    }

    function test_Initialize_ImplementationIsLocked() public {
        vm.prank(attacker);
        vm.expectRevert(VaultProxy.AlreadyInitialized.selector);
        impl.initialize(attacker);
        assertEq(impl.owner(), address(0));
    }

    function test_Initialize_RawCloneSetsOwnerOnce() public {
        VaultProxy raw = VaultProxy(payable(Clones.clone(address(impl))));
        assertEq(raw.owner(), address(0));
        raw.initialize(bob);
        assertEq(raw.owner(), bob);
        vm.expectRevert(VaultProxy.AlreadyInitialized.selector);
        raw.initialize(alice);
    }

    function test_Initialize_RevertsZeroOwner() public {
        VaultProxy raw = VaultProxy(payable(Clones.clone(address(impl))));
        vm.expectRevert(VaultProxy.ZeroOwner.selector);
        raw.initialize(address(0));
    }

    // ---------------------------------------------------------------- deposit / depositFor

    function test_Deposit_OwnerIncreasesBalanceAndEmits() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit VaultProxy.Deposited(alice, 5 ether);
        vm.prank(alice);
        vault.deposit{value: 5 ether}();
        assertEq(vault.getBalance(), 5 ether);
        assertEq(address(vault).balance, 5 ether);
    }

    function test_Deposit_RevertsNonOwner() public {
        vm.prank(bob);
        vm.expectRevert(VaultProxy.Unauthorized.selector);
        vault.deposit{value: 1 ether}();
    }

    function test_Deposit_RevertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(VaultProxy.ZeroAmount.selector);
        vault.deposit();
    }

    function test_DepositFor_AnyoneCanGift() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit VaultProxy.Deposited(bob, 2 ether);
        vm.prank(bob);
        vault.depositFor{value: 2 ether}();
        assertEq(vault.getBalance(), 2 ether);
        assertEq(vault.owner(), alice, "gift does not change owner");
    }

    function test_DepositFor_OwnerAlsoAllowed() public {
        vm.prank(alice);
        vault.depositFor{value: 1 ether}();
        assertEq(vault.getBalance(), 1 ether);
    }

    function test_DepositFor_RevertsZeroAmount() public {
        vm.prank(bob);
        vm.expectRevert(VaultProxy.ZeroAmount.selector);
        vault.depositFor();
    }

    function test_Receive_PlainSendReverts() public {
        vm.prank(bob);
        vm.expectRevert(VaultProxy.DirectDepositDisabled.selector);
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        ok;
        assertEq(vault.getBalance(), 0);
    }

    function test_Receive_PlainSendReturnsFalse() public {
        vm.prank(bob);
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(vault).balance, 0);
    }

    function test_Receive_ImplementationAlsoRejects() public {
        vm.prank(bob);
        (bool ok, ) = address(impl).call{value: 1}("");
        assertFalse(ok);
    }

    // ---------------------------------------------------------------- withdraw

    function _fund(uint256 amt) internal {
        vm.prank(alice);
        vault.deposit{value: amt}();
    }

    function test_Withdraw_OwnerToSelf() public {
        _fund(10 ether);
        uint256 before = alice.balance;
        vm.expectEmit(true, false, false, true, address(vault));
        emit VaultProxy.Withdrawn(alice, 4 ether);
        vm.prank(alice);
        vault.withdraw(4 ether, payable(alice));
        assertEq(alice.balance, before + 4 ether);
        assertEq(vault.getBalance(), 6 ether);
    }

    function test_Withdraw_ToDifferentAddress() public {
        _fund(10 ether);
        address payable dest = payable(makeAddr("dest"));
        vm.prank(alice);
        vault.withdraw(10 ether, dest);
        assertEq(dest.balance, 10 ether);
        assertEq(vault.getBalance(), 0);
    }

    function test_Withdraw_FullBalanceExactly() public {
        _fund(3 ether);
        vm.prank(alice);
        vault.withdraw(3 ether, payable(alice));
        assertEq(vault.getBalance(), 0);
    }

    function test_Withdraw_RevertsNonOwner() public {
        _fund(1 ether);
        vm.prank(bob);
        vm.expectRevert(VaultProxy.Unauthorized.selector);
        vault.withdraw(1 ether, payable(bob));
        assertEq(vault.getBalance(), 1 ether);
    }

    function test_Withdraw_RevertsZeroAmount() public {
        _fund(1 ether);
        vm.prank(alice);
        vm.expectRevert(VaultProxy.ZeroAmount.selector);
        vault.withdraw(0, payable(alice));
    }

    function test_Withdraw_RevertsOverBalance() public {
        _fund(1 ether);
        vm.prank(alice);
        vm.expectRevert(VaultProxy.InsufficientBalance.selector);
        vault.withdraw(1 ether + 1, payable(alice));
    }

    function test_Withdraw_RevertsEmptyVault() public {
        vm.prank(alice);
        vm.expectRevert(VaultProxy.InsufficientBalance.selector);
        vault.withdraw(1, payable(alice));
    }

    function test_Withdraw_RevertsZeroRecipient() public {
        _fund(1 ether);
        vm.prank(alice);
        vm.expectRevert(VaultProxy.ZeroRecipient.selector);
        vault.withdraw(1 ether, payable(address(0)));
    }

    function test_Withdraw_RevertsWhenRecipientRejects() public {
        _fund(1 ether);
        RejectingReceiver bad = new RejectingReceiver();
        vm.prank(alice);
        vm.expectRevert(VaultProxy.NativeTransferFailed.selector);
        vault.withdraw(1 ether, payable(address(bad)));
        assertEq(vault.getBalance(), 1 ether);
    }

    function test_Withdraw_ImplementationHasNoOwnerSoNobodyCanWithdraw() public {
        vm.prank(alice);
        vm.expectRevert(VaultProxy.Unauthorized.selector);
        impl.withdraw(1, payable(alice));
    }

    function test_Withdraw_VaultsAreIsolated() public {
        VaultProxy bobVault = _create(bob, FEE);
        _fund(2 ether);
        vm.prank(bob);
        bobVault.deposit{value: 1 ether}();

        vm.prank(alice);
        vm.expectRevert(VaultProxy.Unauthorized.selector);
        bobVault.withdraw(1 ether, payable(alice));
        assertEq(bobVault.getBalance(), 1 ether);
        assertEq(vault.getBalance(), 2 ether);
    }

    // ---------------------------------------------------------------- reentrancy on withdraw

    function test_Withdraw_ReentrancyBlocked() public {
        VaultActor actor = new VaultActor(factory);
        actor.create{value: FEE}();
        VaultProxy v = actor.vault();
        actor.deposit{value: 5 ether}();
        actor.setMode(VaultActor.Mode.ReenterWithdraw);

        actor.withdraw(2 ether, payable(address(actor)));

        assertTrue(actor.attempted(), "callback ran");
        assertFalse(actor.reentrySucceeded(), "re-entry must fail");
        assertEq(
            actor.revertData(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(v.getBalance(), 3 ether, "only one withdrawal happened");
        assertEq(address(actor).balance, 2 ether);
    }

    function test_Withdraw_ReentrantOwnerBubbleRevertsWholeWithdraw() public {
        // Owner contract that rejects value: whole withdraw reverts, funds stay.
        VaultActor actor = new VaultActor(factory);
        actor.create{value: FEE}();
        VaultProxy v = actor.vault();
        actor.deposit{value: 2 ether}();
        actor.setMode(VaultActor.Mode.Reject);
        vm.expectRevert(VaultProxy.NativeTransferFailed.selector);
        actor.withdraw(1 ether, payable(address(actor)));
        assertEq(v.getBalance(), 2 ether);
    }

    // ---------------------------------------------------------------- views

    function test_GetBalance_TracksDepositsAndGifts() public {
        assertEq(vault.getBalance(), 0);
        _fund(1 ether);
        vm.prank(bob);
        vault.depositFor{value: 2 ether}();
        assertEq(vault.getBalance(), 3 ether);
    }

    function test_MeetsMinimum() public {
        assertTrue(vault.meetsMinimum(0));
        assertFalse(vault.meetsMinimum(1));
        _fund(5 ether);
        assertTrue(vault.meetsMinimum(5 ether));
        assertFalse(vault.meetsMinimum(5 ether + 1));
        vm.prank(alice);
        vault.withdraw(1 ether, payable(alice));
        assertFalse(vault.meetsMinimum(5 ether));
        assertTrue(vault.meetsMinimum(4 ether));
    }

    function test_Owner_IsPermanentNoTransfer() public view {
        assertEq(vault.owner(), alice);
    }
}
