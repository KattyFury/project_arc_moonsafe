// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {VaultProxy} from "../VaultProxy.sol";
import {VaultFactory} from "../VaultFactory.sol";

/// @notice Deploys the vault implementation and the factory on Arc mainnet (chain 5042). YOU run this, from your own machine and
/// your own wallet; Arc Studio never deploys to mainnet. Read docs/mainnet-plan-2026-10-29.md first.
///
/// Inputs (environment variables, public values only; the signing key is NEVER passed here, use a keystore or a hardware wallet
/// with `forge script ... --keystore <file>` / `--ledger`):
///   FACTORY_OWNER   the Safe multisig that will own the factory (its address, created beforehand)
///   FEE_RECIPIENT   where `withdrawFees()` sends the creation fees
///   VAULT_FEE       the creation fee in native USDC units (18 decimals), e.g. 1000000000000000000 for 1 USDC
///   DRY_RUN         set to 1 ONLY for a local simulation (skips the chain id check)
///
/// Simulate first:  FACTORY_OWNER=... FEE_RECIPIENT=... VAULT_FEE=... DRY_RUN=1 forge script contracts/script/DeployMainnet.s.sol
/// Then for real:   forge script contracts/script/DeployMainnet.s.sol --rpc-url https://rpc.mainnet.arc.io --keystore <file> --broadcast
contract DeployMainnet is Script {
    uint256 internal constant ARC_MAINNET = 5042;

    function run() external returns (VaultProxy implementation, VaultFactory factory) {
        if (vm.envOr("DRY_RUN", uint256(0)) != 1) require(block.chainid == ARC_MAINNET, "not Arc mainnet (chain 5042)");

        address owner = vm.envAddress("FACTORY_OWNER");
        address payable feeRecipient = payable(vm.envAddress("FEE_RECIPIENT"));
        uint256 fee = vm.envUint("VAULT_FEE");
        require(owner != address(0) && feeRecipient != address(0), "zero address");
        require(fee <= 10 ether, "fee above the 10 USDC cap");

        vm.startBroadcast();
        implementation = new VaultProxy();
        factory = new VaultFactory(address(implementation), feeRecipient, fee, owner);
        vm.stopBroadcast();

        // Checks on what was just built (they also run in the simulation).
        require(factory.owner() == owner, "owner mismatch");
        require(factory.implementation() == address(implementation), "implementation mismatch");
        require(factory.feeRecipient() == feeRecipient && factory.fee() == fee, "config mismatch");
        require(!factory.creationPaused(), "should start unpaused");

        console.log("VaultProxy implementation:", address(implementation));
        console.log("VaultFactory:            ", address(factory));
        console.log("Owner (Safe):            ", owner);
        console.log("Fee recipient:           ", feeRecipient);
        console.log("Fee (native units):      ", fee);
        console.log("Next: verify both on explorer.arc.io, set VITE_FACTORY_ADDRESS, accept nothing else; ownership is already the Safe.");
    }
}
