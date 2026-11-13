// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {RestMyCase} from "../../src/RestMyCase.sol";
import {MockGoodDollar} from "../mocks/MockGoodDollar.sol";
import {MockRandomness} from "../mocks/MockRandomness.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract Handler is Test {
    RestMyCase public wr;
    MockGoodDollar public gd;
    MockRandomness public rng;
    address[] public parties;
    address[] public jurors;
    uint256 internal constant INVITE_PK = 0xA11CE;

    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;
    uint256 public nOpened;
    uint256 public nJoined;
    uint256 public nDrawn;
    uint256 public nReveals;
    uint256 public nResolved;
    uint256 public nRefunded;
    uint256 public nWithdrawals;
    mapping(uint256 => mapping(address => uint8)) internal committedVote;

    constructor(RestMyCase wr_, MockGoodDollar gd_, MockRandomness rng_, address[] memory parties_, address[] memory jurors_) {
        wr = wr_;
        gd = gd_;
        rng = rng_;
        parties = parties_;
        jurors = jurors_;
    }

    function _case(uint256 seed) internal view returns (uint256) {
        uint256 n = wr.caseCount();
        return n == 0 ? 0 : bound(seed, 1, n);
    }

    function open(uint256 p) external {
        address a = parties[bound(p, 0, parties.length - 1)];
        uint256 before = gd.balanceOf(address(wr));
        vm.prank(a);
        // Both modes: one-sided cases skip the join step and go straight to the jury.
        RestMyCase.Mode mode = RestMyCase.Mode((p / 2) % 2);
        address invite = mode == RestMyCase.Mode.TwoSided ? vm.addr(INVITE_PK) : address(0);
        try wr.openCase(RestMyCase.Speed(p % 2), mode, keccak256(abi.encode(p)), invite) {
            ghostDeposited += gd.balanceOf(address(wr)) - before;
            nOpened++;
        } catch {}
    }

    function join(uint256 c, uint256 p) external {
        uint256 caseId = _case(c);
        if (caseId == 0) return;
        address b = parties[bound(p, 0, parties.length - 1)];
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode("RestMyCase.join", block.chainid, address(wr), caseId, b))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(INVITE_PK, digest);
        RestMyCase.Case memory k = wr.getCase(caseId);
        uint256 before = gd.balanceOf(address(wr));
        vm.prank(b);
        try wr.joinCase(caseId, keccak256("b"), k.speed, k.fee, abi.encodePacked(r, s, v)) {
            ghostDeposited += gd.balanceOf(address(wr)) - before;
            nJoined++;
        } catch {}
    }

    function requestAndDraw(uint256 c, bytes32 seed) external {
        uint256 caseId = _case(c);
        if (caseId == 0) return;
        try wr.requestJury(caseId) {} catch {}
        RestMyCase.Case memory k = wr.getCase(caseId);
        if (k.status != RestMyCase.Status.Drawing) return;
        rng.fulfill(k.randomnessId, seed);
        try wr.drawJury(caseId) {
            if (wr.getCase(caseId).status == RestMyCase.Status.Voting) nDrawn++;
        } catch {}
    }

    function commit(uint256 c, uint256 j, bool voteA) external {
        uint256 caseId = _case(c);
        if (caseId == 0) return;
        address[] memory js = wr.getJurors(caseId);
        if (js.length == 0) return;
        address juror = js[bound(j, 0, js.length - 1)];
        uint8 v = voteA ? 1 : 2;
        bytes32 commitment = wr.computeCommitment(caseId, juror, v, bytes32(caseId)); // before prank
        vm.prank(juror);
        try wr.commitVote(caseId, commitment) {
            committedVote[caseId][juror] = v;
        } catch {}
    }

    function reveal(uint256 c, uint256 j) external {
        uint256 caseId = _case(c);
        if (caseId == 0) return;
        address[] memory js = wr.getJurors(caseId);
        if (js.length == 0) return;
        address juror = js[bound(j, 0, js.length - 1)];
        vm.prank(juror);
        try wr.revealVote(caseId, committedVote[caseId][juror], bytes32(caseId)) {
            nReveals++;
        } catch {}
    }

    function finalize(uint256 c) external {
        uint256 caseId = _case(c);
        if (caseId == 0) return;
        try wr.finalize(caseId) {
            if (wr.getCase(caseId).status == RestMyCase.Status.Resolved) nResolved++;
            else nRefunded++;
        } catch {}
    }

    function cancel(uint256 c) external {
        uint256 caseId = _case(c);
        if (caseId == 0) return;
        try wr.cancelExpired(caseId) {
            nRefunded++;
        } catch {}
    }

    function withdraw(uint256 who) external {
        uint256 total = parties.length + jurors.length;
        uint256 i = bound(who, 0, total - 1);
        address a = i < parties.length ? parties[i] : jurors[i - parties.length];
        uint256 before = gd.balanceOf(address(wr));
        vm.prank(a);
        try wr.withdraw() {
            ghostWithdrawn += before - gd.balanceOf(address(wr));
            nWithdrawals++;
        } catch {}
    }

    /// Drives one case through open -> join -> draw -> commit -> reveal -> finalize with random votes and
    /// random no-shows, so resolutions and payouts happen often during the invariant run.
    function fullCycle(uint256 pa, uint256 pb, bytes32 seed, uint8 commitMask, uint8 voteMask) external {
        this.open(pa);
        uint256 caseId = wr.caseCount();
        if (caseId == 0 || wr.getCase(caseId).status != RestMyCase.Status.Open) return;
        this.join(caseId, pb);
        this.requestAndDraw(caseId, seed);
        address[] memory js = wr.getJurors(caseId);
        if (js.length == 0) return;
        for (uint256 i; i < js.length; ++i) {
            if ((commitMask >> i) & 1 == 1) this.commit(caseId, i, (voteMask >> i) & 1 == 1);
        }
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        for (uint256 i; i < js.length; ++i) {
            this.reveal(caseId, i);
        }
        vm.warp(wr.getCase(caseId).revealDeadline + 1);
        this.finalize(caseId);
    }

    function warp(uint256 secs) external {
        secs = bound(secs, 1, 2 days);
        vm.warp(block.timestamp + secs);
        vm.roll(block.number + secs);
    }
}
