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
///   cast wallet import whos-right --interactive
///   forge script script/DeployTestnet.s.sol --rpc-url celo_sepolia --account whos-right --broadcast
/// Optional env overrides: JURY_SIZE, MIN_POOL_SIZE, JOIN_WINDOW, DRAW_WINDOW
/// Reuse existing testnet stand-ins (keeps testers' tG$ and self-verification) instead of deploying new ones:
///   TESTNET_TOKEN, TESTNET_IDENTITY, TESTNET_RANDOMNESS
/// (fees and voting windows are fixed presets; the owner can later change fees within the cap)
contract DeployTestnet is Script {
    uint256 internal constant CELO_SEPOLIA = 11142220;

    function run() external returns (WhosRight wr) {
        require(block.chainid == CELO_SEPOLIA, "DeployTestnet: not Celo Sepolia");

        vm.startBroadcast();
        // Owner = the broadcasting account (from --account), read explicitly.
        (, address deployer,) = vm.readCallers();
        address tokenAddr = vm.envOr("TESTNET_TOKEN", address(0));
        address identityAddr = vm.envOr("TESTNET_IDENTITY", address(0));
        address rngAddr = vm.envOr("TESTNET_RANDOMNESS", address(0));
        TestnetGoodDollar token = tokenAddr == address(0) ? new TestnetGoodDollar() : TestnetGoodDollar(tokenAddr);
        TestnetIdentity identity = identityAddr == address(0) ? new TestnetIdentity() : TestnetIdentity(identityAddr);
        InsecureTestnetRandomness rng =
            rngAddr == address(0) ? new InsecureTestnetRandomness() : InsecureTestnetRandomness(rngAddr);
        wr = new WhosRight(
            WhosRight.Config({
                token: IERC20(address(token)),
                identity: IIdentity(address(identity)),
                randomnessSource: IRandomnessSource(address(rng)),
                owner: deployer,
                standardFee: 100e18, // Standard: 100 G$ per party, 6h max commit + 6h max reveal
                fastFee: 300e18, // Fast: 300 G$ per party, 1h max commit + 1h max reveal
                jurySize: vm.envOr("JURY_SIZE", uint256(5)),
                minPoolSize: vm.envOr("MIN_POOL_SIZE", uint256(7)),
                joinWindow: vm.envOr("JOIN_WINDOW", uint256(1 days)),
                drawWindow: vm.envOr("DRAW_WINDOW", uint256(1 hours))
            })
        );
        vm.stopBroadcast();

        console.log("TestnetGoodDollar   ", address(token));
        console.log("TestnetIdentity     ", address(identity));
        console.log("InsecureRandomness  ", address(rng));
        console.log("WhosRight           ", address(wr));
        console.log("owner               ", deployer);
    }
}
