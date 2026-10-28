// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {DcaPlan, IPyth} from "../DcaPlan.sol";
import {DcaFactory} from "../DcaFactory.sol";

/// @notice Deploys the DCA plan implementation and its factory on Arc mainnet (chain 5042). YOU run it, from your own wallet;
/// Arc Studio never deploys to mainnet. Every dependency is passed in and CHECKED against the live chain before anything is deployed.
///
/// Inputs (public values only; sign with `--keystore` / `--ledger`, never pass a key here):
///   USDC       6-decimal ERC-20 view of Arc's native USDC          (Arc docs: 0x3600000000000000000000000000000000000000)
///   CIRBTC     Circle wrapped BTC, 8 decimals                      (Arc docs / App Kit: 0x171A4217b86A807A64eB94757Db6849fb4bDbAA0)
///   ADAPTER    Circle swap Adapter contract on Arc mainnet         (App Kit ADAPTER_CONTRACT_EVM_MAINNET: 0x7FB8c7260b63934d8da38aF902f87ae6e284a845)
///   PYTH       Pyth Core price contract on Arc mainnet             (Pyth docs: 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a)
///   PRICE_ID   Pyth BTC/USD feed id                                (0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43)
///   DRY_RUN    set to 1 ONLY for a local simulation without a chain (skips the chain id and live checks)
///
/// Read-only rehearsal against the real chain (sends nothing):  forge script contracts/script/DeployDca.s.sol --fork-url https://rpc.mainnet.arc.io
/// For real:  forge script contracts/script/DeployDca.s.sol --rpc-url https://rpc.mainnet.arc.io --keystore <file> --broadcast
/// @dev Only to prove the price feed exists on the live Pyth contract (not part of the plan's own interface).
interface IPythFeedCheck {
    function getPriceUnsafe(bytes32 id) external view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime);
}

contract DeployDca is Script {
    uint256 internal constant ARC_MAINNET = 5042;

    function run() external returns (DcaPlan implementation, DcaFactory factory) {
        bool dry = vm.envOr("DRY_RUN", uint256(0)) == 1;
        address usdc = vm.envAddress("USDC");
        address cirBtc = vm.envAddress("CIRBTC");
        address adapter = vm.envAddress("ADAPTER");
        address pyth = vm.envAddress("PYTH");
        bytes32 priceId = vm.envBytes32("PRICE_ID");

        if (!dry) {
            require(block.chainid == ARC_MAINNET, "not Arc mainnet (chain 5042)");
            require(IERC20Metadata(usdc).decimals() == 6, "USDC must have 6 decimals");
            require(IERC20Metadata(cirBtc).decimals() == 8, "cirBTC must have 8 decimals");
            require(adapter.code.length > 0, "no code at the adapter");
            require(IPyth(pyth).getUpdateFee(new bytes[](0)) < 1 ether, "Pyth update fee looks wrong");
            // The feed must exist on this Pyth contract (it reverts for an unknown id). The price may be old: the keeper pushes a fresh one.
            IPythFeedCheck(pyth).getPriceUnsafe(priceId);
        }

        vm.startBroadcast();
        implementation = new DcaPlan(IERC20(usdc), IERC20(cirBtc), adapter, IPyth(pyth), priceId);
        factory = new DcaFactory(address(implementation));
        vm.stopBroadcast();

        require(factory.implementation() == address(implementation), "implementation mismatch");
        console.log("DcaPlan implementation:", address(implementation));
        console.log("DcaFactory:            ", address(factory));
        console.log("Next: verify both on explorer.arc.io, then set the factory address in the keeper and the app.");
    }
}
