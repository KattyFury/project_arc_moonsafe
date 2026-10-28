// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {VaultTestBase} from "./VaultFactory.Base.t.sol";
import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {ForceSender, RejectingReceiver} from "../test-helpers/Actors.sol";

/// @dev Drives the factory (create / admin / fee withdrawal / forced value) and vault-owner flows.
contract MoonSafeHandler is Test {
    VaultFactory public factory;
    address public factoryOwner;
    RejectingReceiver public badRecipient;

    address[] public actors;
    address payable[] public goodRecipients;

    uint256 public created;
    uint256 public ghostVaultBalance; // sum of deposits - withdrawals across all vaults
    uint256 public ghostFeesPaid; // sum of fees accrued by successful creations
    uint256 public ghostFeesWithdrawn; // sum of fees successfully withdrawn
    uint256 public ghostForced; // native value forced into the factory

    constructor(VaultFactory f, address owner_, address payable initialRecipient) {
        factory = f;
        factoryOwner = owner_;
        badRecipient = new RejectingReceiver();
        for (uint256 i; i < 8; i++) {
            address a = address(uint160(0x100000 + i));
            actors.push(a);
            vm.deal(a, 1_000_000 ether);
        }
        goodRecipients.push(initialRecipient);
        for (uint256 i; i < 3; i++) {
            goodRecipients.push(payable(address(uint160(0x200000 + i))));
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function recipientCount() external view returns (uint256) {
        return goodRecipients.length;
    }

    function create(uint256 seed, uint256 extra) external {
        address a = actors[seed % actors.length];
        extra = bound(extra, 0, 5 ether);
        if (factory.hasVault(a) || factory.creationPaused()) return;
        uint256 f = factory.fee();
        vm.prank(a);
        factory.createVault{value: f + extra}();
        created++;
        ghostFeesPaid += f;
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

    /// @dev Anyone may call; succeeds unless the current recipient rejects or nothing accrued.
    function withdrawFees(uint256 seed) external {
        address caller = actors[seed % actors.length];
        uint256 accrued = factory.accruedFees();
        vm.prank(caller);
        try factory.withdrawFees() {
            ghostFeesWithdrawn += accrued;
        } catch {}
    }

    function setFee(uint256 newFee) external {
        newFee = bound(newFee, 0, factory.MAX_FEE());
        vm.prank(factoryOwner);
        factory.setFee(newFee);
    }

    function setRecipient(uint256 seed) external {
        uint256 i = seed % (goodRecipients.length + 1);
        address payable r = i == goodRecipients.length ? payable(address(badRecipient)) : goodRecipients[i];
        vm.prank(factoryOwner);
        factory.setFeeRecipient(r);
    }

    function setPaused(bool paused) external {
        vm.prank(factoryOwner);
        factory.setCreationPaused(paused);
    }

    function forceValue(uint256 amount) external {
        amount = bound(amount, 1, 10 ether);
        vm.deal(address(this), amount);
        new ForceSender{value: amount}(payable(address(factory)));
        ghostForced += amount;
    }

    function totalVaultBalance() external view returns (uint256 total) {
        for (uint256 i; i < actors.length; i++) {
            address v = factory.getVault(actors[i]);
            if (v != address(0)) total += v.balance;
        }
    }

    function totalRecipientBalance() external view returns (uint256 total) {
        for (uint256 i; i < goodRecipients.length; i++) {
            total += goodRecipients[i].balance;
        }
    }
}

contract VaultFactoryInvariantTest is VaultTestBase {
    MoonSafeHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new MoonSafeHandler(factory, owner, feeRecipient);
        targetContract(address(handler));
    }

    /// Factory balance is exactly accrued fees plus forced value (nothing leaks, nothing is lost).
    function invariant_FactoryBalanceIsAccruedPlusForced() public view {
        assertEq(address(factory).balance, factory.accruedFees() + handler.ghostForced());
    }

    /// accruedFees == fees paid in - fees withdrawn.
    function invariant_AccruedFeesMatchLedger() public view {
        assertEq(factory.accruedFees(), handler.ghostFeesPaid() - handler.ghostFeesWithdrawn());
    }

    /// Fee recipients collectively hold exactly the fees withdrawn; the rejecting recipient holds none.
    function invariant_RecipientsReceivedExactlyWithdrawnFees() public view {
        assertEq(handler.totalRecipientBalance(), handler.ghostFeesWithdrawn());
        assertEq(address(handler.badRecipient()).balance, 0);
    }

    /// Fee withdrawals never exceed fees paid.
    function invariant_WithdrawnNeverExceedsPaid() public view {
        assertLe(handler.ghostFeesWithdrawn(), handler.ghostFeesPaid());
    }

    /// Sum of all vault balances equals deposits minus withdrawals (value conservation).
    function invariant_VaultBalancesMatchLedger() public view {
        assertEq(handler.totalVaultBalance(), handler.ghostVaultBalance());
    }

    /// Every vault is owned by the wallet it was registered for.
    function invariant_VaultOwnersMatchRegistry() public view {
        uint256 vaults;
        for (uint256 i; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            address v = factory.getVault(a);
            if (v != address(0)) {
                vaults++;
                assertEq(VaultProxy(payable(v)).owner(), a);
                assertTrue(factory.hasVault(a));
            }
        }
        assertEq(vaults, handler.created());
    }
}
