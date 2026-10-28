// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
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

    /// @dev Index of the first log with `sig` as topic0 emitted by `emitter`, or type(uint256).max.
    function _indexOfLog(Vm.Log[] memory logs, address emitter, bytes32 sig)
        internal
        pure
        returns (uint256)
    {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == sig) return i;
        }
        return type(uint256).max;
    }

    /// @dev Number of logs with `sig` as topic0 emitted by `emitter`.
    function _countLogs(Vm.Log[] memory logs, address emitter, bytes32 sig)
        internal
        pure
        returns (uint256 n)
    {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == emitter && logs[i].topics[0] == sig) n++;
        }
    }
}
