// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {VaultFactory} from "../VaultFactory.sol";
import {VaultProxy} from "../VaultProxy.sol";

/// @dev Native-value receiver that always reverts.
contract RejectingReceiver {
    receive() external payable {
        revert("nope");
    }
}

/// @dev Plain accepting receiver.
contract AcceptingReceiver {
    receive() external payable {}
}

/// @dev Fee recipient that tries to re-enter VaultFactory.createVault when paid.
contract ReentrantFeeRecipient {
    error Bubbled();

    VaultFactory public factory;
    bool public bubble;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public revertData;

    function setFactory(VaultFactory f) external {
        factory = f;
    }

    function setBubble(bool b) external {
        bubble = b;
    }

    receive() external payable {
        attempted = true;
        try factory.createVault{value: msg.value}() returns (address) {
            reentrySucceeded = true;
        } catch (bytes memory d) {
            revertData = d;
            if (bubble) revert Bubbled();
        }
    }
}

/// @dev Contract wallet that creates / uses a vault and can misbehave when it receives value.
contract VaultActor {
    enum Mode {
        Accept,
        Reject,
        ReenterFactory,
        ReenterWithdraw
    }

    VaultFactory public factory;
    VaultProxy public vault;
    Mode public mode;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public revertData;

    constructor(VaultFactory f) {
        factory = f;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function create() external payable returns (address v) {
        v = factory.createVault{value: msg.value}();
        vault = VaultProxy(payable(v));
    }

    function setVault(address v) external {
        vault = VaultProxy(payable(v));
    }

    function deposit() external payable {
        vault.deposit{value: msg.value}();
    }

    function withdraw(uint256 amount, address payable to) external {
        vault.withdraw(amount, to);
    }

    receive() external payable {
        if (mode == Mode.Reject) revert("no value accepted");
        if (mode == Mode.ReenterFactory) {
            attempted = true;
            try factory.createVault{value: address(this).balance}() returns (address) {
                reentrySucceeded = true;
            } catch (bytes memory d) {
                revertData = d;
            }
        } else if (mode == Mode.ReenterWithdraw) {
            attempted = true;
            try vault.withdraw(1, payable(address(this))) {
                reentrySucceeded = true;
            } catch (bytes memory d) {
                revertData = d;
            }
        }
    }
}
