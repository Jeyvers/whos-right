// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {WhosRight} from "../../src/WhosRight.sol";
import {IIdentity} from "../../src/interfaces/IIdentity.sol";
import {IRandomnessSource} from "../../src/interfaces/IRandomnessSource.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockGoodDollar} from "../mocks/MockGoodDollar.sol";
import {MockIdentity} from "../mocks/MockIdentity.sol";
import {MockRandomness} from "../mocks/MockRandomness.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

abstract contract BaseTest is Test {
    uint256 internal constant FEE = 100e18; // Standard
    uint256 internal constant FAST_FEE = 300e18;
    uint256 internal constant JURY = 5;
    uint256 internal constant MIN_POOL = 7;
    uint256 internal constant JOIN_WINDOW = 1 days;
    uint256 internal constant DRAW_WINDOW = 1 hours;

    MockGoodDollar internal gd;
    MockIdentity internal id;
    MockRandomness internal rng;
    WhosRight internal wr;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice"); // party A
    address internal bob = makeAddr("bob"); // party B
    uint256 internal invitePk = 0xA11CE;
    address internal inviteSigner;

    address[] internal pool; // verified juror wallets
    bytes32 internal constant CONTENT_A = keccak256("argument A");
    bytes32 internal constant CONTENT_B = keccak256("argument B");

    function setUp() public virtual {
        gd = new MockGoodDollar();
        id = new MockIdentity();
        rng = new MockRandomness();
        wr = new WhosRight(_config(JURY, MIN_POOL));
        inviteSigner = vm.addr(invitePk);

        _verify(alice);
        _verify(bob);
        for (uint256 i; i < 10; ++i) {
            address j = makeAddr(string.concat("juror", vm.toString(i)));
            _verify(j);
            pool.push(j);
            vm.prank(j);
            wr.joinPool();
        }
        vm.roll(block.number + 1);
    }

    function _config(uint256 jury, uint256 minPool) internal view returns (WhosRight.Config memory) {
        return WhosRight.Config({
            token: IERC20(address(gd)),
            identity: IIdentity(address(id)),
            randomnessSource: IRandomnessSource(address(rng)),
            owner: owner,
            standardFee: FEE,
            fastFee: FAST_FEE,
            jurySize: jury,
            minPoolSize: minPool,
            joinWindow: JOIN_WINDOW,
            drawWindow: DRAW_WINDOW
        });
    }

    function _verify(address who) internal {
        id.whitelist(who);
        gd.mint(who, 100_000e18);
        vm.prank(who);
        gd.approve(address(wr), type(uint256).max);
    }

    function _fund(address who) internal {
        gd.mint(who, 100_000e18);
        vm.prank(who);
        gd.approve(address(wr), type(uint256).max);
    }

    function _sig(uint256 caseId, address joiner) internal view returns (bytes memory) {
        return _sigWith(invitePk, caseId, joiner);
    }

    function _sigWith(uint256 pk, uint256 caseId, address joiner) internal view returns (bytes memory) {
        // Computed locally (no external call) so it does not consume a pending vm.prank.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _joinDigest(address(wr), caseId, joiner));
        return abi.encodePacked(r, s, v);
    }

    function _joinDigest(address target, uint256 caseId, address joiner) internal view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode("WhosRight.join", block.chainid, target, caseId, joiner))
        );
    }

    function _open() internal returns (uint256 caseId) {
        return _openSpeed(WhosRight.Speed.Standard);
    }

    function _openSpeed(WhosRight.Speed speed) internal returns (uint256 caseId) {
        vm.prank(alice);
        caseId = wr.openCase(speed, CONTENT_A, inviteSigner);
    }

    /// @dev Joins with the terms read from the case, as B's client would after showing them.
    function _join(uint256 caseId, address who) internal {
        WhosRight.Case memory c = wr.getCase(caseId);
        bytes memory sig = _sig(caseId, who);
        vm.prank(who);
        wr.joinCase(caseId, CONTENT_B, c.speed, c.fee, sig);
    }

    function _openAndJoin() internal returns (uint256 caseId) {
        caseId = _open();
        _join(caseId, bob);
    }

    function _openAndJoinSpeed(WhosRight.Speed speed) internal returns (uint256 caseId) {
        caseId = _openSpeed(speed);
        _join(caseId, bob);
    }

    function _toDrawn(bytes32 seed) internal returns (uint256 caseId) {
        return _toDrawnSpeed(seed, WhosRight.Speed.Standard);
    }

    function _toDrawnSpeed(bytes32 seed, WhosRight.Speed speed) internal returns (uint256 caseId) {
        caseId = _openAndJoinSpeed(speed);
        wr.requestJury(caseId);
        rng.fulfill(wr.getCase(caseId).randomnessId, seed);
        wr.drawJury(caseId);
    }

    function _salt(address juror) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", juror));
    }

    function _commit(uint256 caseId, address juror, uint8 vote) internal {
        bytes32 c = wr.computeCommitment(caseId, juror, vote, _salt(juror));
        vm.prank(juror);
        wr.commitVote(caseId, c);
    }

    function _reveal(uint256 caseId, address juror, uint8 vote) internal {
        vm.prank(juror);
        wr.revealVote(caseId, vote, _salt(juror));
    }

    /// @dev Jurors vote per `votes[i]`; 0 = do not commit.
    function _commitAll(uint256 caseId, uint8[] memory votes) internal {
        address[] memory j = wr.getJurors(caseId);
        for (uint256 i; i < j.length; ++i) {
            if (votes[i] != 0) _commit(caseId, j[i], votes[i]);
        }
    }

    function _votes(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[] memory v) {
        v = new uint8[](5);
        (v[0], v[1], v[2], v[3], v[4]) = (a, b, c, d, e);
    }
}
