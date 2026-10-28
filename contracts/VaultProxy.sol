// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MoonSafe native-USDC emergency-fund vault
/// @notice Each clone has one permanent owner and holds native value, not ERC-20 tokens.
/// @dev Intended for Arc mainnet (chain ID 5042), where native USDC has 18 decimals.
/// Native transfers to zero or to/from Circle-blocklisted addresses can revert even with sufficient funds.
/// @custom:upgrade-strategy Clones permanently delegate to the fixed implementation with no upgrade path.
/// Vault ownership is permanent: NO transfer and NO recovery in this version. A lost owner key means
/// lost funds. A recovery design remains an open decision and is not implemented here.
contract VaultProxy is ReentrancyGuard {
    address private _owner;
    bool private _initialized;

    error AlreadyInitialized();
    error ZeroOwner();
    error Unauthorized(address caller);
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error ZeroRecipient();
    error NativeTransferFailed(address to, uint256 amount);
    error DirectDepositDisabled();

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    /// @notice Locks the implementation itself; clones start with independent, zeroed storage.
    constructor() {
        _initialized = true;
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) revert Unauthorized(msg.sender);
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
    /// @dev Emits before the native call; transfer failure reverts the entire transaction, including the event.
    /// Circle blocklisting of the source or recipient can cause failure despite sufficient funds.
    /// @param amount The amount in native base units (18 decimals on Arc).
    /// @param to The recipient of the withdrawal.
    function withdraw(uint256 amount, address payable to) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 available = address(this).balance;
        if (amount > available) revert InsufficientBalance(amount, available);
        if (to == address(0)) revert ZeroRecipient();

        emit Withdrawn(to, amount);
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed(to, amount);
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
