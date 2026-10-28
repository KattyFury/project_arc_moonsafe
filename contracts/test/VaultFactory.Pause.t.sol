// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";

contract VaultFactoryPauseTest is VaultTestBase {
    function _pause() internal {
        vm.prank(owner);
        factory.setCreationPaused(true);
    }

    function test_SetCreationPaused_OwnerTogglesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(factory));
        emit VaultFactory.CreationPausedSet(true);
        vm.prank(owner);
        factory.setCreationPaused(true);
        assertTrue(factory.creationPaused());

        vm.expectEmit(false, false, false, true, address(factory));
        emit VaultFactory.CreationPausedSet(false);
        vm.prank(owner);
        factory.setCreationPaused(false);
        assertFalse(factory.creationPaused());
    }

    function test_SetCreationPaused_RevertsNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        factory.setCreationPaused(true);
        assertFalse(factory.creationPaused());
    }

    function test_SetCreationPaused_PendingOwnerCannotCall() public {
        vm.prank(owner);
        factory.transferOwnership(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        factory.setCreationPaused(true);
    }

    function test_CreateVault_RevertsWhilePaused() public {
        _pause();
        vm.prank(alice);
        vm.expectRevert(VaultFactory.CreationPaused.selector);
        factory.createVault{value: FEE}();
        assertFalse(factory.hasVault(alice));
        assertEq(factory.accruedFees(), 0);
        assertEq(address(factory).balance, 0);
    }

    function test_CreateVault_PausedTakesPrecedenceOverOtherChecks() public {
        _pause();
        vm.prank(alice);
        vm.expectRevert(VaultFactory.CreationPaused.selector);
        factory.createVault(); // would otherwise be InsufficientFee
    }

    function test_CreateVault_ResumesAfterUnpause() public {
        _pause();
        vm.prank(owner);
        factory.setCreationPaused(false);
        VaultProxy v = _create(alice, FEE);
        assertEq(v.owner(), alice);
    }

    function test_Pause_ExistingVaultsUnaffected() public {
        VaultProxy v = _create(alice, FEE);
        _pause();

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        v.deposit{value: 5 ether}();
        vm.prank(bob);
        v.depositFor{value: 2 ether}();
        assertEq(v.getBalance(), 7 ether);

        vm.prank(alice);
        v.withdraw(3 ether, payable(alice));
        assertEq(v.getBalance(), 4 ether);
        assertEq(alice.balance, aliceBefore - 5 ether + 3 ether);

        assertTrue(factory.vaultMeetsMinimum(alice, 4 ether));
        assertEq(factory.getVault(alice), address(v));
    }

    function test_Pause_DoesNotBlockWithdrawFees() public {
        _create(alice, FEE);
        _pause();
        factory.withdrawFees();
        assertEq(feeRecipient.balance, FEE);
        assertEq(factory.accruedFees(), 0);
    }

    function test_Pause_AdminSettersStillWork() public {
        _pause();
        vm.startPrank(owner);
        factory.setFee(2 ether);
        factory.setFeeRecipient(payable(bob));
        vm.stopPrank();
        assertEq(factory.fee(), 2 ether);
        assertEq(factory.feeRecipient(), bob);
    }
}
