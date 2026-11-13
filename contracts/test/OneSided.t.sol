// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RestMyCase} from "../src/RestMyCase.sol";
import {BaseTest} from "./utils/BaseTest.sol";

/// @notice One-sided cases: only A pays, no join step, the jury votes Right (1) or Wrong (2).
contract OneSidedTest is BaseTest {
    RestMyCase.Speed internal constant STANDARD = RestMyCase.Speed.Standard;
    RestMyCase.Speed internal constant FAST = RestMyCase.Speed.Fast;
    RestMyCase.Mode internal constant ONE = RestMyCase.Mode.OneSided;
    RestMyCase.Mode internal constant TWO = RestMyCase.Mode.TwoSided;
    uint8 internal constant RIGHT = 1;
    uint8 internal constant WRONG = 2;
    bytes32 internal constant SEED = keccak256("one-sided seed");

    function _openOne(RestMyCase.Speed speed) internal returns (uint256 caseId) {
        vm.prank(alice);
        caseId = wr.openCase(speed, ONE, CONTENT_A, address(0));
    }

    function _drawOne(bytes32 seed, RestMyCase.Speed speed) internal returns (uint256 caseId) {
        caseId = _openOne(speed);
        wr.requestJury(caseId);
        rng.fulfill(wr.getCase(caseId).randomnessId, seed);
        wr.drawJury(caseId);
    }

    function _sumOwed(address[] memory j) internal view returns (uint256 sum) {
        for (uint256 i; i < j.length; ++i) sum += wr.owed(j[i]);
    }

    // ---------------------------------------------------------------- opening

    function test_Open_OnlyAPays_ReadyForJuryAtOnce() public {
        uint256 a0 = gd.balanceOf(alice);
        uint256 caseId = _openOne(STANDARD);
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.mode), uint8(ONE));
        assertEq(uint8(c.status), uint8(RestMyCase.Status.Joined), "no join step");
        assertEq(c.partyB, address(0));
        assertEq(c.rootB, address(0));
        assertEq(c.inviteSigner, address(0));
        assertEq(c.fee, FEE);
        assertEq(c.depositA, FEE);
        assertEq(c.depositB, 0);
        assertEq(c.joinDeadline, 0);
        assertEq(c.drawDeadline, block.timestamp + DRAW_WINDOW);
        assertEq(a0 - gd.balanceOf(alice), FEE, "A pays exactly the fee");
        assertEq(gd.balanceOf(address(wr)), FEE);
        assertEq(wr.totalEscrowed(), FEE);
    }

    function test_Open_FastUsesFastFeeAndWindows() public {
        RestMyCase.Case memory c = wr.getCase(_openOne(FAST));
        assertEq(c.fee, FAST_FEE);
        assertEq(c.commitWindow, 1 hours);
        assertEq(c.revealWindow, 1 hours);
    }

    function test_Open_InviteMustMatchMode() public {
        vm.startPrank(alice);
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.openCase(STANDARD, ONE, CONTENT_A, inviteSigner); // one-sided must not carry an invite
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.openCase(STANDARD, TWO, CONTENT_A, address(0)); // two-sided must
        vm.stopPrank();
    }

    function test_Open_PausedAndUnverifiedRejected() public {
        vm.prank(owner);
        wr.setNewCasesPaused(true);
        vm.prank(alice);
        vm.expectRevert(RestMyCase.NewCasesArePaused.selector);
        wr.openCase(STANDARD, ONE, CONTENT_A, address(0));
        vm.prank(owner);
        wr.setNewCasesPaused(false);

        address nobody = makeAddr("unverified");
        _fund(nobody);
        vm.prank(nobody);
        vm.expectRevert(RestMyCase.NotVerified.selector);
        wr.openCase(STANDARD, ONE, CONTENT_A, address(0));
    }

    function test_CannotBeJoined() public {
        uint256 caseId = _openOne(STANDARD);
        bytes memory sig = _sig(caseId, bob);
        vm.prank(bob);
        vm.expectRevert(RestMyCase.WrongStatus.selector);
        wr.joinCase(caseId, CONTENT_B, STANDARD, FEE, sig);
    }

    // ---------------------------------------------------------------- verdicts and fee sharing

    function test_Right_HappyPath_PotSharedByRevealers() public {
        uint256 caseId = _drawOne(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        assertEq(j.length, JURY);
        uint8[] memory v = _votes(RIGHT, RIGHT, WRONG, RIGHT, RIGHT);
        _commitAll(caseId, v);
        for (uint256 i; i < j.length; ++i) _reveal(caseId, j[i], v[i]);
        wr.finalize(caseId); // early: everyone revealed

        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.status), uint8(RestMyCase.Status.Resolved));
        assertEq(uint8(c.verdict), uint8(RestMyCase.Verdict.PartyA), "Right = A");
        assertEq(c.votesA, 4);
        assertEq(c.votesB, 1);
        for (uint256 i; i < j.length; ++i) assertEq(wr.owed(j[i]), FEE / JURY);
        assertEq(_sumOwed(j), FEE, "whole pot to revealers");
        assertEq(wr.owed(alice), 0, "A gets nothing back on a verdict");
        assertEq(wr.owed(address(0)), 0);
        assertEq(wr.totalEscrowed(), 0);
    }

    function test_Wrong_Verdict() public {
        uint256 caseId = _drawOne(SEED, FAST);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(WRONG, WRONG, WRONG, RIGHT, 0);
        _commitAll(caseId, v);
        vm.warp(block.timestamp + 1 hours + 1); // commit stage over (one juror never committed)
        for (uint256 i; i < 4; ++i) _reveal(caseId, j[i], v[i]);
        wr.finalize(caseId); // early: every committed juror revealed
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.verdict), uint8(RestMyCase.Verdict.PartyB), "Wrong = B");
        for (uint256 i; i < 4; ++i) assertEq(wr.owed(j[i]), FAST_FEE / 4);
        assertEq(wr.owed(j[4]), 0, "no-show earns nothing");
        assertEq(wr.owed(address(0)), 0);
    }

    function test_FeeSharing_RemainderGoesToFirstRevealers() public {
        vm.prank(owner);
        wr.setSpeedFee(STANDARD, 100e18 + 1); // 100e18 + 1 = 3k + 2: two leftover wei to hand out
        uint256 caseId = _drawOne(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(RIGHT, RIGHT, WRONG, 0, 0);
        _commitAll(caseId, v);
        vm.warp(block.timestamp + 6 hours + 1);
        for (uint256 i; i < 3; ++i) _reveal(caseId, j[i], v[i]);
        wr.finalize(caseId);
        uint256 pot = 100e18 + 1;
        assertEq(_sumOwed(j), pot, "nothing lost to rounding");
        uint256 rem = pot % 3;
        assertEq(rem, 2, "test really exercises the remainder");
        for (uint256 i; i < 3; ++i) assertEq(wr.owed(j[i]), pot / 3 + (i < rem ? 1 : 0));
    }

    // ---------------------------------------------------------------- refunds

    function test_Tie_RefundsA() public {
        uint256 caseId = _drawOne(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(RIGHT, WRONG, RIGHT, WRONG, 0);
        _commitAll(caseId, v);
        vm.warp(block.timestamp + 6 hours + 1);
        for (uint256 i; i < 4; ++i) _reveal(caseId, j[i], v[i]);
        wr.finalize(caseId);
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.status), uint8(RestMyCase.Status.Refunded));
        assertEq(uint8(c.refundReason), uint8(RestMyCase.RefundReason.Tie));
        assertEq(wr.owed(alice), FEE);
        assertEq(_sumOwed(j), 0, "jurors unpaid on a tie");
        assertEq(wr.owed(address(0)), 0);
    }

    function test_NoReveals_RefundsA() public {
        uint256 caseId = _drawOne(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        _commitAll(caseId, _votes(RIGHT, RIGHT, 0, 0, 0));
        vm.warp(block.timestamp + 12 hours + 1); // past reveal deadline, nobody revealed
        wr.finalize(caseId);
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.refundReason), uint8(RestMyCase.RefundReason.NoReveals));
        assertEq(wr.owed(alice), FEE);
        assertEq(_sumOwed(j), 0);
    }

    function test_NoCommits_RefundsAsSoonAsCommitStageEnds() public {
        uint256 caseId = _drawOne(SEED, FAST);
        vm.expectRevert(RestMyCase.DeadlineNotReached.selector);
        wr.finalize(caseId);
        vm.warp(block.timestamp + 1 hours + 1); // nobody can ever reveal now
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.NoReveals));
        assertEq(wr.owed(alice), FAST_FEE);
    }

    function test_DrawTimeout_NoRequest_RefundsA() public {
        uint256 caseId = _openOne(STANDARD);
        vm.expectRevert(RestMyCase.DeadlineNotReached.selector);
        wr.cancelExpired(caseId);
        vm.warp(block.timestamp + DRAW_WINDOW + 1);
        wr.cancelExpired(caseId);
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.refundReason), uint8(RestMyCase.RefundReason.DrawTimeout));
        assertEq(wr.owed(alice), FEE);
        vm.prank(alice);
        wr.withdraw();
        assertEq(wr.owed(alice), 0);
    }

    function test_DrawTimeout_RandomnessNeverArrives_RefundsA() public {
        uint256 caseId = _openOne(STANDARD);
        wr.requestJury(caseId);
        vm.warp(block.timestamp + DRAW_WINDOW + 1);
        vm.expectRevert(RestMyCase.DeadlinePassed.selector);
        wr.drawJury(caseId);
        wr.cancelExpired(caseId);
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.DrawTimeout));
        assertEq(wr.owed(alice), FEE);
    }

    function test_PoolTooSmall_RefundsAImmediately() public {
        RestMyCase small = new RestMyCase(_config(JURY, 50));
        _verify(alice);
        vm.prank(alice);
        gd.approve(address(small), type(uint256).max);
        vm.prank(alice);
        uint256 caseId = small.openCase(STANDARD, ONE, CONTENT_A, address(0));
        small.requestJury(caseId);
        RestMyCase.Case memory c = small.getCase(caseId);
        assertEq(uint8(c.refundReason), uint8(RestMyCase.RefundReason.PoolTooSmall));
        assertEq(small.owed(alice), FEE);
        assertEq(small.owed(address(0)), 0);
    }

    // ---------------------------------------------------------------- stage endings and locking

    function test_EarlyEndings_CommitThenReveal() public {
        uint256 caseId = _drawOne(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(RIGHT, RIGHT, RIGHT, WRONG, WRONG);
        _commitAll(caseId, v);
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(c.commitDeadline, block.timestamp, "commit stage ends when all committed");
        assertEq(c.revealDeadline, block.timestamp + 6 hours, "full reveal window starts then");
        assertTrue(wr.isRevealOpen(caseId));
        for (uint256 i; i < j.length; ++i) _reveal(caseId, j[i], v[i]);
        assertEq(wr.getCase(caseId).revealDeadline, block.timestamp, "reveal stage ends when all revealed");
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(RestMyCase.Verdict.PartyA));
    }

    function test_FeeLockedAtOpen() public {
        uint256 caseId = _openOne(STANDARD);
        vm.prank(owner);
        wr.setSpeedFee(STANDARD, 700e18);
        wr.requestJury(caseId);
        rng.fulfill(wr.getCase(caseId).randomnessId, SEED);
        wr.drawJury(caseId);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(RIGHT, RIGHT, RIGHT, RIGHT, RIGHT);
        _commitAll(caseId, v);
        for (uint256 i; i < j.length; ++i) _reveal(caseId, j[i], v[i]);
        wr.finalize(caseId);
        assertEq(wr.getCase(caseId).fee, FEE);
        assertEq(_sumOwed(j), FEE, "payout from the fee locked at open");
    }

    function test_FeeCapIs1000() public {
        assertEq(wr.MAX_CASE_FEE(), 1_000e18);
        vm.startPrank(owner);
        vm.expectRevert(RestMyCase.InvalidFee.selector);
        wr.setSpeedFee(FAST, 1_000e18 + 1);
        wr.setSpeedFee(FAST, 1_000e18);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- fuzz

    /// A is never drawn onto their own one-sided jury, whatever the seed (even when A is in the pool).
    function testFuzz_AuthorNeverOnOwnJury(bytes32 seed) public {
        vm.prank(alice);
        wr.joinPool();
        vm.roll(block.number + 1);
        uint256 caseId = _drawOne(seed, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        for (uint256 i; i < j.length; ++i) assertTrue(j[i] != alice);
    }

    /// Any voting pattern: money is conserved and goes only to revealers, or back to A.
    function testFuzz_ConservationAnyVotes(bytes32 seed, uint8[5] memory raw, bool fast) public {
        uint256 caseId = _drawOne(seed, fast ? FAST : STANDARD);
        uint256 fee = wr.getCase(caseId).fee;
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = new uint8[](j.length);
        for (uint256 i; i < j.length; ++i) v[i] = raw[i] % 3; // 0 = no commit
        _commitAll(caseId, v);
        // If everyone committed, the reveal stage is already open; otherwise wait out the commit stage.
        if (!wr.isRevealOpen(caseId)) vm.warp(wr.getCase(caseId).commitDeadline + 1);
        if (wr.getCase(caseId).commits > 0) {
            for (uint256 i; i < j.length; ++i) if (v[i] != 0 && raw[i] % 2 == 0) _reveal(caseId, j[i], v[i]);
        }
        vm.warp(wr.getCase(caseId).revealDeadline + 1);
        wr.finalize(caseId);

        RestMyCase.Case memory c = wr.getCase(caseId);
        uint256 jurorsPaid = _sumOwed(j);
        if (c.status == RestMyCase.Status.Resolved) {
            assertEq(jurorsPaid, fee);
            assertEq(wr.owed(alice), 0);
            assertEq(c.votesA + c.votesB, c.reveals);
            assertTrue(c.votesA != c.votesB);
        } else {
            assertEq(uint8(c.status), uint8(RestMyCase.Status.Refunded));
            assertEq(jurorsPaid, 0);
            assertEq(wr.owed(alice), fee);
        }
        assertEq(wr.owed(address(0)), 0);
        assertEq(gd.balanceOf(address(wr)), wr.totalEscrowed() + wr.totalOwed());
    }
}
