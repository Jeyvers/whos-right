// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestnetGoodDollar
/// @notice TESTNET ONLY. Worthless stand-in for G$ (18 decimals, like G$ on Celo) with a public faucet,
///         because GoodDollar has no contracts on Celo Sepolia. Refuses to deploy on Celo mainnet.
contract TestnetGoodDollar is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 10_000e18;

    error NotOnMainnet();

    constructor() ERC20("Test GoodDollar", "tG$") {
        if (block.chainid == 42220) revert NotOnMainnet();
    }

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
