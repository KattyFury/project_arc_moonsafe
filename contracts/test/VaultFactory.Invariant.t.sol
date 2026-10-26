// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";

/// @dev Drives createVault from a pool of EOAs and the vault-owner flows of the created vaults.
contract MoonSafeHandler is Test {
    VaultFactory public factory;
    address payable public feeRecipient;
    uint256 public fee;

    address[] public actors;
    uint256 public created;
    uint256 public ghostVaultBalance; // sum of deposits - withdrawals across all vaults

    constructor(VaultFactory f, address payable rec, uint256 fee_) {
        factory = f;
        feeRecipient = rec;
        fee = fee_;
        for (uint256 i; i < 8; i++) {
            address a = address(uint160(0x100000 + i));
            actors.push(a);
            vm.deal(a, 1_000_000 ether);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function create(uint256 seed, uint256 extra) external {
        address a = actors[seed % actors.length];
        extra = bound(extra, 0, 5 ether);
        if (factory.hasVault(a)) return;
        vm.prank(a);
        factory.createVault{value: fee + extra}();
        created++;
    }

    function deposit(uint256 seed, uint256 amount) external {
        address a = actors[seed % actors.length];
        address v = factory.getVault(a);
        if (v == address(0)) return;
        amount = bound(amount, 1, 100 ether);
        vm.prank(a);
        VaultProxy(payable(v)).deposit{value: amount}();
        ghostVaultBalance += amount;
    }

    function gift(uint256 seed, uint256 amount) external {
        address a = actors[seed % actors.length];
        address v = factory.getVault(a);
        if (v == address(0)) return;
        amount = bound(amount, 1, 100 ether);
        address from = actors[(seed / 7) % actors.length];
        vm.prank(from);
        VaultProxy(payable(v)).depositFor{value: amount}();
        ghostVaultBalance += amount;
    }

    function withdraw(uint256 seed, uint256 amount) external {
        address a = actors[seed % actors.length];
        address v = factory.getVault(a);
        if (v == address(0)) return;
        uint256 bal = v.balance;
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(a);
        VaultProxy(payable(v)).withdraw(amount, payable(a));
        ghostVaultBalance -= amount;
    }

    function totalVaultBalance() external view returns (uint256 total) {
        for (uint256 i; i < actors.length; i++) {
            address v = factory.getVault(actors[i]);
            if (v != address(0)) total += v.balance;
        }
    }
}

contract VaultFactoryInvariantTest is VaultTestBase {
    MoonSafeHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new MoonSafeHandler(factory, feeRecipient, FEE);
        targetContract(address(handler));
    }

    /// The factory never retains native value.
    function invariant_FactoryHoldsNothing() public view {
        assertEq(address(factory).balance, 0);
    }

    /// Fee recipient received exactly fee per created vault.
    function invariant_FeeRecipientReceivedExactFees() public view {
        assertEq(feeRecipient.balance, handler.created() * FEE);
    }

    /// Sum of all vault balances equals deposits minus withdrawals (value conservation).
    function invariant_VaultBalancesMatchLedger() public view {
        assertEq(handler.totalVaultBalance(), handler.ghostVaultBalance());
    }

    /// Every vault is owned by the wallet it was registered for.
    function invariant_VaultOwnersMatchRegistry() public view {
        for (uint256 i; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            address v = factory.getVault(a);
            if (v != address(0)) {
                assertEq(VaultProxy(payable(v)).owner(), a);
                assertTrue(factory.hasVault(a));
            }
        }
    }
}
