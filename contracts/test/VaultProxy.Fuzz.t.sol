// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";

contract VaultFuzzTest is VaultTestBase {
    VaultProxy internal vault;

    function setUp() public override {
        super.setUp();
        vault = _create(alice, FEE);
    }

    function _validRecipient(address to) internal view {
        vm.assume(uint160(to) > 0xFFFF);
        vm.assume(to.code.length == 0);
        vm.assume(to != address(vault) && to != address(factory) && to != address(impl));
        vm.assume(to != address(this) && to != address(vm) && to != alice);
        vm.assume(to != 0x000000000000000000636F6e736F6c652e6c6f67);
    }

    function testFuzz_DepositThenWithdrawRoundTrip(uint256 amount, address to) public {
        amount = bound(amount, 1, 1e27);
        _validRecipient(to);
        vm.deal(alice, amount);

        vm.prank(alice);
        vault.deposit{value: amount}();
        assertEq(vault.getBalance(), amount);
        assertTrue(vault.meetsMinimum(amount));
        assertFalse(vault.meetsMinimum(amount + 1));

        uint256 toBefore = to.balance;
        vm.prank(alice);
        vault.withdraw(amount, payable(to));
        assertEq(to.balance, toBefore + amount);
        assertEq(vault.getBalance(), 0);
    }

    function testFuzz_PartialWithdrawConservesValue(uint256 amount, uint256 part) public {
        amount = bound(amount, 1, 1e27);
        part = bound(part, 1, amount);
        vm.deal(alice, amount);
        address payable dest = payable(makeAddr("dest"));

        vm.prank(alice);
        vault.deposit{value: amount}();
        vm.prank(alice);
        vault.withdraw(part, dest);

        assertEq(vault.getBalance(), amount - part);
        assertEq(dest.balance + vault.getBalance(), amount);
    }

    function testFuzz_WithdrawOverBalanceReverts(uint256 amount, uint256 extra) public {
        amount = bound(amount, 0, 1e27);
        extra = bound(extra, 1, 1e27);
        if (amount > 0) {
            vm.deal(alice, amount);
            vm.prank(alice);
            vault.deposit{value: amount}();
        }
        vm.prank(alice);
        vm.expectRevert(VaultProxy.InsufficientBalance.selector);
        vault.withdraw(amount + extra, payable(alice));
    }

    function testFuzz_NonOwnerCannotWithdraw(address caller, uint256 amount) public {
        vm.assume(caller != alice);
        amount = bound(amount, 1, 1e24);
        vm.deal(alice, amount);
        vm.prank(alice);
        vault.deposit{value: amount}();

        vm.prank(caller);
        vm.expectRevert(VaultProxy.Unauthorized.selector);
        vault.withdraw(amount, payable(caller));
        assertEq(vault.getBalance(), amount);
    }

    function testFuzz_DepositForFromAnyone(address from, uint256 amount) public {
        vm.assume(from != address(0));
        amount = bound(amount, 1, 1e27);
        vm.deal(from, amount);
        vm.prank(from);
        vault.depositFor{value: amount}();
        assertEq(vault.getBalance(), amount);
        assertEq(vault.owner(), alice);
    }

    function testFuzz_CreateVaultFeeAndRefund(uint256 fee, uint256 extra) public {
        fee = bound(fee, 0, factory.MAX_FEE());
        extra = bound(extra, 0, 100 ether);
        vm.prank(owner);
        factory.setFee(fee);

        address user = makeAddr("fuzzUser");
        vm.deal(user, fee + extra);
        uint256 recBefore = feeRecipient.balance;

        vm.prank(user);
        address v = factory.createVault{value: fee + extra}();

        assertEq(user.balance, extra);
        assertEq(feeRecipient.balance, recBefore + fee);
        assertEq(address(factory).balance, 0);
        assertEq(v.balance, 0);
        assertEq(VaultProxy(payable(v)).owner(), user);
    }

    function testFuzz_CreateVaultUnderpayReverts(uint256 fee, uint256 paid) public {
        fee = bound(fee, 1, factory.MAX_FEE());
        paid = bound(paid, 0, fee - 1);
        vm.prank(owner);
        factory.setFee(fee);
        vm.deal(bob, paid);
        vm.prank(bob);
        vm.expectRevert(VaultFactory.InsufficientFee.selector);
        factory.createVault{value: paid}();
    }

    function testFuzz_SetFeeAboveMaxReverts(uint256 newFee) public {
        newFee = bound(newFee, factory.MAX_FEE() + 1, type(uint256).max);
        vm.prank(owner);
        vm.expectRevert(VaultFactory.FeeExceedsMaximum.selector);
        factory.setFee(newFee);
    }
}
