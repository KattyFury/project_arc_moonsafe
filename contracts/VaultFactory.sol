// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface IVaultProxy {
    function initialize(address owner_) external;
    function meetsMinimum(uint256 minAmount) external view returns (bool);
}

contract VaultFactory is Ownable {
    error VaultAlreadyExists();
    error ZeroAddress();
    error InsufficientFee();
    error FeeTransferFailed();
    error RefundFailed();

    event VaultCreated(address indexed owner, address indexed vault);
    event FeeRecipientUpdated(address indexed oldFeeRecipient, address indexed newFeeRecipient);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    address public immutable implementation;

    mapping(address owner => address vault) public ownerToVault;

    address public feeRecipient;
    uint256 public fee;

    constructor(address implementation_, address feeRecipient_, uint256 fee_) Ownable(msg.sender) {
        if (implementation_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();

        implementation = implementation_;
        feeRecipient = feeRecipient_;
        fee = fee_;
    }

    function createVault() external payable returns (address vault) {
        if (msg.value < fee) revert InsufficientFee();
        if (ownerToVault[msg.sender] != address(0)) revert VaultAlreadyExists();

        (bool ok,) = feeRecipient.call{value: msg.value}("");
        if (!ok) revert FeeTransferFailed();

        vault = Clones.clone(implementation);
        IVaultProxy(vault).initialize(msg.sender);

        ownerToVault[msg.sender] = vault;

        emit VaultCreated(msg.sender, vault);

        if (msg.value > fee) {
            uint256 refundAmount = msg.value - fee;
            (bool refund,) = msg.sender.call{value: refundAmount}("");
            if (!refund) revert RefundFailed();
        }
    }

    function getVault(address owner) external view returns (address) {
        return ownerToVault[owner];
    }

    function hasVault(address owner) external view returns (bool) {
        return ownerToVault[owner] != address(0);
    }

    function vaultMeetsMinimum(address owner, uint256 minAmount) external view returns (bool) {
        address vault = ownerToVault[owner];
        if (vault == address(0)) {
            return false;
        }

        return IVaultProxy(vault).meetsMinimum(minAmount);
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();

        address oldFeeRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(oldFeeRecipient, newFeeRecipient);
    }

    function setFee(uint256 newFee) external onlyOwner {
        uint256 oldFee = fee;
        fee = newFee;

        emit FeeUpdated(oldFee, newFee);
    }
}
