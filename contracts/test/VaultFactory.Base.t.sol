// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {VaultFactory} from "../VaultFactory.sol";

/// @dev Shared fixtures. No test functions here.
abstract contract VaultTestBase is Test {
    VaultProxy internal impl;
    VaultFactory internal factory;

    address internal owner = makeAddr("owner");
    address payable internal feeRecipient = payable(makeAddr("feeRecipient"));
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant FEE = 1 ether;

    function setUp() public virtual {
        impl = new VaultProxy();
        factory = new VaultFactory(address(impl), feeRecipient, FEE, owner);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(attacker, 1_000 ether);
    }

    /// @dev Create a vault as `who`, paying `value`.
    function _create(address who, uint256 value) internal returns (VaultProxy v) {
        vm.prank(who);
        v = VaultProxy(payable(factory.createVault{value: value}()));
    }
}
