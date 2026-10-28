// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev 8-decimal cirBTC mock. `mint` and `burn` are open so the adapter mock (and tests) can
/// deliver and remove balances freely.
contract MockCirBtc is ERC20 {
    constructor() ERC20("Mock cirBTC", "cirBTC") {}

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    enum Block {
        None,
        Revert,
        ReturnFalse
    }

    /// @dev Per-recipient failure mode for `transfer` ONLY (mint / transferFrom / burn are unaffected).
    mapping(address => Block) public blockMode;

    function setBlock(address to, Block mode) external {
        blockMode[to] = mode;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        Block m = blockMode[to];
        if (m == Block.Revert) revert("MockCirBtc: recipient blocked");
        if (m == Block.ReturnFalse) return false;
        return super.transfer(to, value);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}
