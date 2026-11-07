// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {WhosRight} from "../src/WhosRight.sol";

contract SpeedTest is BaseTest {
    bytes32 internal constant SEED = keccak256("speed-seed");
    WhosRight.Speed internal constant STANDARD = WhosRight.Speed.Standard;
    WhosRight.Speed internal constant FAST = WhosRight.Speed.Fast;

    // ------------------------------------------------------------------ presets

    function test_Standard_FeeAndWindowsStoredOnCase() public {
        uint256 a0 = gd.balanceOf(alice);
        uint256 b0 = gd.balanceOf(bob);
        uint256 caseId = _openAndJoinSpeed(STANDARD);
        WhosRight.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.speed), uint8(STANDARD));
        assertEq(c.fee, 100e18);
        assertEq(c.commitWindow, 6 hours);
        assertEq(c.revealWindow, 6 hours);
        assertEq(a0 - gd.balanceOf(alice), 100e18);
        assertEq(b0 - gd.balanceOf(bob), 100e18, "B pays the same as A");
    }

    function test_Fast_FeeAndWindowsStoredOnCase() public {
        uint256 a0 = gd.balanceOf(alice);
        uint256 b0 = gd.balanceOf(bob);
        uint256 caseId = _openAndJoinSpeed(FAST);
        WhosRight.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.speed), uint8(FAST));
        assertEq(c.fee, 300e18);
        assertEq(c.commitWindow, 1 hours);
        assertEq(c.revealWindow, 1 hours);
        assertEq(a0 - gd.balanceOf(alice), 300e18);
        assertEq(b0 - gd.balanceOf(bob), 300e18, "B pays the same as A");
    }

    function test_Standard_DeadlinesAreSixHourMaximums() public {
        uint256 caseId = _toDrawnSpeed(SEED, STANDARD);
        WhosRight.Case memory c = wr.getCase(caseId);
        assertEq(c.commitDeadline, block.timestamp + 6 hours);
        assertEq(c.revealDeadline, block.timestamp + 12 hours);

        address j = wr.getJurors(caseId)[0];
        vm.warp(c.commitDeadline + 1);
        bytes32 commitment = wr.computeCommitment(caseId, j, 1, _salt(j));
        vm.prank(j);
        vm.expectRevert(WhosRight.DeadlinePassed.selector);
        wr.commitVote(caseId, commitment);
    }

    function test_Fast_DeadlinesAreOneHourMaximums() public {
        uint256 caseId = _toDrawnSpeed(SEED, FAST);
        WhosRight.Case memory c = wr.getCase(caseId);
        assertEq(c.commitDeadline, block.timestamp + 1 hours);
        assertEq(c.revealDeadline, block.timestamp + 2 hours);

        address[] memory j = wr.getJurors(caseId);
        _commit(caseId, j[0], 1);
        vm.warp(c.commitDeadline + 1); // commit stage over (only 1 of 5 committed)
        bytes32 late = wr.computeCommitment(caseId, j[1], 1, _salt(j[1]));
        vm.prank(j[1]);
        vm.expectRevert(WhosRight.DeadlinePassed.selector);
        wr.commitVote(caseId, late);

        vm.warp(c.revealDeadline + 1); // reveal stage over too
        vm.prank(j[0]);
        vm.expectRevert(WhosRight.DeadlinePassed.selector);
        wr.revealVote(caseId, 1, _salt(j[0]));
    }

    function test_FullFastCaseWithinTwoHours() public {
        uint256 start = block.timestamp;
        uint256 caseId = _toDrawnSpeed(SEED, FAST);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(2, 2, 1, 2, 1);
        vm.warp(block.timestamp + 20 minutes);
        _commitAll(caseId, v);
        vm.warp(block.timestamp + 20 minutes);
        for (uint256 i; i < 5; ++i) {
            _reveal(caseId, j[i], v[i]);
        }
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(WhosRight.Verdict.PartyB));
        assertLt(block.timestamp - start, 1 hours);
        for (uint256 i; i < 5; ++i) {
            assertEq(wr.owed(j[i]), 2 * 300e18 / 5);
        }
    }

    // ------------------------------------------------------------------ B sees and agrees to the terms

    function test_JoinRequiresTheTermsBWasShown() public {
        uint256 caseId = _openSpeed(FAST);
        bytes memory sig = _sig(caseId, bob);
        vm.startPrank(bob);
        vm.expectRevert(WhosRight.TermsMismatch.selector);
        wr.joinCase(caseId, CONTENT_B, STANDARD, 300e18, sig); // wrong speed
        vm.expectRevert(WhosRight.TermsMismatch.selector);
        wr.joinCase(caseId, CONTENT_B, FAST, 100e18, sig); // wrong fee
        wr.joinCase(caseId, CONTENT_B, FAST, 300e18, sig);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ early stage endings

    function test_CommitStageEndsWhenAllJurorsCommit() public {
        uint256 caseId = _toDrawnSpeed(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        vm.warp(block.timestamp + 30 minutes);
        uint8[] memory v = _votes(1, 1, 1, 2, 2);
        for (uint256 i; i < 4; ++i) {
            _commit(caseId, j[i], v[i]);
        }
        assertFalse(wr.isRevealOpen(caseId), "still committing");
        _commit(caseId, j[4], v[4]); // last commit

        WhosRight.Case memory c = wr.getCase(caseId);
        assertEq(c.commitDeadline, block.timestamp, "commit stage ended now");
        assertEq(c.revealDeadline, block.timestamp + 6 hours, "full reveal window starts now");
        assertTrue(wr.isRevealOpen(caseId));
        _reveal(caseId, j[0], 1); // same block
    }

    function test_RevealStageEndsWhenAllJurorsReveal_FinalizeImmediately() public {
        uint256 caseId = _toDrawnSpeed(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(1, 2, 1, 2, 1);
        _commitAll(caseId, v);
        for (uint256 i; i < 4; ++i) {
            _reveal(caseId, j[i], v[i]);
        }
        vm.expectRevert(WhosRight.DeadlineNotReached.selector);
        wr.finalize(caseId);
        _reveal(caseId, j[4], v[4]); // last reveal

        assertEq(wr.getCase(caseId).revealDeadline, block.timestamp, "reveal stage ended now");
        assertFalse(wr.isRevealOpen(caseId));
        wr.finalize(caseId); // same block
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(WhosRight.Verdict.PartyA));
    }

    function test_PartialCommits_RevealStageEndsWhenAllCommittersReveal() public {
        uint256 caseId = _toDrawnSpeed(SEED, FAST);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(2, 2, 1, 0, 0); // two jurors never commit
        _commitAll(caseId, v);
        uint64 commitDeadline = wr.getCase(caseId).commitDeadline;
        vm.warp(commitDeadline + 1); // commit stage times out
        for (uint256 i; i < 3; ++i) {
            _reveal(caseId, j[i], v[i]);
        }
        assertEq(wr.getCase(caseId).revealDeadline, block.timestamp);
        wr.finalize(caseId); // no need to wait for the 1h reveal maximum
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(WhosRight.Verdict.PartyB));
        assertEq(wr.owed(j[3]), 0);
        assertEq(wr.owed(j[4]), 0);
    }

    function test_NoEarlyEndWhileJurorsStillMissing() public {
        uint256 caseId = _toDrawnSpeed(SEED, STANDARD);
        address[] memory j = wr.getJurors(caseId);
        _commitAll(caseId, _votes(1, 1, 1, 1, 0));
        assertFalse(wr.isRevealOpen(caseId));
        vm.prank(j[0]);
        vm.expectRevert(WhosRight.RevealNotOpen.selector);
        wr.revealVote(caseId, 1, _salt(j[0]));
        vm.expectRevert(WhosRight.DeadlineNotReached.selector);
        wr.finalize(caseId);
    }

    // ------------------------------------------------------------------ settings changes vs existing cases

    function test_FeeChange_DoesNotAffectOpenCases() public {
        uint256 stdCase = _openSpeed(STANDARD);
        uint256 fastCase = _openSpeed(FAST);

        vm.startPrank(owner);
        wr.setSpeedFee(STANDARD, 2_000e18);
        wr.setSpeedFee(FAST, 9_000e18);
        vm.stopPrank();

        // B still sees and pays the fee locked at creation.
        uint256 b0 = gd.balanceOf(bob);
        _join(stdCase, bob);
        assertEq(b0 - gd.balanceOf(bob), 100e18);
        b0 = gd.balanceOf(bob);
        _join(fastCase, bob);
        assertEq(b0 - gd.balanceOf(bob), 300e18);

        WhosRight.Case memory s = wr.getCase(stdCase);
        WhosRight.Case memory f = wr.getCase(fastCase);
        assertEq(s.fee, 100e18);
        assertEq(s.commitWindow, 6 hours);
        assertEq(f.fee, 300e18);
        assertEq(f.commitWindow, 1 hours);

        // New cases use the new fees; windows are fixed presets.
        WhosRight.Case memory n1 = wr.getCase(_openSpeed(STANDARD));
        WhosRight.Case memory n2 = wr.getCase(_openSpeed(FAST));
        assertEq(n1.fee, 2_000e18);
        assertEq(n1.commitWindow, 6 hours);
        assertEq(n2.fee, 9_000e18);
        assertEq(n2.commitWindow, 1 hours);
    }

    function test_FeeChange_DoesNotAffectCasesInVoting() public {
        uint256 caseId = _toDrawnSpeed(SEED, FAST);
        WhosRight.Case memory before = wr.getCase(caseId);
        vm.prank(owner);
        wr.setSpeedFee(FAST, 50e18);
        vm.prank(owner);
        wr.setNewCasesPaused(true);

        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(1, 1, 1, 1, 1);
        _commitAll(caseId, v);
        for (uint256 i; i < 5; ++i) {
            _reveal(caseId, j[i], v[i]);
        }
        wr.finalize(caseId);
        WhosRight.Case memory c = wr.getCase(caseId);
        assertEq(c.fee, before.fee);
        assertEq(c.commitWindow, before.commitWindow);
        assertEq(c.revealWindow, before.revealWindow);
        assertEq(wr.owed(j[0]), 2 * 300e18 / 5, "payout from locked fee");
    }

    function test_FeeCap_AppliesToBothSpeeds() public {
        vm.startPrank(owner);
        vm.expectRevert(WhosRight.InvalidFee.selector);
        wr.setSpeedFee(FAST, 10_000e18 + 1);
        vm.expectRevert(WhosRight.InvalidFee.selector);
        wr.setSpeedFee(STANDARD, 10_000e18 + 1);
        wr.setSpeedFee(FAST, 10_000e18);
        vm.stopPrank();

        WhosRight.Config memory cfg = _config(5, 7);
        cfg.fastFee = 10_000e18 + 1;
        vm.expectRevert(WhosRight.InvalidFee.selector);
        new WhosRight(cfg);
    }

    function test_OnlyOwnerSetsSpeedFee() public {
        vm.prank(alice);
        vm.expectRevert();
        wr.setSpeedFee(FAST, 1e18);
    }

    function testFuzz_LockedTermsSurviveAnyFeeChange(uint256 newStd, uint256 newFast, bool fast) public {
        newStd = bound(newStd, 1, wr.MAX_CASE_FEE());
        newFast = bound(newFast, 1, wr.MAX_CASE_FEE());
        WhosRight.Speed speed = fast ? FAST : STANDARD;
        uint256 expected = fast ? 300e18 : 100e18;
        uint256 caseId = _openSpeed(speed);
        vm.startPrank(owner);
        wr.setSpeedFee(STANDARD, newStd);
        wr.setSpeedFee(FAST, newFast);
        vm.stopPrank();
        uint256 b0 = gd.balanceOf(bob);
        _join(caseId, bob);
        assertEq(b0 - gd.balanceOf(bob), expected);
        assertEq(gd.balanceOf(address(wr)), 2 * expected);
    }
}
