// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WhosRight} from "../src/WhosRight.sol";
import {IIdentity} from "../src/interfaces/IIdentity.sol";
import {IRandomnessSource} from "../src/interfaces/IRandomnessSource.sol";
import {InsecureTestnetRandomness} from "../src/randomness/InsecureTestnetRandomness.sol";
import {TestnetGoodDollar} from "../src/testnet/TestnetGoodDollar.sol";
import {TestnetIdentity} from "../src/testnet/TestnetIdentity.sol";

/// @notice Celo Sepolia deployment: test G$ (faucet), test Identity (self-verify), INSECURE randomness.
/// Usage (encrypted keystore, never a raw key):
///   cast wallet import whosright-deployer --interactive
///   forge script script/DeployTestnet.s.sol --rpc-url celo_sepolia --account whosright-deployer --broadcast
/// Optional env overrides: CASE_FEE, JURY_SIZE, MIN_POOL_SIZE, JOIN_WINDOW, DRAW_WINDOW, COMMIT_WINDOW, REVEAL_WINDOW
contract DeployTestnet is Script {
    uint256 internal constant CELO_SEPOLIA = 11142220;

    function run() external returns (WhosRight wr) {
        require(block.chainid == CELO_SEPOLIA, "DeployTestnet: not Celo Sepolia");

        vm.startBroadcast();
        TestnetGoodDollar token = new TestnetGoodDollar();
        TestnetIdentity identity = new TestnetIdentity();
        InsecureTestnetRandomness rng = new InsecureTestnetRandomness();
        wr = new WhosRight(
            WhosRight.Config({
                token: IERC20(address(token)),
                identity: IIdentity(address(identity)),
                randomnessSource: IRandomnessSource(address(rng)),
                owner: msg.sender,
                caseFee: vm.envOr("CASE_FEE", uint256(500e18)),
                jurySize: vm.envOr("JURY_SIZE", uint256(5)),
                minPoolSize: vm.envOr("MIN_POOL_SIZE", uint256(7)),
                joinWindow: vm.envOr("JOIN_WINDOW", uint256(1 days)),
                drawWindow: vm.envOr("DRAW_WINDOW", uint256(1 hours)),
                commitWindow: vm.envOr("COMMIT_WINDOW", uint256(15 minutes)),
                revealWindow: vm.envOr("REVEAL_WINDOW", uint256(15 minutes))
            })
        );
        vm.stopBroadcast();

        console.log("TestnetGoodDollar   ", address(token));
        console.log("TestnetIdentity     ", address(identity));
        console.log("InsecureRandomness  ", address(rng));
        console.log("WhosRight           ", address(wr));
        console.log("owner               ", msg.sender);
    }
}
