// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal Pyth interface used to update and read the BTC/USD feed.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory);
}

/// @title MoonSafe fixed-schedule dollar-cost-averaging plan
/// @notice One deposit funds an immutable schedule; anyone may execute one due round per call.
/// Nothing is adjustable after initialization. There is no admin, owner transfer or recovery.
/// Owner key loss prevents cancellation; keepers can continue executing and sending cirBTC
/// to the same owner address. cirBTC is assumed to track BTC 1:1.
/// @dev Intended for Arc mainnet (5042). Native USDC (18 decimals) and the USDC ERC-20
/// view (6 decimals) share ONE balance: one ERC-20 base unit equals 1e12 native units.
/// The oracle bounds execution price but cannot stop a stale-but-in-range price, including
/// a price still accepted within MAX_PRICE_AGE. Native transfers can fail due to Circle
/// blocklisting or recipient rejection; every failure atomically restores the due round.
/// @custom:upgrade-strategy Implementation and clones have no upgrade path. All clones
/// permanently use this implementation's constructor-set dependencies and fixed schedule.
contract DcaPlan is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_PRICE_AGE = 60;
    uint256 public constant NATIVE_SCALE = 1e12;

    IERC20 public immutable usdc;
    IERC20 public immutable cirBtc;
    address public immutable adapter;
    IPyth public immutable pyth;
    bytes32 public immutable priceId;

    address public owner;
    uint96 public amountPerRound;
    uint32 public roundsLeft;
    uint32 public intervalSecs;
    uint16 public maxDeviationBps;
    uint64 public nextDue;
    uint256 public tipPerRound;
    /// @notice First initializer, recorded permanently; has no administrative privileges.
    address public factory;
    bool private _initialized;

    error ZeroAddress(bytes32 parameter);
    error AlreadyInitialized();
    error NotInitialized();
    error Unauthorized(address caller);
    error InvalidSchedule(uint96 amountPerRound, uint32 rounds, uint32 intervalSecs, uint16 maxDeviationBps);
    error InsufficientFunding(uint256 available, uint256 required);
    error NoRoundsLeft();
    error RoundNotDue(uint256 timestamp, uint64 nextDue);
    error InsufficientUpdateFee(uint256 sent, uint256 required);
    error RefundFailed(address to, uint256 amount);
    error InvalidPrice(int64 price, int32 expo);
    error PriceTooUncertain(uint64 confidence, int64 price);
    error ZeroMinimumOutput(uint96 amountPerRound, int64 price);
    error AdapterCallFailed(address adapter);
    error SpentTooMuch(uint256 spent, uint256 allowed);
    error UnexpectedUsdcIncrease(uint256 beforeBalance, uint256 afterBalance);
    error BtcBalanceDecreased(uint256 beforeBalance, uint256 afterBalance);
    error BelowOracleFloor(uint256 btcGot, uint256 minOut);
    error TipFailed(address keeper, uint256 amount);
    error PlanStillActive(uint32 roundsLeft);
    error DirectDepositDisabled();

    event RoundExecuted(uint32 roundsLeft, uint256 usdcSpent, uint256 btcGot, int64 price, address keeper);
    event Cancelled(address indexed owner);
    /// @notice What one settlement attempt paid the owner (a part that failed stays in the plan for the next attempt).
    event Swept(address indexed owner, uint256 nativePaid, uint256 cirBtcPaid);

    /// @notice Fixes dependencies in implementation bytecode and locks its own storage.
    /// @dev Clones read these same immutables but start with independent, zeroed storage.
    constructor(IERC20 usdc_, IERC20 cirBtc_, address adapter_, IPyth pyth_, bytes32 priceId_) {
        if (address(usdc_) == address(0)) revert ZeroAddress("usdc");
        if (address(cirBtc_) == address(0)) revert ZeroAddress("cirBtc");
        if (adapter_ == address(0)) revert ZeroAddress("adapter");
        if (address(pyth_) == address(0)) revert ZeroAddress("pyth");
        usdc = usdc_;
        cirBtc = cirBtc_;
        adapter = adapter_;
        pyth = pyth_;
        priceId = priceId_;
        _initialized = true;
    }

    /// @notice Initializes a clone once; the first round is immediately due.
    /// @dev DcaFactory MUST call this atomically with cloning. There is no preauthorized
    /// factory constructor argument: the first caller becomes factory, and no caller may
    /// initialize again. Standalone, uninitialized clones can be claimed by anyone.
    /// @param owner_ Permanent recipient of acquired cirBTC and all native refunds.
    /// @param amountPerRound_ USDC ERC-20 base units (6 decimals) available per round.
    /// @param rounds_ Number of scheduled rounds.
    /// @param intervalSecs_ Fixed spacing; missed rounds remain due for catch-up calls.
    /// @param maxDeviationBps_ Oracle-floor discount in basis points.
    /// @param tipPerRound_ Keeper payment in native base units (18 decimals).
    function initialize(
        address owner_,
        uint96 amountPerRound_,
        uint32 rounds_,
        uint32 intervalSecs_,
        uint16 maxDeviationBps_,
        uint256 tipPerRound_
    ) external payable {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert ZeroAddress("owner");
        if (amountPerRound_ == 0 || rounds_ == 0 || intervalSecs_ == 0 || maxDeviationBps_ > 10_000) {
            revert InvalidSchedule(amountPerRound_, rounds_, intervalSecs_, maxDeviationBps_);
        }
        uint256 required = uint256(rounds_) * amountPerRound_ * NATIVE_SCALE
            + uint256(rounds_) * tipPerRound_;
        if (address(this).balance < required) revert InsufficientFunding(address(this).balance, required);

        _initialized = true;
        factory = msg.sender;
        owner = owner_;
        amountPerRound = amountPerRound_;
        roundsLeft = rounds_;
        intervalSecs = intervalSecs_;
        maxDeviationBps = maxDeviationBps_;
        nextDue = uint64(block.timestamp);
        tipPerRound = tipPerRound_;
    }

    /// @notice Executes exactly one due round; keeper supplies Pyth fees separately from reserves.
    /// @dev Adapter calldata must deliver cirBTC to THIS plan, not directly to owner.
    /// Balance differences, not adapter return data, determine spend and minimum output.
    /// @param adapterCall Calldata for the fixed Circle swap adapter, called with zero native value.
    /// @param pythUpdate Pyth update payloads; excess msg.value is refunded to the keeper.
    function executeRound(bytes calldata adapterCall, bytes[] calldata pythUpdate) external payable nonReentrant {
        if (roundsLeft == 0) revert NoRoundsLeft();
        if (block.timestamp < nextDue) revert RoundNotDue(block.timestamp, nextDue);
        roundsLeft--;
        nextDue += intervalSecs;

        (uint256 minOut, int64 price) = _oracleFloor(pythUpdate);
        (uint256 spent, uint256 got) = _swap(adapterCall, minOut);
        // Everything the plan holds goes to the owner: the bought cirBTC and any cirBTC sent here by mistake (it can never get stuck).
        cirBtc.safeTransfer(owner, cirBtc.balanceOf(address(this)));

        uint256 tip = tipPerRound;
        if (tip != 0) {
            (bool sent, ) = payable(msg.sender).call{value: tip}("");
            if (!sent) revert TipFailed(msg.sender, tip);
        }
        emit RoundExecuted(roundsLeft, spent, got, price, msg.sender);
    }

    /// @notice Permanently cancels remaining rounds and returns all native funds to owner only.
    /// @dev A rejecting or blocklisted owner causes cancellation and its state changes to revert.
    function cancel() external nonReentrant {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        roundsLeft = 0;
        emit Cancelled(owner);
        // Stopping the plan never depends on getting paid: a failed payout (an owner that rejects native value, or a blocked
        // address) leaves the funds in the plan and `sweep()` retries it. The schedule stays stopped either way.
        _settle();
    }

    /// @notice Anyone can return native leftovers and rounding dust after completion or cancellation.
    function sweep() external nonReentrant {
        if (owner == address(0)) revert NotInitialized();
        if (roundsLeft != 0) revert PlanStillActive(roundsLeft);
        _settle();
    }

    /// @notice Reports whether at least one round remains and its fixed deadline has arrived.
    function isDue() external view returns (bool) {
        return roundsLeft != 0 && block.timestamp >= nextDue;
    }

    /// @notice Scheduled principal for remaining rounds in native units; excludes tips and leftovers.
    function principalLeft() external view returns (uint256) {
        return uint256(roundsLeft) * amountPerRound * NATIVE_SCALE;
    }

    /// @notice Rejects plain deposits; forced native value cannot be prevented.
    receive() external payable {
        revert DirectDepositDisabled();
    }

    function _oracleFloor(bytes[] calldata pythUpdate) private returns (uint256 minOut, int64 price) {
        uint256 fee = pyth.getUpdateFee(pythUpdate);
        if (msg.value < fee) revert InsufficientUpdateFee(msg.value, fee);
        pyth.updatePriceFeeds{value: fee}(pythUpdate);
        uint256 excess = msg.value - fee;
        if (excess != 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert RefundFailed(msg.sender, excess);
        }

        IPyth.Price memory p = pyth.getPriceNoOlderThan(priceId, MAX_PRICE_AGE);
        if (p.price <= 0 || p.expo < -18 || p.expo > 0) revert InvalidPrice(p.price, p.expo);
        if (uint256(p.conf) * 100 > uint64(p.price)) revert PriceTooUncertain(p.conf, p.price);
        uint256 expectedUnits = uint256(amountPerRound) * 100 * (10 ** uint32(-p.expo)) / uint64(p.price);
        minOut = expectedUnits * (10_000 - maxDeviationBps) / 10_000;
        if (minOut == 0) revert ZeroMinimumOutput(amountPerRound, p.price);
        price = p.price;
    }

    function _swap(bytes calldata adapterCall, uint256 minOut) private returns (uint256 spent, uint256 got) {
        uint256 usdcBefore = usdc.balanceOf(address(this));
        uint256 btcBefore = cirBtc.balanceOf(address(this));
        usdc.forceApprove(adapter, amountPerRound);
        // Do not copy or bubble untrusted adapter return data.
        (bool success, ) = adapter.call(adapterCall);
        if (!success) revert AdapterCallFailed(adapter);
        usdc.forceApprove(adapter, 0);

        uint256 usdcAfter = usdc.balanceOf(address(this));
        if (usdcAfter > usdcBefore) revert UnexpectedUsdcIncrease(usdcBefore, usdcAfter);
        spent = usdcBefore - usdcAfter;
        if (spent > amountPerRound) revert SpentTooMuch(spent, amountPerRound);
        uint256 btcAfter = cirBtc.balanceOf(address(this));
        if (btcAfter < btcBefore) revert BtcBalanceDecreased(btcBefore, btcAfter);
        got = btcAfter - btcBefore;
        if (got < minOut) revert BelowOracleFloor(got, minOut);
    }

    /// @dev Sends the owner everything the plan still holds: native value and cirBTC, each on its own so one cannot block the other.
    /// Never reverts: a part that cannot be paid now stays here and can be paid by a later call to `sweep()`.
    function _settle() private {
        uint256 nativePaid = address(this).balance;
        if (nativePaid != 0) {
            (bool sent, ) = payable(owner).call{value: nativePaid}("");
            if (!sent) nativePaid = 0;
        }
        uint256 btcPaid = cirBtc.balanceOf(address(this));
        if (btcPaid != 0) {
            try cirBtc.transfer(owner, btcPaid) returns (bool ok) {
                if (!ok) btcPaid = 0;
            } catch {
                btcPaid = 0;
            }
        }
        emit Swept(owner, nativePaid, btcPaid);
    }
}
