// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRandomnessSource} from "../interfaces/IRandomnessSource.sol";

/// @notice Subset of WitnetRandomnessV2 (Celo mainnet 0xC0FFEE98AD1434aCbDB894BbB752e138c1006fAB,
///         per https://docs.witnet.io/smart-contracts/witnet-randomness-oracle/contract-addresses).
interface IWitnetRandomnessV2 {
    function estimateRandomizeFee(uint256 evmGasPrice) external view returns (uint256);
    function randomize() external payable returns (uint256 evmRandomizeFee);
    function isRandomized(uint256 blockNumber) external view returns (bool);
    function fetchRandomnessAfter(uint256 blockNumber) external view returns (bytes32);
}

/// @title WitnetRandomnessSource
/// @notice Production randomness for WhosRight on Celo mainnet.
/// @dev Witnet behaviour this adapter relies on (verified against the deployed WitnetRandomnessV2 source):
///  - `randomize()` keeps the whole msg.value it is sent (overpayment is NOT refunded), unless a randomize
///    already happened in this block, in which case it refunds everything with `transfer` (2300 gas).
///    So we forward exactly `estimateRandomizeFee(tx.gasprice)` and return the rest to the payer.
///  - `fetchRandomnessAfter(b)` returns the result of the first NON-ERRORED randomize at or after block `b`.
///    The request key is the block number of the first request and never changes on retry, so a retry after
///    a Witnet error cannot be used to re-roll an already-known seed.
contract WitnetRandomnessSource is IRandomnessSource {
    IWitnetRandomnessV2 public immutable witnet;

    error InsufficientFee(uint256 sent, uint256 required);
    error RefundFailed();
    error OnlyWitnet();

    constructor(IWitnetRandomnessV2 witnet_) {
        witnet = witnet_;
    }

    /// @dev Witnet refunds via `transfer` (2300 gas); keep this cheap.
    receive() external payable {
        if (msg.sender != address(witnet)) revert OnlyWitnet();
    }

    function fee(uint256 gasPrice) external view returns (uint256) {
        return witnet.estimateRandomizeFee(gasPrice);
    }

    function request(address refundTo) external payable returns (uint256 requestId) {
        _randomize(refundTo);
        return block.number;
    }

    function retry(uint256 requestId, address refundTo) external payable returns (uint256) {
        _randomize(refundTo);
        return requestId; // same key: first non-errored randomize at/after the original block
    }

    function isReady(uint256 requestId) external view returns (bool) {
        return witnet.isRandomized(requestId);
    }

    function randomness(uint256 requestId) external view returns (bytes32) {
        return witnet.fetchRandomnessAfter(requestId);
    }

    function _randomize(address refundTo) private {
        uint256 required = witnet.estimateRandomizeFee(tx.gasprice);
        if (msg.value < required) revert InsufficientFee(msg.value, required);
        witnet.randomize{value: required}();
        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            (bool ok,) = refundTo.call{value: leftover}("");
            if (!ok) revert RefundFailed();
        }
    }
}
