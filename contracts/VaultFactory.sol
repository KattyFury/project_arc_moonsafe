// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultProxy} from "./VaultProxy.sol";

/// @title MoonSafe vault factory
/// @notice Creates one immutable-owner native-USDC vault per caller.
contract VaultFactory is Ownable, ReentrancyGuard {
    /// @notice Maximum creation fee: 10 native USDC on Arc (18 decimals).
    uint256 public constant MAX_FEE = 10 ether;

    /// @notice The fixed, separately deployed VaultProxy implementation.
    address public immutable implementation;
    /// @notice Recipient of future vault-creation fees.
    address payable public feeRecipient;
    /// @notice Creation fee in native base units.
    uint256 public fee;

    mapping(address => address) private _vaults;

    error InvalidImplementation();
    error ZeroFeeRecipient();
    error FeeExceedsMaximum();
    error InsufficientFee();
    error VaultAlreadyExists();
    error FeeTransferFailed();
    error RefundFailed();
    error RenounceDisabled();

    event FeeUpdated(uint256 previousFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event VaultCreated(address indexed owner, address indexed vault);

    /// @notice Sets the implementation, fee configuration and factory administrator.
    /// @param implementation_ Address of the already-deployed VaultProxy implementation.
    /// @param feeRecipient_ Nonzero recipient of native creation fees.
    /// @param fee_ Initial fee, at most MAX_FEE.
    /// @param initialOwner Initial owner of factory configuration only, not user vaults.
    constructor(
        address implementation_,
        address payable feeRecipient_,
        uint256 fee_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (implementation_ == address(0) || implementation_.code.length == 0) {
            revert InvalidImplementation();
        }
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        if (fee_ > MAX_FEE) revert FeeExceedsMaximum();

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
        if (newFee > MAX_FEE) revert FeeExceedsMaximum();
        uint256 previousFee = fee;
        fee = newFee;
        emit FeeUpdated(previousFee, newFee);
    }

    /// @notice Updates the nonzero recipient for future vault-creation fees.
    function setFeeRecipient(address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroFeeRecipient();
        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(previousRecipient, newRecipient);
    }

    /// @notice Creates and initializes the caller's sole vault, pays the fee and refunds excess.
    /// @dev The creation payment never funds the vault. Deposit separately after creation.
    /// @return vault The newly created minimal-proxy vault address.
    function createVault() external payable nonReentrant returns (address vault) {
        // Snapshot payment configuration before any external calls.
        uint256 creationFee = fee;
        address payable recipient = feeRecipient;
        if (msg.value < creationFee) revert InsufficientFee();
        if (_vaults[msg.sender] != address(0)) revert VaultAlreadyExists();

        vault = Clones.clone(implementation);
        // Initialization is atomic with clone creation; no external actor can claim the clone.
        VaultProxy(payable(vault)).initialize(msg.sender);
        _vaults[msg.sender] = vault;

        // Record the vault before payment callbacks; any failure rolls back all effects.
        if (creationFee != 0) {
            (bool feeSent, ) = recipient.call{value: creationFee}("");
            if (!feeSent) revert FeeTransferFailed();
        }
        uint256 excess = msg.value - creationFee;
        if (excess != 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert RefundFailed();
        }

        emit VaultCreated(msg.sender, vault);
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
