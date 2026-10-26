// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";

contract VaultFactoryAdminTest is VaultTestBase {
    function _unauthorized(address who) internal view returns (bytes memory) {
        return abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, who);
    }

    // ---------------------------------------------------------------- setFee

    function test_SetFee_OwnerUpdatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(factory));
        emit VaultFactory.FeeUpdated(FEE, 2 ether);
        vm.prank(owner);
        factory.setFee(2 ether);
        assertEq(factory.fee(), 2 ether);
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
        vm.expectRevert(VaultFactory.FeeExceedsMaximum.selector);
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
        vm.expectRevert(VaultFactory.InsufficientFee.selector);
        factory.createVault{value: FEE}();

        uint256 before = feeRecipient.balance;
        _create(alice, 3 ether);
        assertEq(feeRecipient.balance, before + 3 ether);
    }

    // ---------------------------------------------------------------- setFeeRecipient

    function test_SetFeeRecipient_OwnerUpdatesAndEmits() public {
        address newRec = makeAddr("newRec");
        vm.expectEmit(true, true, false, false, address(factory));
        emit VaultFactory.FeeRecipientUpdated(feeRecipient, newRec);
        vm.prank(owner);
        factory.setFeeRecipient(payable(newRec));
        assertEq(factory.feeRecipient(), newRec);
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

    function test_SetFeeRecipient_FeesGoToNewRecipient() public {
        address payable newRec = payable(makeAddr("newRec"));
        vm.prank(owner);
        factory.setFeeRecipient(newRec);
        uint256 oldBefore = feeRecipient.balance;
        _create(alice, FEE);
        assertEq(newRec.balance, FEE);
        assertEq(feeRecipient.balance, oldBefore);
    }

    // ---------------------------------------------------------------- ownership

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

    function test_TransferOwnership_StillWorks() public {
        vm.prank(owner);
        factory.transferOwnership(alice);
        assertEq(factory.owner(), alice);

        vm.prank(owner);
        vm.expectRevert(_unauthorized(owner));
        factory.setFee(0);

        vm.prank(alice);
        factory.setFee(0);
        assertEq(factory.fee(), 0);
    }

    function test_Constructor_RevertsZeroInitialOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new VaultFactory(address(impl), feeRecipient, FEE, address(0));
    }

    function test_Owner_HasNoPowerOverUserVault() public {
        VaultProxy v = _create(alice, FEE);
        vm.prank(alice);
        v.deposit{value: 1 ether}();

        vm.prank(owner);
        vm.expectRevert(VaultProxy.Unauthorized.selector);
        v.withdraw(1 ether, payable(owner));
        assertEq(v.getBalance(), 1 ether);
    }
}
