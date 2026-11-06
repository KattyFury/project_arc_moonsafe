// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice The factory exposes MoonSafe's current guardian key, so one rotation covers every vault.
interface IGuardianSource {
    function guardian() external view returns (address);
}

/// @title MoonSafe native-USDC emergency-fund vault, version 2 (wallet + email, two separate keys)
/// @notice Every withdrawal needs two keys: the owner wallet sends the transaction and the guardian signs off.
/// The guardian is MoonSafe's server key; it signs only after the user clicks the link in the confirmation
/// email (the link states amount and recipient). The guardian alone can never move funds.
/// @dev Intended for Arc mainnet (chain ID 5042), where native USDC has 18 decimals.
///
/// Paths (each is the whole story for one situation):
/// - Normal withdraw: owner sends `withdraw`, guardian's EIP-712 signature attached. Immediate.
/// - MoonSafe is down: owner alone calls `requestWithdraw`, waits DELAY, calls `executeWithdraw`. The guardian
///   (email link) or the owner can `cancelWithdraw` any time before it executes.
/// - Wallet lost: the guardian (after the email link plus a signature from the new wallet, checked off-chain)
///   calls `requestOwnerChange`. After DELAY anyone calls `finishOwnerChange`. The current owner or the guardian
///   can `cancelOwnerChange` meanwhile.
/// - Moving to a new wallet while both keys work: owner calls `changeOwner` with the guardian's signature. Immediate.
/// - Email lost or changed: the email-to-vault mapping lives on the server, not here. The server enforces its own
///   DELAY with notice to the old email. Nothing to do on-chain.
/// Known limit (accepted): a thief holding only the owner wallet can cancel a legitimate `requestOwnerChange`.
/// Funds stay safe (the thief cannot withdraw), but recovery waits until the wallet is back under the user's control.
/// Losing both keys loses the funds. Delay-based paths only protect users who are notified and look in time.
/// Native transfers to zero or to/from Circle-blocklisted addresses can revert even with sufficient funds.
/// @custom:upgrade-strategy Clones permanently delegate to the fixed implementation with no upgrade path.
contract VaultV2 is ReentrancyGuard, EIP712 {
    /// @notice Wait before a one-key action takes effect.
    uint256 public constant DELAY = 7 days;
    /// @notice After DELAY a pending action stays executable this long, then it must be requested again.
    uint256 public constant GRACE = 14 days;

    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 amount,address to,uint256 nonce,uint256 deadline)");
    bytes32 private constant CHANGE_OWNER_TYPEHASH =
        keccak256("ChangeOwner(address newOwner,uint256 nonce,uint256 deadline)");

    address private _owner;
    bool private _initialized;
    address private _factory;

    /// @notice Counter bound into every guardian signature; each use and each ownership change advances it.
    uint256 public nonce;

    address private _pwTo;
    uint256 private _pwAmount;
    uint64 private _pwEta;

    address private _poNewOwner;
    uint64 private _poEta;

    error AlreadyInitialized();
    error ZeroOwner();
    error ZeroFactory();
    error Unauthorized(address caller);
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroRecipient();
    error NativeTransferFailed(address to, uint256 amount);
    error DirectDepositDisabled();
    error GuardianIsOwner();
    error InvalidGuardianSignature();
    error SignatureExpired(uint256 deadline);
    error WithdrawalPending();
    error OwnerChangePending();
    error NothingPending();
    error NotReady(uint256 eta);
    error RequestExpired(uint256 expiredAt);
    error InvalidNewOwner(address newOwner);

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event WithdrawalRequested(address indexed to, uint256 amount, uint256 eta);
    event WithdrawalCancelled(address indexed by);
    event OwnerChangeRequested(address indexed newOwner, uint256 eta);
    event OwnerChangeCancelled(address indexed by);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    /// @notice Locks the implementation itself; clones start with independent, zeroed storage.
    constructor() EIP712("MoonSafeVault", "2") {
        _initialized = true;
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert Unauthorized(msg.sender);
        _;
    }

    /// @notice Initializes a clone exactly once.
    /// @param owner_ The wallet that sends every owner action.
    /// @param factory_ The factory that reports the current guardian key.
    function initialize(address owner_, address factory_) external {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert ZeroOwner();
        if (factory_ == address(0)) revert ZeroFactory();
        _initialized = true;
        _owner = owner_;
        _factory = factory_;
        if (IGuardianSource(factory_).guardian() == owner_) revert GuardianIsOwner();
    }

    // ───────────── Deposits ─────────────

    /// @notice Deposits a positive amount of native USDC from the owner.
    function deposit() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Gifts a positive amount of native USDC to this vault from any sender.
    function depositFor() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Rejects ordinary native transfers; use deposit or depositFor instead.
    receive() external payable {
        revert DirectDepositDisabled();
    }

    // ───────────── Withdraw: both keys ─────────────

    /// @notice Sends native USDC. Needs the owner as sender and the guardian's signature over (amount, to, nonce, deadline).
    /// @param amount The amount in native base units (18 decimals on Arc).
    /// @param to The recipient, exactly as shown in the confirmation email.
    /// @param deadline Last second the signature is valid.
    /// @param guardianSig The guardian's EIP-712 signature (65-byte ECDSA, or ERC-1271 if the guardian is a contract).
    function withdraw(uint256 amount, address payable to, uint256 deadline, bytes calldata guardianSig)
        external
        onlyOwner
        nonReentrant
    {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        _requireGuardianSig(keccak256(abi.encode(WITHDRAW_TYPEHASH, amount, to, nonce, deadline)), guardianSig);
        nonce++;
        _send(amount, to);
    }

    // ───────────── Withdraw: owner alone, after DELAY ─────────────

    /// @notice Starts a withdrawal that needs no guardian. Executable after DELAY, cancellable by owner or guardian.
    function requestWithdraw(uint256 amount, address payable to) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroRecipient();
        if (_live(_pwEta)) revert WithdrawalPending();
        uint64 eta = uint64(block.timestamp + DELAY);
        _pwTo = to;
        _pwAmount = amount;
        _pwEta = eta;
        emit WithdrawalRequested(to, amount, eta);
    }

    /// @notice Sends the requested withdrawal once DELAY has passed (and before GRACE ends).
    function executeWithdraw() external onlyOwner nonReentrant {
        uint64 eta = _pwEta;
        _requireWindow(eta);
        address payable to = payable(_pwTo);
        uint256 amount = _pwAmount;
        _clearWithdraw();
        _send(amount, to);
    }

    /// @notice Cancels the pending owner-only withdrawal. Owner or guardian.
    function cancelWithdraw() external {
        _requireOwnerOrGuardian();
        if (_pwEta == 0) revert NothingPending();
        _clearWithdraw();
        emit WithdrawalCancelled(msg.sender);
    }

    // ───────────── Ownership ─────────────

    /// @notice Guardian-started ownership change (wallet lost). The caller attests the email link was clicked and
    /// the new wallet proved control off-chain. Takes effect after DELAY via finishOwnerChange.
    function requestOwnerChange(address newOwner) external {
        address g = _guardianOrRevert();
        if (msg.sender != g) revert Unauthorized(msg.sender);
        if (newOwner == address(0)) revert ZeroOwner();
        if (newOwner == g || newOwner == _owner) revert InvalidNewOwner(newOwner);
        if (_live(_poEta)) revert OwnerChangePending();
        uint64 eta = uint64(block.timestamp + DELAY);
        _poNewOwner = newOwner;
        _poEta = eta;
        emit OwnerChangeRequested(newOwner, eta);
    }

    /// @notice Cancels the pending ownership change. Current owner or guardian.
    function cancelOwnerChange() external {
        _requireOwnerOrGuardian();
        if (_poEta == 0) revert NothingPending();
        _clearOwnerChange();
        emit OwnerChangeCancelled(msg.sender);
    }

    /// @notice Completes a pending ownership change after DELAY. Anyone may call; the outcome is already fixed.
    function finishOwnerChange() external {
        _requireWindow(_poEta);
        address newOwner = _poNewOwner;
        if (newOwner == guardian()) revert InvalidNewOwner(newOwner);
        _setOwner(newOwner);
    }

    /// @notice Immediate move to a new wallet while both keys work: owner sends it, guardian signs
    /// (newOwner, nonce, deadline).
    function changeOwner(address newOwner, uint256 deadline, bytes calldata guardianSig) external onlyOwner {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        if (newOwner == address(0)) revert ZeroOwner();
        address g = _guardianOrRevert();
        if (newOwner == g || newOwner == _owner) revert InvalidNewOwner(newOwner);
        _requireGuardianSig(keccak256(abi.encode(CHANGE_OWNER_TYPEHASH, newOwner, nonce, deadline)), guardianSig);
        _setOwner(newOwner);
    }

    // ───────────── Views ─────────────

    /// @notice Returns this vault's native-USDC balance in base units.
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Returns the current owner wallet (zero for the locked implementation).
    function owner() external view returns (address) {
        return _owner;
    }

    /// @notice Returns the guardian key currently reported by the factory.
    function guardian() public view returns (address) {
        return IGuardianSource(_factory).guardian();
    }

    /// @notice Returns whether the native balance is at least minAmount base units.
    function meetsMinimum(uint256 minAmount) external view returns (bool) {
        return address(this).balance >= minAmount;
    }

    /// @notice The pending owner-only withdrawal; eta is zero if none.
    function pendingWithdrawal() external view returns (address to, uint256 amount, uint256 eta) {
        return (_pwTo, _pwAmount, _pwEta);
    }

    /// @notice The pending ownership change; eta is zero if none.
    function pendingOwnerChange() external view returns (address newOwner, uint256 eta) {
        return (_poNewOwner, _poEta);
    }

    // ───────────── Internals ─────────────

    function _guardianOrRevert() private view returns (address g) {
        g = guardian();
        if (g == _owner) revert GuardianIsOwner();
    }

    function _requireOwnerOrGuardian() private view {
        if (msg.sender != _owner && msg.sender != guardian()) revert Unauthorized(msg.sender);
    }

    function _requireGuardianSig(bytes32 structHash, bytes calldata sig) private view {
        address g = _guardianOrRevert();
        if (!SignatureChecker.isValidSignatureNow(g, _hashTypedDataV4(structHash), sig)) {
            revert InvalidGuardianSignature();
        }
    }

    function _live(uint64 eta) private view returns (bool) {
        return eta != 0 && block.timestamp <= uint256(eta) + GRACE;
    }

    function _requireWindow(uint64 eta) private view {
        if (eta == 0) revert NothingPending();
        if (block.timestamp < eta) revert NotReady(eta);
        if (block.timestamp > uint256(eta) + GRACE) revert RequestExpired(uint256(eta) + GRACE);
    }

    function _clearWithdraw() private {
        _pwTo = address(0);
        _pwAmount = 0;
        _pwEta = 0;
    }

    function _clearOwnerChange() private {
        _poNewOwner = address(0);
        _poEta = 0;
    }

    /// @dev The previous owner's pending withdrawal and unused guardian signatures must not survive a new owner.
    function _setOwner(address newOwner) private {
        address previous = _owner;
        _owner = newOwner;
        _clearWithdraw();
        _clearOwnerChange();
        nonce++;
        emit OwnerChanged(previous, newOwner);
    }

    /// @dev Emits before the native call; transfer failure reverts the entire transaction, including the event.
    function _send(uint256 amount, address payable to) private {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroRecipient();
        uint256 available = address(this).balance;
        if (amount > available) revert InsufficientBalance(amount, available);

        emit Withdrawn(to, amount);
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed(to, amount);
    }
}
