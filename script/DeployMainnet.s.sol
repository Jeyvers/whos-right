// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WhosRight} from "../src/WhosRight.sol";
import {IIdentity} from "../src/interfaces/IIdentity.sol";
import {IRandomnessSource} from "../src/interfaces/IRandomnessSource.sol";
import {WitnetRandomnessSource, IWitnetRandomnessV2} from "../src/randomness/WitnetRandomnessSource.sol";

interface IClass {
    function class() external view returns (string memory);
}

interface IDecimals {
    function decimals() external view returns (uint8);
}

/// @notice Celo MAINNET deployment. DO NOT BROADCAST without explicit approval.
/// Dry run (no broadcast):
///   forge script script/DeployMainnet.s.sol --rpc-url celo --account whosright-deployer
/// Broadcast (only after approval):
///   forge script script/DeployMainnet.s.sol --rpc-url celo --account whosright-deployer --broadcast
/// Addresses come from GoodDollar's GoodProtocol releases/deployment.json ("production-celo") and Witnet's
/// official randomness contract-address catalog; each is sanity-checked on-chain before deploying.
contract DeployMainnet is Script {
    uint256 internal constant CELO_MAINNET = 42220;
    address internal constant GOOD_DOLLAR = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;
    address internal constant IDENTITY = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42;
    address internal constant WITNET_RANDOMNESS = 0xC0FFEE98AD1434aCbDB894BbB752e138c1006fAB;

    function run() external returns (WhosRight wr) {
        require(block.chainid == CELO_MAINNET, "DeployMainnet: not Celo mainnet");
        require(IDecimals(GOOD_DOLLAR).decimals() == 18, "G$ decimals changed");
        require(IIdentity(IDENTITY).getWhitelistedRoot(address(0xdead)) == address(0), "Identity sanity");
        require(
            keccak256(bytes(IClass(WITNET_RANDOMNESS).class())) == keccak256("WitnetRandomnessV2"),
            "Witnet randomness contract mismatch"
        );

        WhosRight.Config memory cfg = WhosRight.Config({
            token: IERC20(GOOD_DOLLAR),
            identity: IIdentity(IDENTITY),
            randomnessSource: IRandomnessSource(address(0)), // set below
            owner: msg.sender, // deployer keystore at launch; move to a multisig after launch
            caseFee: vm.envOr("CASE_FEE", uint256(500e18)),
            jurySize: vm.envOr("JURY_SIZE", uint256(5)),
            minPoolSize: vm.envOr("MIN_POOL_SIZE", uint256(11)),
            joinWindow: vm.envOr("JOIN_WINDOW", uint256(3 days)),
            drawWindow: vm.envOr("DRAW_WINDOW", uint256(2 hours)), // Witnet usually 5-10 min; room for retries
            commitWindow: vm.envOr("COMMIT_WINDOW", uint256(1 days)),
            revealWindow: vm.envOr("REVEAL_WINDOW", uint256(1 days))
        });

        vm.startBroadcast();
        WitnetRandomnessSource rng = new WitnetRandomnessSource(IWitnetRandomnessV2(WITNET_RANDOMNESS));
        cfg.randomnessSource = IRandomnessSource(address(rng));
        wr = new WhosRight(cfg);
        vm.stopBroadcast();

        console.log("WitnetRandomnessSource", address(rng));
        console.log("WhosRight             ", address(wr));
        console.log("owner                 ", msg.sender);
        console.log("caseFee (wei)         ", cfg.caseFee);
        console.log("minPoolSize           ", cfg.minPoolSize);
    }
}
