// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CommonBase} from "forge-std/Base.sol";

/// @dev Emulates Arc's USDC ERC-20 view over the native balance: 6 decimals, one base unit
/// equals 1e12 native units and balanceOf(a) = a.balance / 1e12. A contract cannot move another
/// account's native balance, so moves use a pranked value call (`vm.prank(from)` + call{value}).
/// Recipients must accept plain native value.
contract MockNativeUsdc is CommonBase {
    uint256 public constant SCALE = 1e12;

    string public constant name = "Mock Native USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external pure returns (uint256) {
        return type(uint256).max;
    }

    function balanceOf(address a) public view returns (uint256) {
        return a.balance / SCALE;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockNativeUsdc: allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf(from) >= amount, "MockNativeUsdc: balance");
        uint256 native = amount * SCALE;
        // A pranked value-carrying call moves `from`'s native balance AND is journaled, so a revert
        // further up the stack rolls the move back (vm.deal is NOT journaled).
        vm.prank(from);
        (bool ok,) = payable(to).call{value: native}("");
        require(ok, "MockNativeUsdc: native move failed");
        emit Transfer(from, to, amount);
    }
}
