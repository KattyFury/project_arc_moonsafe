// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultV2} from "./VaultV2.sol";

/// @title MoonSafe vault factory, version 2
/// @notice Creates one wallet-plus-guardian native-USDC vault per caller and reports the guardian key to all of them.
/// @dev Intended for Arc mainnet (chain ID 5042), where native USDC has 18 decimals.
/// The factory owner (a Safe multisig) can rotate the guardian key for every vault at once. That power cannot move
/// funds: the guardian alone can only start an ownership change that the vault owner can cancel during the delay,
/// and every withdrawal still needs the vault owner as the sender.
/// Same fee model as VaultFactory: native value forced into this factory is not accounted as fees and cannot be withdrawn.
/// @custom:upgrade-strategy The factory and vault implementation are NOT upgradeable.
contract VaultFactoryV2 is Ownable2Step, ReentrancyGuard {
    /// @notice Maximum creation fee: 10 native USDC on Arc (18 decimals).
    uint256 public constant MAX_FEE = 10 ether;

    /// @notice The fixed, separately deployed VaultV2 implementation.
    address public immutable implementation;
    /// @notice The key whose signature (after the user's email confirmation) completes a withdrawal. Read live by every vault.
    address public guardian;
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
    error ZeroGuardian();
    error FeeTooHigh(uint256 fee, uint256 max);
    error InsufficientFee(uint256 sent, uint256 required);
    error VaultAlreadyExists(address owner, address vault);
    error RefundFailed(address to, uint256 amount);
    error WithdrawFeesFailed(address recipient, uint256 amount);
    error NoFeesAccrued();
    error CreationPaused();
    error RenounceDisabled();
    error GuardianIsCreator();

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event VaultCreated(address indexed owner, address indexed vault);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event CreationPausedSet(bool paused);

    /// @param implementation_ Address of the already-deployed VaultV2 implementation.
    /// @param guardian_ Nonzero guardian key (MoonSafe's server signing key).
    /// @param feeRecipient_ Nonzero recipient of native creation fees.
    /// @param fee_ Initial fee, at most MAX_FEE.
    /// @param initialOwner Initial owner of factory configuration only, intended to be a Safe multisig.
    constructor(
        address implementation_,
        address guardian_,
        address payable feeRecipient_,
        uint256 fee_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (implementation_ == address(0) || implementation_.code.length == 0) {
            revert InvalidImplementation(implementation_);
        }
        if (guardian_ == address(0)) revert ZeroGuardian();
        if (feeRecipient_ == address(0)) revert ZeroFeeRecipient();
        if (fee_ > MAX_FEE) revert FeeTooHigh(fee_, MAX_FEE);

        implementation = implementation_;
        guardian = guardian_;
        feeRecipient = feeRecipient_;
        fee = fee_;
    }

    /// @notice Disabled: the owner must always be able to replace a failing fee recipient or a lost guardian key.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    /// @notice Rotates the guardian key for every vault, existing and new.
    function setGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroGuardian();
        address previous = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(previous, newGuardian);
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
    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPausedSet(paused);
    }

    /// @notice Creates and initializes the caller's sole vault, accrues the fee and refunds excess.
    /// @dev The creation payment never funds the vault. Deposit separately after creation.
    /// @return vault The newly created minimal-proxy vault address.
    function createVault() external payable nonReentrant returns (address vault) {
        if (creationPaused) revert CreationPaused();
        uint256 creationFee = fee;
        if (msg.value < creationFee) revert InsufficientFee(msg.value, creationFee);
        address existingVault = _vaults[msg.sender];
        if (existingVault != address(0)) revert VaultAlreadyExists(msg.sender, existingVault);
        if (implementation.code.length == 0) revert InvalidImplementation(implementation);
        if (msg.sender == guardian) revert GuardianIsCreator();

        vault = Clones.clone(implementation);
        _vaults[msg.sender] = vault;
        accruedFees += creationFee;
        VaultV2(payable(vault)).initialize(msg.sender, address(this));

        emit VaultCreated(msg.sender, vault);
        uint256 excess = msg.value - creationFee;
        if (excess != 0) {
            (bool refunded, ) = payable(msg.sender).call{value: excess}("");
            if (!refunded) revert RefundFailed(msg.sender, excess);
        }
    }

    /// @notice Anyone may send all accrued fees to the current fee recipient.
    function withdrawFees() external nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert NoFeesAccrued();
        address payable recipient = feeRecipient;
        accruedFees = 0;
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
        return VaultV2(payable(vault)).meetsMinimum(minAmount);
    }
}
