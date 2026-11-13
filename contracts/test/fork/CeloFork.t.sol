// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {RestMyCase} from "../../src/RestMyCase.sol";
import {IIdentity} from "../../src/interfaces/IIdentity.sol";
import {IRandomnessSource} from "../../src/interfaces/IRandomnessSource.sol";
import {WitnetRandomnessSource, IWitnetRandomnessV2} from "../../src/randomness/WitnetRandomnessSource.sol";
import {MockRandomness} from "../mocks/MockRandomness.sol";

interface IIdentityV4 {
    function isWhitelisted(address) external view returns (bool);
    function connectAccount(address account) external;
}

/// @notice Fork test against the real GoodDollar contracts on Celo mainnet (read-only fork, nothing is broadcast).
///         Run with: RUN_FORK_TESTS=true forge test --match-path test/fork/CeloFork.t.sol
contract CeloForkTest is Test {
    uint256 internal constant FORK_BLOCK = 81_975_620;
    IERC20 internal constant GD = IERC20(0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A); // production G$
    address internal constant IDENTITY = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42; // production Identity
    address internal constant UBI_SCHEME = 0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1; // G$ holder used for funding
    address internal constant WITNET = 0xC0FFEE98AD1434aCbDB894BbB752e138c1006fAB; // WitnetRandomnessV2 (Witnet docs)
    uint256 internal constant WITNET_RANDOMIZED_BLOCK = 70_992_257; // a past, resolved randomize on Celo

    // Real face-verified addresses (WhitelistedAdded events shortly before FORK_BLOCK).
    address[10] internal humans = [
        0xA45498E89CdF8a27ecC43A5f0423fA803B93021f,
        0xCD687aD85C9953ee2ea78F7fD1cA368549ABcF7a,
        0xF7a73Df4bd200afDC722923e07A9718cFCd8cf02,
        0x16B1a1C30BDb56a9FFA2e45E91Df7Eb5033343D4,
        0x75C2A6908bb1f01D6A5a1eA0f7A0b8eee378b6Ea,
        0x9b22122942F6439Cf0253A4C392373604b105b10,
        0x6568112B3706A4f0247E24cF50cF5beC781D9Dcd,
        0xc21DE625b4929C1f2840bB101A8b277126A26D34,
        0xcE390e65C5a4aFB129405EdF14F9A46438531813,
        0xA4634427d964402A76F91E2Ff2361A07f9D789f6
    ];

    uint256 internal constant FEE = 100e18;
    uint256 internal constant INVITE_PK = 0xA11CE;
    RestMyCase internal wr;
    MockRandomness internal rng;
    address internal partyA;
    address internal partyB;

    function setUp() public {
        if (!vm.envOr("RUN_FORK_TESTS", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork("celo", FORK_BLOCK);
        rng = new MockRandomness(); // Witnet cannot resolve inside a fork; tested separately below
        wr = new RestMyCase(
            RestMyCase.Config({
                token: GD,
                identity: IIdentity(IDENTITY),
                randomnessSource: IRandomnessSource(address(rng)),
                owner: address(this),
                standardFee: FEE,
                fastFee: 300e18,
                jurySize: 5,
                minPoolSize: 7,
                joinWindow: 1 days,
                drawWindow: 1 hours
            })
        );
        partyA = humans[0];
        partyB = humans[1];
        for (uint256 i; i < humans.length; ++i) {
            assertTrue(IIdentityV4(IDENTITY).isWhitelisted(humans[i]), "fixture not verified at fork block");
        }
        for (uint256 i = 2; i < humans.length; ++i) {
            vm.prank(humans[i]);
            wr.joinPool();
        }
        _fund(partyA);
        _fund(partyB);
        vm.roll(block.number + 1);
    }

    function _fund(address who) internal {
        vm.prank(UBI_SCHEME);
        GD.transfer(who, 2 * FEE);
        vm.prank(who);
        GD.approve(address(wr), type(uint256).max);
    }

    function _sig(uint256 caseId, address joiner) internal view returns (bytes memory) {
        bytes32 d = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode("RestMyCase.join", block.chainid, address(wr), caseId, joiner))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(INVITE_PK, d);
        return abi.encodePacked(r, s, v);
    }

    function test_Fork_DecimalsMatchFeeConstants() public view {
        (bool ok, bytes memory ret) = address(GD).staticcall(abi.encodeWithSignature("decimals()"));
        assertTrue(ok);
        assertEq(abi.decode(ret, (uint8)), 18);
        assertEq(wr.MAX_CASE_FEE(), 1_000 * 1e18);
    }

    function test_Fork_FullFlowWithRealGoodDollarAndIdentity() public {
        uint256 balA = GD.balanceOf(partyA);
        vm.prank(partyA);
        uint256 caseId = wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, keccak256("A"), vm.addr(INVITE_PK));
        bytes memory sig = _sig(caseId, partyB);
        vm.prank(partyB);
        wr.joinCase(caseId, keccak256("B"), RestMyCase.Speed.Standard, FEE, sig);
        assertEq(GD.balanceOf(address(wr)), 2 * FEE, "real G$ received in full (no transfer fee)");
        assertEq(GD.balanceOf(partyA), balA - FEE);

        wr.requestJury(caseId);
        rng.fulfill(wr.getCase(caseId).randomnessId, keccak256("fork-seed"));
        wr.drawJury(caseId);
        address[] memory j = wr.getJurors(caseId);
        assertEq(j.length, 5);

        for (uint256 i; i < 5; ++i) {
            assertTrue(j[i] != partyA && j[i] != partyB);
            bytes32 c = wr.computeCommitment(caseId, j[i], i < 3 ? 2 : 1, bytes32(i));
            vm.prank(j[i]);
            wr.commitVote(caseId, c);
        }
        for (uint256 i; i < 5; ++i) {
            vm.prank(j[i]);
            wr.revealVote(caseId, i < 3 ? 2 : 1, bytes32(i));
        }
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(RestMyCase.Verdict.PartyB));

        for (uint256 i; i < 5; ++i) {
            uint256 before = GD.balanceOf(j[i]);
            vm.prank(j[i]);
            wr.withdraw();
            assertEq(GD.balanceOf(j[i]) - before, 2 * FEE / 5);
        }
        assertEq(GD.balanceOf(address(wr)), 0);
    }

    /// One-sided with real G$ and real verified humans: only A pays, no join, jury says Wrong, pot to revealers.
    function test_Fork_OneSidedWithRealGoodDollar() public {
        vm.prank(UBI_SCHEME);
        GD.transfer(partyA, 300e18); // the Fast fee is more than setUp's 2 x Standard funding
        uint256 balA = GD.balanceOf(partyA);
        vm.prank(partyA);
        uint256 caseId = wr.openCase(RestMyCase.Speed.Fast, RestMyCase.Mode.OneSided, keccak256("A only"), address(0));
        uint256 fee = wr.getCase(caseId).fee;
        assertEq(GD.balanceOf(partyA), balA - fee, "only A pays");
        assertEq(GD.balanceOf(address(wr)), fee);

        wr.requestJury(caseId); // no join step
        rng.fulfill(wr.getCase(caseId).randomnessId, keccak256("fork-one-sided"));
        wr.drawJury(caseId);
        address[] memory j = wr.getJurors(caseId);
        assertEq(j.length, 5);
        for (uint256 i; i < 5; ++i) {
            assertTrue(j[i] != partyA);
            bytes32 commitment = wr.computeCommitment(caseId, j[i], i < 3 ? 2 : 1, bytes32(i + 100));
            vm.prank(j[i]); // after the view call, so the prank applies to commitVote
            wr.commitVote(caseId, commitment);
        }
        for (uint256 i; i < 5; ++i) {
            vm.prank(j[i]);
            wr.revealVote(caseId, i < 3 ? 2 : 1, bytes32(i + 100));
        }
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(RestMyCase.Verdict.PartyB), "Wrong");
        for (uint256 i; i < 5; ++i) {
            uint256 before = GD.balanceOf(j[i]);
            vm.prank(j[i]);
            wr.withdraw();
            assertEq(GD.balanceOf(j[i]) - before, fee / 5);
        }
        assertEq(GD.balanceOf(address(wr)), 0);
        assertEq(wr.owed(address(0)), 0);
    }

    function test_Fork_RealConnectedWalletIsSamePerson() public {
        // partyA connects a fresh wallet on the REAL Identity contract; it resolves to partyA and cannot be B.
        address alt = makeAddr("alt");
        vm.prank(partyA);
        IIdentityV4(IDENTITY).connectAccount(alt);
        assertEq(IIdentity(IDENTITY).getWhitelistedRoot(alt), partyA);

        _fund(alt);
        vm.prank(partyA);
        uint256 caseId = wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, keccak256("A"), vm.addr(INVITE_PK));
        bytes memory sig = _sig(caseId, alt);
        vm.prank(alt);
        vm.expectRevert(RestMyCase.SameIdentity.selector);
        wr.joinCase(caseId, keccak256("B"), RestMyCase.Speed.Standard, FEE, sig);

        // ...and cannot take a second jury seat for the same person.
        vm.prank(humans[2]);
        IIdentityV4(IDENTITY).connectAccount(makeAddr("alt2"));
        vm.prank(makeAddr("alt2"));
        vm.expectRevert(RestMyCase.AlreadyInPool.selector);
        wr.joinPool();
    }

    function test_Fork_UnverifiedRejectedByRealIdentity() public {
        address nobody = makeAddr("nobody");
        vm.prank(nobody);
        vm.expectRevert(RestMyCase.NotVerified.selector);
        wr.joinPool();
    }

    function test_Fork_WitnetAdapterAgainstRealWitnet() public {
        WitnetRandomnessSource src = new WitnetRandomnessSource(IWitnetRandomnessV2(WITNET));
        // Reads a real, already-resolved Witnet randomness value.
        assertTrue(src.isReady(WITNET_RANDOMIZED_BLOCK));
        assertTrue(src.randomness(WITNET_RANDOMIZED_BLOCK) != bytes32(0));

        // Posts a real randomize request (on the fork) and checks fee handling.
        vm.txGasPrice(25 gwei);
        uint256 fee = src.fee(25 gwei);
        assertGt(fee, 0);
        address payer = makeAddr("payer");
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        uint256 id = src.request{value: fee + 0.1 ether}(payer);
        assertEq(id, block.number);
        assertEq(payer.balance, 1 ether - fee, "only the Witnet estimate is spent");
        assertFalse(src.isReady(id), "pending until the Witnet network resolves it");
    }
}
