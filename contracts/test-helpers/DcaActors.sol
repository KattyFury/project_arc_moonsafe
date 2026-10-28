// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DcaFactory} from "../DcaFactory.sol";
import {DcaPlan} from "../DcaPlan.sol";

enum ReenterMode {
    None,
    ExecuteRound,
    Cancel,
    Sweep,
    CreatePlan
}

/// @dev Contract keeper. Its receive() can reject the Nth native payment (1-based) and/or re-enter.
contract DcaKeeper {
    DcaPlan public plan;
    uint256 public rejectAt; // reject the Nth incoming payment (0 = never)
    uint256 public receiveCount;
    uint256 public totalReceived;
    ReenterMode public mode;
    bool public bubble;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public reentryRevertData;
    bytes public adapterCallForReentry;

    constructor(DcaPlan plan_) {
        plan = plan_;
    }

    function setRejectAt(uint256 n) external {
        rejectAt = n;
    }

    function setReenter(ReenterMode m, bool bubble_, bytes calldata adapterCall) external {
        mode = m;
        bubble = bubble_;
        adapterCallForReentry = adapterCall;
    }

    function run(bytes calldata adapterCall, bytes[] calldata upd) external payable {
        plan.executeRound{value: msg.value}(adapterCall, upd);
    }

    receive() external payable {
        receiveCount++;
        if (rejectAt != 0 && receiveCount == rejectAt) revert("keeper rejects");
        totalReceived += msg.value;
        if (mode == ReenterMode.None) return;
        attempted = true;
        bytes memory data;
        if (mode == ReenterMode.ExecuteRound) {
            bytes[] memory u = new bytes[](0);
            data = abi.encodeCall(DcaPlan.executeRound, (adapterCallForReentry, u));
        } else if (mode == ReenterMode.Cancel) {
            data = abi.encodeCall(DcaPlan.cancel, ());
        } else {
            data = abi.encodeCall(DcaPlan.sweep, ());
        }
        (bool ok, bytes memory ret) = address(plan).call(data);
        reentrySucceeded = ok;
        reentryRevertData = ret;
        if (!ok && bubble) revert("keeper bubbled");
    }
}

/// @dev Contract plan owner. Creates plans through the factory, can reject native payments and re-enter.
contract DcaOwner {
    DcaFactory public factory;
    DcaPlan public plan;
    bool public reject;
    ReenterMode public mode;
    bool public bubble;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public reentryRevertData;
    uint256 public totalReceived;

    constructor(DcaFactory f) {
        factory = f;
    }

    function setReject(bool b) external {
        reject = b;
    }

    function setReenter(ReenterMode m, bool bubble_) external {
        mode = m;
        bubble = bubble_;
    }

    function create(uint96 amount, uint32 rounds, uint32 interval, uint16 dev) external payable returns (address p) {
        p = factory.createPlan{value: msg.value}(amount, rounds, interval, dev);
        plan = DcaPlan(payable(p));
    }

    function cancelPlan() external {
        plan.cancel();
    }

    function sweepPlan() external {
        plan.sweep();
    }

    receive() external payable {
        if (reject) revert("owner rejects");
        totalReceived += msg.value;
        if (mode == ReenterMode.None) return;
        attempted = true;
        bytes memory data;
        if (mode == ReenterMode.Cancel) {
            data = abi.encodeCall(DcaPlan.cancel, ());
        } else if (mode == ReenterMode.Sweep) {
            data = abi.encodeCall(DcaPlan.sweep, ());
        } else if (mode == ReenterMode.ExecuteRound) {
            bytes[] memory u = new bytes[](0);
            data = abi.encodeCall(DcaPlan.executeRound, (hex"", u));
        } else {
            data = abi.encodeCall(DcaFactory.createPlan, (1e6, 1, 3600, 100));
        }
        address target = mode == ReenterMode.CreatePlan ? address(factory) : address(plan);
        (bool ok, bytes memory ret) = target.call{value: mode == ReenterMode.CreatePlan ? 1.1e18 : 0}(data);
        reentrySucceeded = ok;
        reentryRevertData = ret;
        if (!ok && bubble) revert("owner bubbled");
    }
}
