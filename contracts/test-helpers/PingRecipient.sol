// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Native-value receiver that emits an event from its receive callback, to observe log ordering.
contract PingRecipient {
    event Pinged(uint256 amount);

    receive() external payable {
        emit Pinged(msg.value);
    }
}
