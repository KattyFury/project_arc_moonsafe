// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPyth} from "../DcaPlan.sol";

/// @dev Settable subset of the Pyth interface used by DcaPlan.
contract MockPyth {
    error InsufficientFee(uint256 sent, uint256 required);
    error UpdateReverted();
    error StalePrice(uint256 publishTime, uint256 age);
    error WrongPriceId(bytes32 got, bytes32 expected);

    int64 public price;
    uint64 public conf;
    int32 public expo;
    uint256 public publishTime;
    uint256 public fee;
    bool public revertOnUpdate;

    uint256 public updateCalls;
    uint256 public totalFeesReceived;
    bytes32 public expectedId;
    bool public checkId;

    function setPrice(int64 price_, uint64 conf_, int32 expo_) external {
        price = price_;
        conf = conf_;
        expo = expo_;
    }

    function setPublishTime(uint256 t) external {
        publishTime = t;
    }

    function setExpectedId(bytes32 id) external {
        expectedId = id;
        checkId = true;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    function setRevertOnUpdate(bool b) external {
        revertOnUpdate = b;
    }

    function getUpdateFee(bytes[] calldata) external view returns (uint256) {
        return fee;
    }

    function updatePriceFeeds(bytes[] calldata) external payable {
        if (revertOnUpdate) revert UpdateReverted();
        if (msg.value < fee) revert InsufficientFee(msg.value, fee);
        updateCalls++;
        totalFeesReceived += msg.value;
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (IPyth.Price memory) {
        if (checkId && id != expectedId) revert WrongPriceId(id, expectedId);
        if (publishTime + age < block.timestamp) revert StalePrice(publishTime, age);
        return IPyth.Price({price: price, conf: conf, expo: expo, publishTime: publishTime});
    }
}
