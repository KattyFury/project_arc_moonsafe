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

/// @dev Pushes native value into a target without calling any of its functions (selfdestruct).
contract ForceSender {
    constructor(address payable target) payable {
        selfdestruct(target);
    }
}

/// @dev Fee recipient that tries to re-enter the factory when paid by withdrawFees.
contract ReentrantFeeRecipient {
    enum Mode {
        WithdrawFees,
        CreateVault
    }

    error Bubbled();

    VaultFactory public factory;
    Mode public mode;
    bool public bubble;
    bool public attempted;
    bool public reentrySucceeded;
    uint256 public accruedAtReceive = type(uint256).max;
    bytes public revertData;

    function setFactory(VaultFactory f) external {
        factory = f;
    }

    function setMode(Mode m) external {
        mode = m;
    }

    function setBubble(bool b) external {
        bubble = b;
    }

    receive() external payable {
        attempted = true;
        accruedAtReceive = factory.accruedFees();
        if (mode == Mode.WithdrawFees) {
            try factory.withdrawFees() {
                reentrySucceeded = true;
            } catch (bytes memory d) {
                revertData = d;
                if (bubble) revert Bubbled();
            }
        } else {
            try factory.createVault{value: msg.value}() returns (address) {
                reentrySucceeded = true;
            } catch (bytes memory d) {
                revertData = d;
                if (bubble) revert Bubbled();
            }
        }
    }
}

/// @dev Contract wallet that creates / uses a vault and can misbehave when it receives value.
contract VaultActor {
    enum Mode {
        Accept,
        Reject,
        ReenterFactory,
        ReenterWithdraw,
        ReenterWithdrawFees
    }

    event Received(uint256 amount);

    VaultFactory public factory;
    VaultProxy public vault;
    Mode public mode;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public revertData;
    address public vaultAtReceive;
    uint256 public accruedAtReceive;

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
        emit Received(msg.value);
        vaultAtReceive = factory.getVault(address(this));
        accruedAtReceive = factory.accruedFees();
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
        } else if (mode == Mode.ReenterWithdrawFees) {
            attempted = true;
            try factory.withdrawFees() {
                reentrySucceeded = true;
            } catch (bytes memory d) {
                revertData = d;
            }
        }
    }
}

/// @dev Models an Arc/Circle-blocklisted address: while `blocked`, any native value sent to it reverts.
/// It can act as payer, vault owner, vault withdrawal recipient or fee recipient.
contract BlocklistableAccount {
    VaultFactory public immutable factory;
    VaultProxy public vault;
    bool public blocked;

    constructor(VaultFactory f) {
        factory = f;
    }

    function setBlocked(bool b) external {
        blocked = b;
    }

    function create() external payable returns (address v) {
        v = factory.createVault{value: msg.value}();
        vault = VaultProxy(payable(v));
    }

    function deposit() external payable {
        vault.deposit{value: msg.value}();
    }

    function withdraw(uint256 amount, address payable to) external {
        vault.withdraw(amount, to);
    }

    receive() external payable {
        if (blocked) revert("blocklisted");
    }
}
