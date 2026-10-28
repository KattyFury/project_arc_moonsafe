// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";

contract VaultFactoryAdminTest is VaultTestBase {
    function _unauthorized(address who) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, who);
    }

    // ---------------------------------------------------------------- setFee

    function test_SetFee_OwnerUpdatesAndEmitsOldAndNew() public {
        vm.expectEmit(false, false, false, true, address(factory));
        emit VaultFactory.FeeUpdated(FEE, 2 ether);
        vm.prank(owner);
        factory.setFee(2 ether);
        assertEq(factory.fee(), 2 ether);
    }

    function test_SetFee_EmitsPreviousValueOnSecondUpdate() public {
        vm.startPrank(owner);
        factory.setFee(2 ether);
        vm.expectEmit(false, false, false, true, address(factory));
        emit VaultFactory.FeeUpdated(2 ether, 0);
        factory.setFee(0);
        vm.stopPrank();
    }

    function test_SetFee_AllowsMaxAndZero() public {
        vm.startPrank(owner);
        factory.setFee(10 ether);
        assertEq(factory.fee(), 10 ether);
        factory.setFee(0);
        assertEq(factory.fee(), 0);
        vm.stopPrank();
    }

    function test_SetFee_RevertsAboveMax() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.FeeTooHigh.selector, 10 ether + 1, 10 ether));
        factory.setFee(10 ether + 1);
        assertEq(factory.fee(), FEE);
    }

    function test_SetFee_RevertsNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(_unauthorized(attacker));
        factory.setFee(0);
    }

    function test_SetFee_AppliesToFutureVaults() public {
        vm.prank(owner);
        factory.setFee(3 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VaultFactory.InsufficientFee.selector, FEE, 3 ether));
        factory.createVault{value: FEE}();

        _create(alice, 3 ether);
        assertEq(factory.accruedFees(), 3 ether);
    }

    function test_SetFee_DoesNotChangeAlreadyAccruedFees() public {
        _create(alice, FEE);
        vm.prank(owner);
        factory.setFee(0);
        assertEq(factory.accruedFees(), FEE);
    }

    // ---------------------------------------------------------------- setFeeRecipient

    function test_SetFeeRecipient_OwnerUpdatesAndEmitsOldAndNew() public {
        address newRec = makeAddr("newRec");
        vm.expectEmit(true, true, false, false, address(factory));
        emit VaultFactory.FeeRecipientUpdated(feeRecipient, newRec);
        vm.prank(owner);
        factory.setFeeRecipient(payable(newRec));
        assertEq(factory.feeRecipient(), newRec);
    }

    function test_SetFeeRecipient_EmitsPreviousOnSecondUpdate() public {
        address r1 = makeAddr("r1");
        address r2 = makeAddr("r2");
        vm.startPrank(owner);
        factory.setFeeRecipient(payable(r1));
        vm.expectEmit(true, true, false, false, address(factory));
        emit VaultFactory.FeeRecipientUpdated(r1, r2);
        factory.setFeeRecipient(payable(r2));
        vm.stopPrank();
    }

    function test_SetFeeRecipient_RevertsZero() public {
        vm.prank(owner);
        vm.expectRevert(VaultFactory.ZeroFeeRecipient.selector);
        factory.setFeeRecipient(payable(address(0)));
        assertEq(factory.feeRecipient(), feeRecipient);
    }

    function test_SetFeeRecipient_RevertsNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(_unauthorized(attacker));
        factory.setFeeRecipient(payable(attacker));
    }

    function test_SetFeeRecipient_AccruedFeesGoToNewRecipient() public {
        address payable newRec = payable(makeAddr("newRec"));
        _create(alice, FEE);
        vm.prank(owner);
        factory.setFeeRecipient(newRec);
        factory.withdrawFees();
        assertEq(newRec.balance, FEE);
        assertEq(feeRecipient.balance, 0);
    }

    // ---------------------------------------------------------------- Ownable2Step

    function test_TransferOwnership_OnlySetsPendingOwner() public {
        vm.expectEmit(true, true, false, false, address(factory));
        emit Ownable2Step.OwnershipTransferStarted(owner, alice);
        vm.prank(owner);
        factory.transferOwnership(alice);

        assertEq(factory.owner(), owner, "owner unchanged until accepted");
        assertEq(factory.pendingOwner(), alice);

        // current owner keeps full control; pending owner has none yet
        vm.prank(alice);
        vm.expectRevert(_unauthorized(alice));
        factory.setFee(0);
        vm.prank(owner);
        factory.setFee(0);
    }

    function test_AcceptOwnership_PendingOwnerCompletesTransfer() public {
        vm.prank(owner);
        factory.transferOwnership(alice);

        vm.expectEmit(true, true, false, false, address(factory));
        emit Ownable.OwnershipTransferred(owner, alice);
        vm.prank(alice);
        factory.acceptOwnership();

        assertEq(factory.owner(), alice);
        assertEq(factory.pendingOwner(), address(0));

        vm.prank(owner);
        vm.expectRevert(_unauthorized(owner));
        factory.setFee(0);
        vm.prank(alice);
        factory.setFee(0);
        assertEq(factory.fee(), 0);
    }

    function test_AcceptOwnership_RevertsForNonPendingCaller() public {
        vm.prank(owner);
        factory.transferOwnership(alice);

        vm.prank(attacker);
        vm.expectRevert(_unauthorized(attacker));
        factory.acceptOwnership();

        vm.prank(owner);
        vm.expectRevert(_unauthorized(owner));
        factory.acceptOwnership();

        assertEq(factory.owner(), owner);
        assertEq(factory.pendingOwner(), alice);
    }

    function test_AcceptOwnership_RevertsWhenNothingPending() public {
        vm.prank(alice);
        vm.expectRevert(_unauthorized(alice));
        factory.acceptOwnership();
        assertEq(factory.owner(), owner);
    }

    function test_TransferOwnership_RevertsNonOwner() public {
        vm.prank(attacker);
        vm.expectRevert(_unauthorized(attacker));
        factory.transferOwnership(attacker);
        assertEq(factory.pendingOwner(), address(0));
    }

    function test_TransferOwnership_NewProposalReplacesPending() public {
        vm.startPrank(owner);
        factory.transferOwnership(alice);
        factory.transferOwnership(bob);
        vm.stopPrank();
        assertEq(factory.pendingOwner(), bob);

        vm.prank(alice);
        vm.expectRevert(_unauthorized(alice));
        factory.acceptOwnership();

        vm.prank(bob);
        factory.acceptOwnership();
        assertEq(factory.owner(), bob);
    }

    function test_TransferOwnership_ZeroCancelsPending() public {
        vm.startPrank(owner);
        factory.transferOwnership(alice);
        factory.transferOwnership(address(0));
        vm.stopPrank();
        assertEq(factory.pendingOwner(), address(0));
        vm.prank(alice);
        vm.expectRevert(_unauthorized(alice));
        factory.acceptOwnership();
        assertEq(factory.owner(), owner);
    }

    function test_AcceptOwnership_NewOwnerCanManageRecipientAndPause() public {
        vm.prank(owner);
        factory.transferOwnership(alice);
        vm.startPrank(alice);
        factory.acceptOwnership();
        factory.setFeeRecipient(payable(bob));
        factory.setCreationPaused(true);
        vm.stopPrank();
        assertEq(factory.feeRecipient(), bob);
        assertTrue(factory.creationPaused());
    }

    function test_RenounceOwnership_OwnerReverts() public {
        vm.prank(owner);
        vm.expectRevert(VaultFactory.RenounceDisabled.selector);
        factory.renounceOwnership();
        assertEq(factory.owner(), owner);
    }

    function test_RenounceOwnership_NonOwnerReverts() public {
        vm.prank(attacker);
        vm.expectRevert(_unauthorized(attacker));
        factory.renounceOwnership();
        assertEq(factory.owner(), owner);
    }

    function test_Owner_HasNoPowerOverUserVault() public {
        VaultProxy v = _create(alice, FEE);
        vm.prank(alice);
        v.deposit{value: 1 ether}();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(VaultProxy.Unauthorized.selector, owner));
        v.withdraw(1 ether, payable(owner));
        assertEq(v.getBalance(), 1 ether);
    }
}
