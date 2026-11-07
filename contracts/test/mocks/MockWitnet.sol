// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Reproduces WitnetRandomnessV2's fee semantics: keeps the whole msg.value on the first randomize of a
///         block, refunds everything via `transfer` (2300 gas) on later calls in the same block.
contract MockWitnet {
    uint256 public baseFee = 0.05 ether;
    uint256 public lastRandomizeBlock;
    uint256 public collected;
    mapping(uint256 => bytes32) public resultAt; // block => randomness (0 = pending)
    mapping(uint256 => bool) public errored;

    function estimateRandomizeFee(uint256) external view returns (uint256) {
        return baseFee;
    }

    function setBaseFee(uint256 f) external {
        baseFee = f;
    }

    function randomize() external payable returns (uint256 fee) {
        if (lastRandomizeBlock < block.number) {
            require(msg.value >= baseFee, "insufficient reward");
            fee = msg.value;
            collected += fee;
            lastRandomizeBlock = block.number;
        }
        if (fee < msg.value) payable(msg.sender).transfer(msg.value - fee);
    }

    function resolve(uint256 blockNumber, bytes32 value) external {
        resultAt[blockNumber] = value;
    }

    function isRandomized(uint256 blockNumber) external view returns (bool) {
        return resultAt[blockNumber] != bytes32(0);
    }

    function fetchRandomnessAfter(uint256 blockNumber) external view returns (bytes32) {
        require(resultAt[blockNumber] != bytes32(0), "pending randomize");
        return keccak256(abi.encode(blockNumber, resultAt[blockNumber]));
    }
}
