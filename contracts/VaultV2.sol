// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice The factory keeps its owner-to-vault index in step when a vault changes owner.
interface IVaultIndex {
    function onOwnerChanged(address oldOwner, address newOwner) external;
}

/// @title MoonSafe native-USDC emergency-fund vault, version 2 (wallet + vault password)
/// @notice Two things are needed to move funds: the owner wallet, and the vault password.
/// The password never goes on-chain. The app derives a secp256k1 key from it in the browser; this vault stores only
/// that key's address (`passwordKey`). Each action carries an EIP-712 signature from the password key over exactly
/// what is being done, bound to this vault, this chain, a nonce and a deadline.
/// MoonSafe holds no key and signs nothing: neither the factory nor its owner can move funds or change the owner.
/// @dev Intended for Arc mainnet (chain ID 5042), where native USDC has 18 decimals.
///
/// Paths:
/// - Withdraw: the owner sends `withdraw` with the password signature over (amount, to, nonce, deadline). Immediate,
///   to any address.
/// - Wallet lost: from a new wallet, `importVault` with the password signature over (newOwner = caller, nonce,
///   deadline). The new wallet becomes the owner immediately.
/// Known limits (accepted, CORE V2 section 7):
/// - Whoever holds the password and knows the vault address can take the vault (import, then withdraw).
/// - Losing the password loses the ability to withdraw, even with the wallet.
/// - Native transfers to zero or to/from Circle-blocklisted addresses can revert even with sufficient funds.
/// @custom:upgrade-strategy Clones permanently delegate to the fixed implementation with no upgrade path.
contract VaultV2 is ReentrancyGuard, EIP712 {
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 amount,address to,uint256 nonce,uint256 deadline)");
    bytes32 private constant IMPORT_TYPEHASH = keccak256("Import(address newOwner,uint256 nonce,uint256 deadline)");

    address private _owner;
    address private _passwordKey;
    address private _factory;
    bool private _initialized;

    /// @notice Counter bound into every password signature; each use advances it.
    uint256 public nonce;

    error AlreadyInitialized();
    error ZeroOwner();
    error ZeroPasswordKey();
    error ZeroFactory();
    error Unauthorized(address caller);
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroRecipient();
    error NativeTransferFailed(address to, uint256 amount);
    error DirectDepositDisabled();
    error InvalidPasswordSignature();
    error SignatureExpired(uint256 deadline);
    error AlreadyOwner();

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    /// @notice Locks the implementation itself; clones start with independent, zeroed storage.
    constructor() EIP712("MoonSafeVault", "2") {
        _initialized = true;
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert Unauthorized(msg.sender);
        _;
    }

    /// @notice Initializes a clone exactly once. Called by the factory.
    /// @param owner_ The wallet that sends every withdrawal.
    /// @param passwordKey_ Address of the key derived from the vault password in the browser.
    /// @param factory_ The factory whose owner index follows ownership changes.
    function initialize(address owner_, address passwordKey_, address factory_) external {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert ZeroOwner();
        if (passwordKey_ == address(0)) revert ZeroPasswordKey();
        if (factory_ == address(0)) revert ZeroFactory();
        _initialized = true;
        _owner = owner_;
        _passwordKey = passwordKey_;
        _factory = factory_;
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

    // ───────────── Withdraw: wallet + password ─────────────

    /// @notice Sends native USDC. Needs the owner as sender and the password signature over (amount, to, nonce, deadline).
    /// @param amount The amount in native base units (18 decimals on Arc).
    /// @param to Any recipient.
    /// @param deadline Last second the signature is valid.
    /// @param passwordSig 65-byte ECDSA signature by the password key.
    function withdraw(uint256 amount, address payable to, uint256 deadline, bytes calldata passwordSig)
        external
        onlyOwner
        nonReentrant
    {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        _requirePasswordSig(keccak256(abi.encode(WITHDRAW_TYPEHASH, amount, to, nonce, deadline)), passwordSig);
        nonce++;
        _send(amount, to);
    }

    // ───────────── Import: new wallet + password ─────────────

    /// @notice Makes the caller the owner. Needs the password signature over (newOwner = caller, nonce, deadline), so a
    /// signature seen in the mempool is useless to anyone else.
    /// @param deadline Last second the signature is valid.
    /// @param passwordSig 65-byte ECDSA signature by the password key.
    function importVault(uint256 deadline, bytes calldata passwordSig) external {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);
        address previous = _owner;
        if (msg.sender == previous) revert AlreadyOwner();
        _requirePasswordSig(keccak256(abi.encode(IMPORT_TYPEHASH, msg.sender, nonce, deadline)), passwordSig);
        nonce++;
        _owner = msg.sender;
        emit OwnerChanged(previous, msg.sender);
        IVaultIndex(_factory).onOwnerChanged(previous, msg.sender);
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

    /// @notice Returns the address of the key derived from the vault password.
    function passwordKey() external view returns (address) {
        return _passwordKey;
    }

    /// @notice Returns the factory that created this vault.
    function factory() external view returns (address) {
        return _factory;
    }

    /// @notice Returns whether the native balance is at least minAmount base units.
    function meetsMinimum(uint256 minAmount) external view returns (bool) {
        return address(this).balance >= minAmount;
    }

    // ───────────── Internals ─────────────

    /// @dev OpenZeppelin ECDSA rejects malleable (high-s) signatures and never returns the zero address.
    function _requirePasswordSig(bytes32 structHash, bytes calldata sig) private view {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(structHash), sig);
        if (err != ECDSA.RecoverError.NoError || signer != _passwordKey) revert InvalidPasswordSignature();
    }

    /// @dev Emits before the native call; transfer failure reverts the entire transaction, including the event.
    function _send(uint256 amount, address payable to) private {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroRecipient();
        uint256 available = address(this).balance;
        if (amount > available) revert InsufficientBalance(amount, available);

        emit Withdrawn(to, amount);
        (bool success,) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed(to, amount);
    }
}
