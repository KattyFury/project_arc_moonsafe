// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DcaPlan} from "./DcaPlan.sol";

/// @title MoonSafe dollar-cost-averaging plan factory
/// @notice Creates independently funded, fixed-schedule plans with no administrator, fee or pause.
/// @dev Intended for Arc mainnet (5042): native gas USDC has 18 decimals and is the
/// SAME pool as its 6-decimal ERC-20 view. One ERC-20 base unit equals 1e12 native units.
/// Native transfers involving Circle-blocklisted addresses can revert. All creation value
/// is forwarded to the clone; any value forced into this factory cannot be withdrawn.
/// @custom:upgrade-strategy Factory and implementation reference are immutable, with no
/// upgrade path. Each minimal-proxy clone permanently delegates to the fixed implementation.
contract DcaFactory is ReentrancyGuard {
    uint96 public constant MIN_AMOUNT = 1e6;
    uint32 public constant MIN_ROUNDS = 1;
    uint32 public constant MAX_ROUNDS = 365;
    uint32 public constant MIN_INTERVAL = 3600;
    uint32 public constant MAX_INTERVAL = 2_592_000;
    uint16 public constant MIN_DEVIATION_BPS = 10;
    uint16 public constant MAX_DEVIATION_BPS = 5000;
    uint256 public constant MIN_TIP = 1e16;
    uint256 public constant NATIVE_SCALE = 1e12;

    /// @notice Fixed, separately deployed DcaPlan implementation and its constructor-set dependencies.
    address public immutable implementation;
    /// @notice Total plans created by this factory across all owners.
    uint256 public totalPlans;
    mapping(address => address[]) private _plans;

    error InvalidImplementation(address implementation);
    error InvalidAmountPerRound(uint96 amountPerRound);
    error InvalidRounds(uint32 rounds);
    error InvalidInterval(uint32 intervalSecs);
    error InvalidDeviation(uint16 maxDeviationBps);
    error InsufficientFunding(uint256 sent, uint256 required);

    event PlanCreated(
        address indexed owner,
        address indexed plan,
        uint96 amountPerRound,
        uint32 rounds,
        uint32 intervalSecs,
        uint16 maxDeviationBps,
        uint256 tipPerRound
    );

    /// @notice Permanently fixes the already-deployed implementation, with no admin privileges.
    /// @param implementation_ DcaPlan implementation, locked against direct initialization.
    constructor(address implementation_) {
        if (implementation_ == address(0) || implementation_.code.length == 0) {
            revert InvalidImplementation(implementation_);
        }
        implementation = implementation_;
    }

    /// @notice Creates and atomically initializes a plan owned permanently by the caller.
    /// @dev Principal is rounds * amountPerRound * 1e12 native units. All excess becomes
    /// the keeper reserve: floor(reserve / rounds) per round, with division dust retained
    /// in the plan for owner-only-destination sweep. No excess is refunded at creation.
    /// Example: 10 USDC daily for 10 rounds funded with 101 native USDC gives a 100 USDC
    /// principal and a 0.1 native USDC tip per round. There are no subsequent deposits.
    /// @param amountPerRound USDC ERC-20 base units (6 decimals), at least one USDC.
    /// @param rounds Number of rounds, from 1 through 365.
    /// @param intervalSecs Spacing in seconds, from one hour through 30 days.
    /// @param maxDeviationBps Oracle-floor discount, from 10 through 5000 basis points.
    /// @return plan New minimal-proxy plan address.
    function createPlan(
        uint96 amountPerRound,
        uint32 rounds,
        uint32 intervalSecs,
        uint16 maxDeviationBps
    ) external payable nonReentrant returns (address plan) {
        if (amountPerRound < MIN_AMOUNT) revert InvalidAmountPerRound(amountPerRound);
        if (rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) revert InvalidRounds(rounds);
        if (intervalSecs < MIN_INTERVAL || intervalSecs > MAX_INTERVAL) revert InvalidInterval(intervalSecs);
        if (maxDeviationBps < MIN_DEVIATION_BPS || maxDeviationBps > MAX_DEVIATION_BPS) {
            revert InvalidDeviation(maxDeviationBps);
        }
        uint256 principal = uint256(rounds) * amountPerRound * NATIVE_SCALE;
        uint256 required = principal + uint256(rounds) * MIN_TIP;
        if (msg.value < required) revert InsufficientFunding(msg.value, required);
        uint256 tipPerRound = (msg.value - principal) / rounds;
        if (implementation.code.length == 0) revert InvalidImplementation(implementation);

        plan = Clones.clone(implementation);
        // Registry effects precede initialization. Any failure rolls creation back atomically.
        _plans[msg.sender].push(plan);
        totalPlans++;
        // No external actor can interleave and claim this clone's one-time initialization.
        DcaPlan(payable(plan)).initialize{value: msg.value}(
            msg.sender, amountPerRound, rounds, intervalSecs, maxDeviationBps, tipPerRound
        );
        emit PlanCreated(msg.sender, plan, amountPerRound, rounds, intervalSecs, maxDeviationBps, tipPerRound);
    }

    /// @notice Returns every plan this factory created for the owner, in creation order.
    function plansOf(address owner_) external view returns (address[] memory) {
        return _plans[owner_];
    }

    /// @notice Returns the number of plans this factory created for the owner.
    function planCount(address owner_) external view returns (uint256) {
        return _plans[owner_].length;
    }
}
