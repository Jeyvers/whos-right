// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IRandomnessSource} from "../interfaces/IRandomnessSource.sol";

/// @title InsecureTestnetRandomness
/// @notice !!! INSECURE - TESTNET ONLY !!!
/// @dev Uses the hash of the block after the request. On Celo (an OP-Stack L2 with a single sequencer) the
///      sequencer can influence block hashes, and anyone can re-roll by letting the 256-block window expire and
///      calling retry. Witnet randomness is not deployed on Celo Sepolia, so this exists only so the full flow
///      can be exercised on testnet. The constructor refuses to deploy on Celo mainnet (chain id 42220).
contract InsecureTestnetRandomness is IRandomnessSource {
    uint256 public constant CELO_MAINNET_CHAIN_ID = 42220;

    error NotOnMainnet();
    error NoFeeRequired();

    constructor() {
        if (block.chainid == CELO_MAINNET_CHAIN_ID) revert NotOnMainnet();
    }

    function fee(uint256) external pure returns (uint256) {
        return 0;
    }

    function request(address) external payable returns (uint256) {
        if (msg.value != 0) revert NoFeeRequired();
        return block.number + 1;
    }

    function retry(uint256, address) external payable returns (uint256) {
        if (msg.value != 0) revert NoFeeRequired();
        return block.number + 1;
    }

    function isReady(uint256 requestId) external view returns (bool) {
        return block.number > requestId && block.number - requestId <= 256;
    }

    function randomness(uint256 requestId) external view returns (bytes32) {
        return keccak256(abi.encode(blockhash(requestId), requestId));
    }
}
