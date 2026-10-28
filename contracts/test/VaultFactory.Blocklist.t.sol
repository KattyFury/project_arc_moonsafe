// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {BlocklistableAccount} from "../test-helpers/Actors.sol";

/// @dev Models the Arc/Circle blocklist: a blocklisted address cannot receive native value
/// (any transfer to it reverts). `BlocklistableAccount.receive()` reverts while `blocked`.
contract VaultFactoryBlocklistTest is VaultTestBase {
    BlocklistableAccount internal acct;

    function setUp() public override {
        super.setUp();
        acct = new BlocklistableAccount(factory);
        vm.deal(address(acct), 100 ether);
    }

    // ---------------------------------------------------------------- blocklisted fee recipient

    function test_BlockedRecipient_DoesNotBlockCreation_OnlyWithdrawal() public {
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(acct)));
        acct.setBlocked(true);

        VaultProxy v = _create(alice, FEE + 1 ether);
        VaultProxy v2 = _create(bob, FEE);
        assertEq(v.owner(), alice);
        assertEq(v2.owner(), bob);
        assertEq(factory.accruedFees(), 2 * FEE);

        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.WithdrawFeesFailed.selector, address(acct), 2 * FEE)
        );
        factory.withdrawFees();
        assertEq(factory.accruedFees(), 2 * FEE);
    }

    function test_BlockedRecipient_FeesRecoverableByReplacement() public {
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(acct)));
        acct.setBlocked(true);
        _create(alice, FEE);

        vm.prank(owner);
        factory.setFeeRecipient(feeRecipient);
        factory.withdrawFees();
        assertEq(feeRecipient.balance, FEE);
    }

    function test_BlockedRecipient_UnblockedLaterGetsPaid() public {
        vm.prank(owner);
        factory.setFeeRecipient(payable(address(acct)));
        acct.setBlocked(true);
        _create(alice, FEE);

        acct.setBlocked(false);
        uint256 before = address(acct).balance;
        factory.withdrawFees();
        assertEq(address(acct).balance, before + FEE);
    }

    // ---------------------------------------------------------------- blocklisted payer

    function test_BlockedPayer_ExactFeeSucceeds() public {
        acct.setBlocked(true);
        address v = acct.create{value: FEE}();
        assertEq(VaultProxy(payable(v)).owner(), address(acct));
        assertEq(factory.accruedFees(), FEE);
    }

    function test_BlockedPayer_ExcessRefundFailsAndNothingIsCreated() public {
        acct.setBlocked(true);
        uint256 before = address(acct).balance;
        vm.expectRevert(
            abi.encodeWithSelector(VaultFactory.RefundFailed.selector, address(acct), 1 ether)
        );
        acct.create{value: FEE + 1 ether}();

        assertFalse(factory.hasVault(address(acct)));
        assertEq(factory.accruedFees(), 0);
        assertEq(address(factory).balance, 0);
        assertEq(address(acct).balance, before, "payer keeps its funds");
    }

    function test_BlockedPayer_CanCreateOnceUnblocked() public {
        acct.setBlocked(true);
        vm.expectRevert();
        acct.create{value: FEE + 1 ether}();

        acct.setBlocked(false);
        address v = acct.create{value: FEE + 1 ether}();
        assertEq(VaultProxy(payable(v)).owner(), address(acct));
        assertEq(address(acct).balance, 100 ether + 1 ether, "refund of the excess arrived");
    }

    // ---------------------------------------------------------------- blocklisted vault owner

    function test_BlockedVaultOwner_WithdrawToSelfFailsFundsSafe() public {
        acct.create{value: FEE}();
        acct.deposit{value: 5 ether}();
        acct.setBlocked(true);

        vm.expectRevert(
            abi.encodeWithSelector(VaultProxy.NativeTransferFailed.selector, address(acct), 1 ether)
        );
        acct.withdraw(1 ether, payable(address(acct)));
        assertEq(acct.vault().getBalance(), 5 ether);
    }

    function test_BlockedVaultOwner_CanWithdrawToCleanAddress() public {
        acct.create{value: FEE}();
        acct.deposit{value: 5 ether}();
        acct.setBlocked(true);

        address payable clean = payable(makeAddr("clean"));
        acct.withdraw(5 ether, clean);
        assertEq(clean.balance, 5 ether);
        assertEq(acct.vault().getBalance(), 0);
    }

    function test_BlockedWithdrawRecipient_Fails() public {
        BlocklistableAccount blockedDest = new BlocklistableAccount(factory);
        blockedDest.setBlocked(true);
        VaultProxy v = _create(alice, FEE);
        vm.prank(alice);
        v.deposit{value: 2 ether}();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(VaultProxy.NativeTransferFailed.selector, address(blockedDest), 2 ether)
        );
        v.withdraw(2 ether, payable(address(blockedDest)));
        assertEq(v.getBalance(), 2 ether);
    }
}
