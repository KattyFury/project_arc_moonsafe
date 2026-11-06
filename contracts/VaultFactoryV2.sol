// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultV2} from "./VaultV2.sol";

/// @title MoonSafe vault factory, version 2
/// @notice Creates one wallet-plus-password native-USDC vault per wallet and keeps an owner-to-vault index.
/// @dev Intended for Arc mainnet (chain ID 5042), where native USDC has 18 decimals.
/// The factory owner can only set the creation fee, its recipient, and pause new creations. It has no power over any
/// vault: it cannot move funds, change a vault owner or a password key.
/// Native value forced into this factory is not accounted as fees and cannot be withdrawn.
/// @custom:upgrade-strategy The factory and vault implementation are NOT upgradeable.
contract VaultFactoryV2 is Ownable2Step, ReentrancyGuard {
    /// @notice Maximum creation fee: 10 native USDC on Arc (18 decimals).
    uint256 public constant MAX_FEE = 10 ether;

    /// @notice The fixed, separately deployed VaultV2 implementation.
    address public immutable implementation;
    /// @notice Current recipient of all accrued vault-creation fees.
    address payable public feeRecipient;
    /// @notice Creation fee in native base units. Zero turns the fee off.
    uint256 public fee;
    /// @notice Creation fees retained for withdrawal, excluding forced native value.
    uint256 public accruedFees;
    /// @notice Pauses new vault creation only; has no effect on existing vaults or their operations.
    bool public creationPaused;

    mapping(address => address) private _vaults;
    mapping(address => bool) private _isVault;

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
    error NotAVault(address caller);

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event VaultCreated(address indexed owner, address indexed vault, address passwordKey);
    event VaultOwnerChanged(address indexed vault, address indexed oldOwner, address indexed newOwner);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event CreationPausedSet(bool paused);

    /// @param implementation_ Address of the already-deployed VaultV2 implementation.
    /// @param feeRecipient_ Nonzero recipient of native creation fees.
    /// @param fee_ Initial fee, at most MAX_FEE.
    /// @param initialOwner Initial owner of factory configuration only, intended to be a Safe multisig.
    constructor(address implementation_, address payable feeRecipient_, uint256 fee_, address initialOwner)
        Ownable(initialOwner)
    {
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

    /// @notice Updates the fee for future vault creations, subject to MAX_FEE. Zero turns the fee off.
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
    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPausedSet(paused);
    }

    /// @notice Creates and initializes the caller's sole vault, accrues the fee and refunds excess.
    /// @dev The creation payment never funds the vault. Deposit separately after creation.
    /// @param passwordKey Address of the key the browser derived from the freshly generated vault password.
    /// @return vault The newly created minimal-proxy vault address.
    function createVault(address passwordKey) external payable nonReentrant returns (address vault) {
        if (creationPaused) revert CreationPaused();
        uint256 creationFee = fee;
        if (msg.value < creationFee) revert InsufficientFee(msg.value, creationFee);
        address existingVault = _vaults[msg.sender];
        if (existingVault != address(0)) revert VaultAlreadyExists(msg.sender, existingVault);
        if (implementation.code.length == 0) revert InvalidImplementation(implementation);

        vault = Clones.clone(implementation);
        _vaults[msg.sender] = vault;
        _isVault[vault] = true;
        accruedFees += creationFee;
        VaultV2(payable(vault)).initialize(msg.sender, passwordKey, address(this));

        emit VaultCreated(msg.sender, vault, passwordKey);
        uint256 excess = msg.value - creationFee;
        if (excess != 0) {
            (bool refunded,) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert RefundFailed(msg.sender, excess);
        }
    }

    /// @notice Called by a vault this factory created when its owner changes (import). Keeps getVault accurate.
    /// @dev Reverts if the new owner already has a vault, so one wallet never maps to two vaults; the import then
    /// fails as a whole and the user imports from a wallet without a vault.
    function onOwnerChanged(address oldOwner, address newOwner) external {
        if (!_isVault[msg.sender]) revert NotAVault(msg.sender);
        address existingVault = _vaults[newOwner];
        if (existingVault != address(0)) revert VaultAlreadyExists(newOwner, existingVault);
        if (_vaults[oldOwner] == msg.sender) delete _vaults[oldOwner];
        _vaults[newOwner] = msg.sender;
        emit VaultOwnerChanged(msg.sender, oldOwner, newOwner);
    }

    /// @notice Anyone may send all accrued fees to the current fee recipient.
    function withdrawFees() external nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert NoFeesAccrued();
        address payable recipient = feeRecipient;
        accruedFees = 0;
        emit FeesWithdrawn(recipient, amount);

        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert WithdrawFeesFailed(recipient, amount);
    }

    /// @notice Returns the owner's vault, or address(0) if none exists.
    function getVault(address owner_) external view returns (address) {
        return _vaults[owner_];
    }

    /// @notice Returns whether the address currently owns a vault.
    function hasVault(address owner_) external view returns (bool) {
        return _vaults[owner_] != address(0);
    }

    /// @notice Returns whether the address is a vault created by this factory.
    function isVault(address vault) external view returns (bool) {
        return _isVault[vault];
    }

    /// @notice Returns false for a missing vault, otherwise compares its native balance.
    function vaultMeetsMinimum(address owner_, uint256 minAmount) external view returns (bool) {
        address vault = _vaults[owner_];
        if (vault == address(0)) return false;
        return VaultV2(payable(vault)).meetsMinimum(minAmount);
    }
}
