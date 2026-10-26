// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MoonSafe native-USDC emergency-fund vault
/// @notice Each clone has one permanent owner and holds native value, not ERC-20 tokens.
contract VaultProxy is ReentrancyGuard {
    address private _owner;
    bool private _initialized;

    error AlreadyInitialized();
    error ZeroOwner();
    error Unauthorized();
    error ZeroAmount();
    error InsufficientBalance();
    error ZeroRecipient();
    error NativeTransferFailed();
    error DirectDepositDisabled();

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    /// @notice Locks the implementation itself; clones start with independent, zeroed storage.
    constructor() {
        _initialized = true;
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert Unauthorized();
        _;
    }

    /// @notice Initializes a clone exactly once with its permanent owner.
    /// @param owner_ The nonzero address authorized to withdraw native funds.
    function initialize(address owner_) external {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert ZeroOwner();
        _initialized = true;
        _owner = owner_;
    }

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
    /// @dev Forced native transfers cannot be prevented by a receive function.
    receive() external payable {
        revert DirectDepositDisabled();
    }

    /// @notice Sends native USDC to a nonzero recipient, exclusively at the owner's request.
    /// @param amount The amount in native base units (18 decimals on Arc).
    /// @param to The recipient of the withdrawal.
    function withdraw(uint256 amount, address payable to) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance) revert InsufficientBalance();
        if (to == address(0)) revert ZeroRecipient();

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
        emit Withdrawn(to, amount);
    }

    /// @notice Returns this vault's native-USDC balance in base units.
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Returns the permanent owner (zero for the locked implementation).
    function owner() external view returns (address) {
        return _owner;
    }

    /// @notice Returns whether the native balance is at least minAmount base units.
    function meetsMinimum(uint256 minAmount) external view returns (bool) {
        return address(this).balance >= minAmount;
    }
}
