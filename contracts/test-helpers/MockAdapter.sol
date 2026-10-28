// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CommonBase} from "forge-std/Base.sol";
import {MockNativeUsdc} from "./MockNativeUsdc.sol";
import {MockCirBtc} from "./MockCirBtc.sol";

/// @dev Pushes native value into `target` without calling it (selfdestruct in constructor).
contract NativeForce {
    constructor(address target) payable {
        selfdestruct(payable(target));
    }
}

/// @dev Swap adapter mock. `swap` pulls USDC from the caller through transferFrom (needs allowance)
/// and mints cirBTC to `beneficiary`. Switches simulate every misbehaviour DcaPlan must survive.
contract MockAdapter is CommonBase {
    enum Reenter {
        None,
        ExecuteRound,
        Cancel,
        Sweep
    }

    MockNativeUsdc public immutable usdc;
    MockCirBtc public immutable btc;

    // behaviour switches
    bool public revertAll;
    bool public skipPull; // do not pull any USDC
    bool public usePullOverride;
    uint256 public pullOverride; // USDC to pull instead of usdcIn
    address public deliverTo; // deliver cirBTC here instead of the beneficiary
    uint256 public rogueSpend; // USDC units removed from the caller WITHOUT allowance
    uint256 public rogueReturn; // USDC units credited back to the caller
    uint256 public burnFromCaller; // cirBTC burned from the caller
    Reenter public reenter;
    bool public bubbleReentry;

    // observations
    uint256 public calls;
    uint256 public lastCallValue;
    address public lastCaller;
    uint256 public allowanceSeen;
    bool public reentryAttempted;
    bool public reentrySucceeded;
    bytes public reentryRevertData;

    receive() external payable {}

    constructor(MockNativeUsdc usdc_, MockCirBtc btc_) {
        usdc = usdc_;
        btc = btc_;
    }

    function setRevertAll(bool b) external {
        revertAll = b;
    }

    function setSkipPull(bool b) external {
        skipPull = b;
    }

    function setPullOverride(bool use, uint256 amount) external {
        usePullOverride = use;
        pullOverride = amount;
    }

    function setDeliverTo(address a) external {
        deliverTo = a;
    }

    function setRogueSpend(uint256 a) external {
        rogueSpend = a;
    }

    function setRogueReturn(uint256 a) external {
        rogueReturn = a;
    }

    function setBurnFromCaller(uint256 a) external {
        burnFromCaller = a;
    }

    function setReenter(Reenter r, bool bubble) external {
        reenter = r;
        bubbleReentry = bubble;
    }

    function swap(address beneficiary, uint256 usdcIn, uint256 btcOut) external payable {
        if (revertAll) revert("MockAdapter: revert");
        calls++;
        lastCaller = msg.sender;
        lastCallValue = msg.value;
        allowanceSeen = usdc.allowance(msg.sender, address(this));

        uint256 pull = usePullOverride ? pullOverride : usdcIn;
        if (!skipPull && pull != 0) usdc.transferFrom(msg.sender, address(this), pull);

        if (rogueSpend != 0) {
            vm.prank(msg.sender);
            (bool ok,) = payable(address(this)).call{value: rogueSpend * 1e12}("");
            require(ok, "MockAdapter: rogue spend failed");
        }
        // credit funded from the adapter's own native balance (tests must deal it first)
        if (rogueReturn != 0) new NativeForce{value: rogueReturn * 1e12}(msg.sender);
        if (burnFromCaller != 0) btc.burn(msg.sender, burnFromCaller);

        if (btcOut != 0) btc.mint(deliverTo != address(0) ? deliverTo : beneficiary, btcOut);

        if (reenter != Reenter.None) _reenter(usdcIn, btcOut);
    }

    function _reenter(uint256 usdcIn, uint256 btcOut) internal {
        reentryAttempted = true;
        bytes memory data;
        if (reenter == Reenter.ExecuteRound) {
            bytes[] memory u = new bytes[](0);
            data = abi.encodeWithSignature(
                "executeRound(bytes,bytes[])", abi.encodeCall(this.swap, (msg.sender, usdcIn, btcOut)), u
            );
        } else if (reenter == Reenter.Cancel) {
            data = abi.encodeWithSignature("cancel()");
        } else {
            data = abi.encodeWithSignature("sweep()");
        }
        (bool ok, bytes memory ret) = msg.sender.call(data);
        reentrySucceeded = ok;
        reentryRevertData = ret;
        if (!ok && bubbleReentry) revert("MockAdapter: bubbled reentry failure");
    }
}
