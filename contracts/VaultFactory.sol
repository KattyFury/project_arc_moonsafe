// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultProxy} from "./VaultProxy.sol";

/// @title MoonSafe vault factory
/// @notice Creates one immutable-owner native-USDC vault per caller.
/// @dev Intended for Arc mainnet (chain ID 5042), where native USDC has 18 decimals.
/// Native transfers to zero or to/from Circle-blocklisted addresses can revert even with sufficient funds.
/// Vault creation can still fail while the Arc blocklist blocks the payer.
/// Native value forced into this factory is not accounted as fees and cannot be withdrawn.
/// @custom:upgrade-strategy The factory and vault implementation are NOT upgradeable.
/// Each clone's implementation is fixed forever. Changing vault logic requires a new factory
/// plus owner-directed migration; this factory cannot migrate or control existing vault funds.
contract VaultFactory is Ownable2Step, ReentrancyGuard {
    /// @notice Maximum creation fee: 10 native USDC on Arc (18 decimals).
    uint256 public constant MAX_FEE = 10 ether;

    /// @notice The fixed, separately deployed VaultProxy implementation.
    address public immutable implementation;
    /// @notice Current recipient of all accrued vault-creation fees.
    address payable public feeRecipient;
    /// @notice Creation fee in native base units.
    uint256 public fee;
    /// @notice Creation fees retained for withdrawal, excluding forced native value.
    uint256 public accruedFees;
    /// @notice Pauses new vault creation only; has no effect on existing vaults or their operations.
    bool public creationPaused;

    mapping(address => address) private _vaults;

    error InvalidImplementation(address implementation);
    error ZeroFeeRecipient();
    error FeeTooHigh(uint256 fee, uint256 max);
    error InsufficientFee(uint256 sent, uint256 required);
    error VaultAlreadyExists(address owner, address vault);
    error RefundFailed(address to, uint256 amount);
    error WithdrawFeesFailed(address recipient, uint256 amount);
    error NoFeesAccrued();
    error CreationPaused();
    error RenounceDisabled();

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event VaultCreated(address indexed owner, address indexed vault);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event CreationPausedSet(bool paused);

    /// @notice Sets the implementation, fee configuration and factory administrator.
    /// @param implementation_ Address of the already-deployed VaultProxy implementation.
    /// @param feeRecipient_ Nonzero recipient of native creation fees.
    /// @param fee_ Initial fee, at most MAX_FEE.
    /// @param initialOwner Initial owner of factory configuration only, intended to be a Safe multisig.
    constructor(
        address implementation_,
        address payable feeRecipient_,
        uint256 fee_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (implementation_ == address(0) || implementation_.code.length == 0) {
            revert InvalidImplementation(implementation_);
        }
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        if (fee_ > MAX_FEE) revert FeeTooHigh(fee_, MAX_FEE);

        implementation = implementation_;
        feeRecipient = feeRecipient_;
        fee = fee_;
    }

    /// @notice Disabled: the owner must always be able to replace a failing fee recipient.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /// @notice Updates the fee for future vault creations, subject to MAX_FEE.
    function setFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_FEE) revert FeeTooHigh(newFee, MAX_FEE);
        uint256 previousFee = fee;
        fee = newFee;
        emit FeeUpdated(previousFee, newFee);
    }

    /// @notice Updates the nonzero recipient for all accrued and future vault-creation fees.
    function setFeeRecipient(address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroFeeRecipient();
        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previousRecipient, newRecipient);
    }

    /// @notice Pauses or resumes new vault creation only.
    /// @dev Does not affect existing vaults, deposits, withdrawals, or fee withdrawals in any way.
    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPausedSet(paused);
    }

    /// @notice Creates and initializes the caller's sole vault, accrues the fee and refunds excess.
    /// @dev The creation payment never funds the vault. Deposit separately after creation.
    /// No call is made to feeRecipient, so a rejecting or blocklisted fee recipient cannot block creation.
    /// The Arc blocklist can still block the payer's payment or refund and prevent creation.
    /// @return vault The newly created minimal-proxy vault address.
    function createVault() external payable nonReentrant returns (address vault) {
        if (creationPaused) revert CreationPaused();
        // Snapshot payment configuration before any external calls.
        uint256 creationFee = fee;
        if (msg.value < creationFee) revert InsufficientFee(msg.value, creationFee);
        address existingVault = _vaults[msg.sender];
        if (existingVault != address(0)) revert VaultAlreadyExists(msg.sender, existingVault);
        if (implementation.code.length == 0) revert InvalidImplementation(implementation);

        vault = Clones.clone(implementation);
        // Effects first: the registry and the fee are written before the only call to the new clone (its initialize does not call out).
        _vaults[msg.sender] = vault;
        accruedFees += creationFee;
        // Initialization is atomic with clone creation; no external actor can claim the clone.
        VaultProxy(payable(vault)).initialize(msg.sender);

        // Record and announce the vault before the refund callback; failure rolls back all effects.
        emit VaultCreated(msg.sender, vault);
        uint256 excess = msg.value - creationFee;
        if (excess != 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert RefundFailed(msg.sender, excess);
        }
    }

    /// @notice Anyone may send all accrued fees to the current fee recipient.
    /// @dev Only accruedFees is withdrawn; forced native value remains unaccounted and cannot be withdrawn.
    /// A rejecting or Circle-blocklisted recipient blocks only this withdrawal, not vault creation.
    /// Failed transfers revert the entire transaction, restoring accruedFees for a later attempt.
    function withdrawFees() external nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert NoFeesAccrued();
        address payable recipient = feeRecipient;
        accruedFees = 0;
        // Emitted before the external call so no event from a callback can precede it; a failed transfer reverts the event as well.
        emit FeesWithdrawn(recipient, amount);

        (bool sent, ) = recipient.call{value: amount}("");
        if (!sent) revert WithdrawFeesFailed(recipient, amount);
    }

    /// @notice Returns the owner's vault, or address(0) if none exists.
    function getVault(address owner_) external view returns (address) {
        return _vaults[owner_];
    }

    /// @notice Returns whether the address has already created a vault.
    function hasVault(address owner_) external view returns (bool) {
        return _vaults[owner_] != address(0);
    }

    /// @notice Returns false for a missing vault, otherwise compares its native balance.
    function vaultMeetsMinimum(address owner_, uint256 minAmount) external view returns (bool) {
        address vault = _vaults[owner_];
        if (vault == address(0)) return false;
        return VaultProxy(payable(vault)).meetsMinimum(minAmount);
    }
}
