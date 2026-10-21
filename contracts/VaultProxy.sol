// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VaultProxy is ReentrancyGuard {
    error AlreadyInitialized();
    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    event Deposited(address indexed owner, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount, address indexed to);

    address private _owner;
    bool private _initialized;

    modifier onlyOwner() {
        if (msg.sender != _owner) revert NotOwner();
        _;
    }

    function initialize(address owner_) external {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert ZeroAddress();

        _owner = owner_;
        _initialized = true;
    }

    function deposit() external payable onlyOwner nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(_owner, msg.value);
    }

    function depositFor() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        emit Deposited(_owner, msg.value);
    }

    function withdraw(uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(_owner, amount, to);
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function meetsMinimum(uint256 minAmount) external view returns (bool) {
        return address(this).balance >= minAmount;
    }

    receive() external payable {}
}
