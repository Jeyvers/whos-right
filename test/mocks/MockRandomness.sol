// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRandomnessSource} from "../../src/interfaces/IRandomnessSource.sol";

/// @notice Test randomness: requests get sequential ids, the test fulfils them explicitly.
contract MockRandomness is IRandomnessSource {
    uint256 public nextId = 1;
    uint256 public requiredFee;
    mapping(uint256 => bytes32) public values;
    mapping(uint256 => bool) public ready;
    uint256 public retries;

    function setFee(uint256 f) external {
        requiredFee = f;
    }

    function fulfill(uint256 id, bytes32 value) external {
        values[id] = value;
        ready[id] = true;
    }

    function fee(uint256) external view returns (uint256) {
        return requiredFee;
    }

    function request(address refundTo) external payable returns (uint256 id) {
        id = nextId++;
        _refund(refundTo);
    }

    function retry(uint256 id, address refundTo) external payable returns (uint256) {
        retries++;
        _refund(refundTo);
        return id;
    }

    function isReady(uint256 id) external view returns (bool) {
        return ready[id];
    }

    function randomness(uint256 id) external view returns (bytes32) {
        require(ready[id], "not ready");
        return values[id];
    }

    function _refund(address to) private {
        require(msg.value >= requiredFee, "fee");
        uint256 extra = msg.value - requiredFee;
        if (extra > 0) {
            (bool ok,) = to.call{value: extra}("");
            require(ok, "refund");
        }
    }
}
