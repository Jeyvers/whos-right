// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {RestMyCase} from "../src/RestMyCase.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RestMyCaseTest is BaseTest {
    bytes32 internal constant SEED = keccak256("seed");

    // ------------------------------------------------------------------ happy path

    function test_HappyPath_FullFlow() public {
        uint256 aliceStart = gd.balanceOf(alice);
        uint256 bobStart = gd.balanceOf(bob);

        uint256 caseId = _open();
        assertEq(uint8(wr.getCase(caseId).status), uint8(RestMyCase.Status.Open));
        assertEq(gd.balanceOf(address(wr)), FEE);

        vm.prank(bob);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, _sig(caseId, bob));
        assertEq(gd.balanceOf(address(wr)), 2 * FEE);

        wr.requestJury(caseId);
        rng.fulfill(wr.getCase(caseId).randomnessId, SEED);
        wr.drawJury(caseId);

        address[] memory jurors = wr.getJurors(caseId);
        assertEq(jurors.length, JURY);

        uint8[] memory v = _votes(1, 1, 2, 1, 2);
        _commitAll(caseId, v);
        assertTrue(wr.isRevealOpen(caseId)); // all committed -> reveal opens early
        for (uint256 i; i < jurors.length; ++i) {
            _reveal(caseId, jurors[i], v[i]);
        }
        wr.finalize(caseId); // everyone revealed -> no need to wait

        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.status), uint8(RestMyCase.Status.Resolved));
        assertEq(uint8(c.verdict), uint8(RestMyCase.Verdict.PartyA));
        assertEq(c.votesA, 3);
        assertEq(c.votesB, 2);

        for (uint256 i; i < jurors.length; ++i) {
            assertEq(wr.owed(jurors[i]), 2 * FEE / JURY);
            uint256 before = gd.balanceOf(jurors[i]);
            vm.prank(jurors[i]);
            wr.withdraw();
            assertEq(gd.balanceOf(jurors[i]) - before, 2 * FEE / JURY);
        }
        assertEq(gd.balanceOf(address(wr)), 0);
        assertEq(gd.balanceOf(alice), aliceStart - FEE); // winner gets nothing
        assertEq(gd.balanceOf(bob), bobStart - FEE);
        assertEq(wr.owed(alice), 0);
        assertEq(wr.owed(bob), 0);
    }

    function test_FinalizeAfterRevealDeadline() public {
        uint256 caseId = _toDrawn(SEED);
        address[] memory j = wr.getJurors(caseId);
        _commitAll(caseId, _votes(2, 2, 2, 1, 1));
        for (uint256 i; i < 4; ++i) {
            _reveal(caseId, j[i], i < 3 ? 2 : 1);
        }
        vm.expectRevert(RestMyCase.DeadlineNotReached.selector);
        wr.finalize(caseId);
        vm.warp(wr.getCase(caseId).revealDeadline + 1);
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).verdict), uint8(RestMyCase.Verdict.PartyB));
        assertEq(wr.owed(j[4]), 0); // did not reveal
        assertEq(wr.owed(j[0]), 2 * FEE / 4);
    }

    // ------------------------------------------------------------------ verification

    function test_Unverified_CannotOpen() public {
        address eve = makeAddr("eve");
        _fund(eve);
        vm.prank(eve);
        vm.expectRevert(RestMyCase.NotVerified.selector);
        wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, CONTENT_A, inviteSigner);
    }

    function test_Unverified_CannotJoinCase() public {
        uint256 caseId = _open();
        address eve = makeAddr("eve");
        _fund(eve);
        bytes memory sig = _sig(caseId, eve);
        vm.prank(eve);
        vm.expectRevert(RestMyCase.NotVerified.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, sig);
    }

    function test_Unverified_CannotJoinPool() public {
        address eve = makeAddr("eve");
        vm.prank(eve);
        vm.expectRevert(RestMyCase.NotVerified.selector);
        wr.joinPool();
    }

    function test_ExpiredVerification_CannotOpen() public {
        vm.warp(block.timestamp + 181 days);
        vm.prank(alice);
        vm.expectRevert(RestMyCase.NotVerified.selector);
        wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, CONTENT_A, inviteSigner);
    }

    function test_ConnectedWallet_CanActAsItsRoot() public {
        address aliceAlt = makeAddr("aliceAlt");
        vm.prank(alice);
        id.connectAccount(aliceAlt);
        _fund(aliceAlt);
        vm.prank(aliceAlt);
        uint256 caseId = wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, CONTENT_A, inviteSigner);
        assertEq(wr.getCase(caseId).rootA, alice);
    }

    // ------------------------------------------------------------------ same person

    function test_SamePerson_SameWalletCannotJoinOwnCase() public {
        uint256 caseId = _open();
        bytes memory sig = _sig(caseId, alice);
        vm.prank(alice);
        vm.expectRevert(RestMyCase.SameIdentity.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, sig);
    }

    function test_SamePerson_ConnectedWalletCannotJoinOwnCase() public {
        address aliceAlt = makeAddr("aliceAlt");
        vm.prank(alice);
        id.connectAccount(aliceAlt);
        _fund(aliceAlt);
        uint256 caseId = _open();
        bytes memory sig = _sig(caseId, aliceAlt);
        vm.prank(aliceAlt);
        vm.expectRevert(RestMyCase.SameIdentity.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, sig);
    }

    function test_SamePerson_ConnectedWalletCannotJoinPoolTwice() public {
        address j0 = pool[0];
        address j0Alt = makeAddr("j0Alt");
        vm.prank(j0);
        id.connectAccount(j0Alt);
        vm.prank(j0Alt);
        vm.expectRevert(RestMyCase.AlreadyInPool.selector);
        wr.joinPool();
    }

    function test_SamePerson_ReconnectedWalletCannotHoldTwoSeats() public {
        // j0's wallet is in the pool for root j0. A second wallet of the same person is never a second seat:
        // the root is deduplicated, and a wallet can only hold one active entry.
        address j0 = pool[0];
        vm.prank(j0);
        vm.expectRevert(RestMyCase.AlreadyInPool.selector);
        wr.joinPool();
    }

    function test_JurorSeatIsBoundToDrawnIdentity() public {
        // A drawn juror whose wallet no longer resolves to the drawn root cannot vote.
        uint256 caseId = _toDrawn(SEED);
        address j = wr.getJurors(caseId)[0];
        id.removeWhitelisted(j);
        bytes32 c = wr.computeCommitment(caseId, j, 1, _salt(j));
        vm.prank(j);
        vm.expectRevert(RestMyCase.IdentityChanged.selector);
        wr.commitVote(caseId, c);
    }

    // ------------------------------------------------------------------ parties as jurors

    function test_PartiesNeverDrawn_IncludingConnectedWallets() public {
        // Alice joins the pool with her root; Bob's connected wallet joins the pool for Bob.
        vm.prank(alice);
        wr.joinPool();
        address bobAlt = makeAddr("bobAlt");
        vm.prank(bob);
        id.connectAccount(bobAlt);
        vm.prank(bobAlt);
        wr.joinPool();
        vm.roll(block.number + 1);

        for (uint256 s; s < 25; ++s) {
            uint256 caseId = _openAndJoin();
            wr.requestJury(caseId);
            rng.fulfill(wr.getCase(caseId).randomnessId, keccak256(abi.encode(s)));
            wr.drawJury(caseId);
            address[] memory j = wr.getJurors(caseId);
            for (uint256 i; i < j.length; ++i) {
                address root = id.getWhitelistedRoot(j[i]);
                assertTrue(root != alice && root != bob, "party drawn");
            }
        }
    }

    function test_NotEnoughEligibleJurors_Refunds() public {
        // Pool meets minPoolSize only because of the parties' own entries -> too few eligible.
        RestMyCase small = new RestMyCase(_config(5, 5));
        address[3] memory others = [pool[0], pool[1], pool[2]];
        for (uint256 i; i < 3; ++i) {
            vm.prank(others[i]);
            small.joinPool();
        }
        vm.prank(alice);
        small.joinPool();
        vm.prank(bob);
        small.joinPool();
        vm.prank(alice);
        gd.approve(address(small), type(uint256).max);
        vm.prank(bob);
        gd.approve(address(small), type(uint256).max);
        vm.roll(block.number + 1);

        vm.prank(alice);
        uint256 caseId = small.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, CONTENT_A, inviteSigner);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(invitePk, small.joinDigest(caseId, bob));
        vm.prank(bob);
        small.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, abi.encodePacked(r, s, v));
        small.requestJury(caseId);
        rng.fulfill(small.getCase(caseId).randomnessId, SEED);
        small.drawJury(caseId);

        RestMyCase.Case memory c = small.getCase(caseId);
        assertEq(uint8(c.status), uint8(RestMyCase.Status.Refunded));
        assertEq(uint8(c.refundReason), uint8(RestMyCase.RefundReason.NotEnoughEligibleJurors));
        assertEq(small.owed(alice), FEE);
        assertEq(small.owed(bob), FEE);
    }

    function test_PoolTooSmall_RefundsAndReturnsCelo() public {
        for (uint256 i; i < 4; ++i) {
            vm.prank(pool[i]);
            wr.leavePool();
        }
        assertEq(wr.activePoolSize(), 6); // < MIN_POOL (7)
        uint256 caseId = _openAndJoin();
        address caller = makeAddr("caller");
        vm.deal(caller, 1 ether);
        vm.prank(caller);
        wr.requestJury{value: 0.1 ether}(caseId);
        assertEq(caller.balance, 1 ether);
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.PoolTooSmall));
        assertEq(wr.owed(alice), FEE);
        assertEq(wr.owed(bob), FEE);
    }

    // ------------------------------------------------------------------ invite / front-running

    function test_Invite_FrontRunnerCannotReuseSignature() public {
        uint256 caseId = _open();
        bytes memory bobSig = _sig(caseId, bob); // what Bob broadcasts
        address mallory = makeAddr("mallory");
        _verify(mallory);
        vm.prank(mallory);
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, bobSig);
        vm.prank(bob);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, bobSig);
        assertEq(wr.getCase(caseId).partyB, bob);
    }

    function test_Invite_WrongKeyOrCaseRejected() public {
        uint256 caseId = _open();
        bytes memory wrongKey = _sigWith(0xBAD, caseId, bob);
        vm.prank(bob);
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, wrongKey);

        bytes memory otherCase = _sig(caseId + 1, bob);
        vm.prank(bob);
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, otherCase);

        vm.prank(bob);
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, hex"1234");
    }

    function test_Invite_CannotJoinTwice() public {
        uint256 caseId = _openAndJoin();
        address carol = makeAddr("carol");
        _verify(carol);
        bytes memory sig = _sig(caseId, carol);
        vm.prank(carol);
        vm.expectRevert(RestMyCase.WrongStatus.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, sig);
    }

    function test_JoinDigestMatchesClientComputation() public view {
        assertEq(wr.joinDigest(7, bob), _joinDigest(address(wr), 7, bob));
    }

    function test_InvalidInputs() public {
        vm.startPrank(alice);
        vm.expectRevert(RestMyCase.InvalidContentHash.selector);
        wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, bytes32(0), inviteSigner);
        vm.expectRevert(RestMyCase.InvalidInvite.selector);
        wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, CONTENT_A, address(0));
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ deadlines

    function test_Late_JoinAfterDeadline() public {
        uint256 caseId = _open();
        vm.warp(block.timestamp + JOIN_WINDOW + 1);
        bytes memory sig = _sig(caseId, bob);
        vm.prank(bob);
        vm.expectRevert(RestMyCase.DeadlinePassed.selector);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, sig);
    }

    function test_NotJoined_FullRefundToA() public {
        uint256 start = gd.balanceOf(alice);
        uint256 caseId = _open();
        vm.expectRevert(RestMyCase.DeadlineNotReached.selector);
        wr.cancelExpired(caseId);
        vm.warp(block.timestamp + JOIN_WINDOW + 1);
        wr.cancelExpired(caseId); // anyone can trigger; funds credited to A only
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.NotJoined));
        vm.prank(alice);
        wr.withdraw();
        assertEq(gd.balanceOf(alice), start);
        vm.expectRevert(RestMyCase.WrongStatus.selector);
        wr.cancelExpired(caseId);
    }

    function test_Late_RequestAfterDrawDeadline() public {
        uint256 caseId = _openAndJoin();
        vm.warp(block.timestamp + DRAW_WINDOW + 1);
        vm.expectRevert(RestMyCase.DeadlinePassed.selector);
        wr.requestJury(caseId);
        wr.cancelExpired(caseId);
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.DrawTimeout));
    }

    function test_RandomnessLate_RefundsAfterDrawDeadline() public {
        uint256 caseId = _openAndJoin();
        wr.requestJury(caseId);
        vm.expectRevert(RestMyCase.RandomnessNotReady.selector);
        wr.drawJury(caseId);
        vm.expectRevert(RestMyCase.DeadlineNotReached.selector);
        wr.cancelExpired(caseId);
        vm.warp(block.timestamp + DRAW_WINDOW + 1);
        // Randomness arriving after the deadline cannot be used.
        rng.fulfill(wr.getCase(caseId).randomnessId, SEED);
        vm.expectRevert(RestMyCase.DeadlinePassed.selector);
        wr.drawJury(caseId);
        wr.cancelExpired(caseId);
        assertEq(wr.owed(alice), FEE);
        assertEq(wr.owed(bob), FEE);
    }

    function test_RetryRandomness() public {
        uint256 caseId = _openAndJoin();
        wr.requestJury(caseId);
        wr.retryRandomness(caseId);
        assertEq(rng.retries(), 1);
        rng.fulfill(wr.getCase(caseId).randomnessId, SEED);
        vm.expectRevert(RestMyCase.RandomnessAlreadyReady.selector);
        wr.retryRandomness(caseId);
        wr.drawJury(caseId);
    }

    function test_Late_CommitAfterDeadline() public {
        uint256 caseId = _toDrawn(SEED);
        address j = wr.getJurors(caseId)[0];
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        bytes32 c = wr.computeCommitment(caseId, j, 1, _salt(j));
        vm.prank(j);
        vm.expectRevert(RestMyCase.DeadlinePassed.selector);
        wr.commitVote(caseId, c);
    }

    function test_Late_RevealAfterDeadline() public {
        uint256 caseId = _toDrawn(SEED);
        address j = wr.getJurors(caseId)[0];
        _commit(caseId, j, 1);
        vm.warp(wr.getCase(caseId).revealDeadline + 1);
        vm.prank(j);
        vm.expectRevert(RestMyCase.DeadlinePassed.selector);
        wr.revealVote(caseId, 1, _salt(j));
    }

    // ------------------------------------------------------------------ non-revealing jurors

    function test_NoReveals_RefundsParties() public {
        uint256 caseId = _toDrawn(SEED);
        _commitAll(caseId, _votes(1, 1, 1, 0, 0));
        vm.warp(wr.getCase(caseId).revealDeadline + 1);
        wr.finalize(caseId);
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.NoReveals));
        assertEq(wr.owed(alice), FEE);
        assertEq(wr.owed(bob), FEE);
    }

    function test_NoCommits_FinalizeAfterCommitDeadline() public {
        uint256 caseId = _toDrawn(SEED);
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        wr.finalize(caseId); // 0 commits == 0 reveals, reveal phase open -> settle early
        assertEq(uint8(wr.getCase(caseId).refundReason), uint8(RestMyCase.RefundReason.NoReveals));
    }

    function test_Tie_RefundsParties() public {
        uint256 caseId = _toDrawn(SEED);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(1, 2, 1, 2, 0);
        _commitAll(caseId, v);
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        for (uint256 i; i < 4; ++i) {
            _reveal(caseId, j[i], v[i]);
        }
        wr.finalize(caseId); // 4 commits, 4 reveals
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(uint8(c.refundReason), uint8(RestMyCase.RefundReason.Tie));
        assertEq(wr.owed(alice), FEE);
        assertEq(wr.owed(bob), FEE);
        for (uint256 i; i < 5; ++i) {
            assertEq(wr.owed(j[i]), 0);
        }
    }

    // ------------------------------------------------------------------ invalid reveals

    function test_InvalidReveals() public {
        uint256 caseId = _toDrawn(SEED);
        address[] memory j = wr.getJurors(caseId);
        _commit(caseId, j[0], 1);

        vm.startPrank(j[0]);
        vm.expectRevert(RestMyCase.RevealNotOpen.selector);
        wr.revealVote(caseId, 1, _salt(j[0]));
        vm.stopPrank();

        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        vm.startPrank(j[0]);
        vm.expectRevert(RestMyCase.InvalidReveal.selector);
        wr.revealVote(caseId, 2, _salt(j[0])); // wrong vote
        vm.expectRevert(RestMyCase.InvalidReveal.selector);
        wr.revealVote(caseId, 1, bytes32("wrong salt"));
        vm.expectRevert(RestMyCase.InvalidVote.selector);
        wr.revealVote(caseId, 0, _salt(j[0]));
        vm.expectRevert(RestMyCase.InvalidVote.selector);
        wr.revealVote(caseId, 3, _salt(j[0]));
        wr.revealVote(caseId, 1, _salt(j[0]));
        vm.expectRevert(RestMyCase.AlreadyRevealed.selector);
        wr.revealVote(caseId, 1, _salt(j[0]));
        vm.stopPrank();

        vm.prank(j[1]); // never committed
        vm.expectRevert(RestMyCase.NotCommitted.selector);
        wr.revealVote(caseId, 1, _salt(j[1]));

        vm.prank(alice); // not a juror
        vm.expectRevert(RestMyCase.NotJuror.selector);
        wr.revealVote(caseId, 1, _salt(alice));
    }

    function test_CommitIsBoundToJuror() public {
        // Copying another juror's commitment does not let you reveal their vote as yours.
        uint256 caseId = _toDrawn(SEED);
        address[] memory j = wr.getJurors(caseId);
        bytes32 c0 = wr.computeCommitment(caseId, j[0], 1, _salt(j[0]));
        vm.prank(j[0]);
        wr.commitVote(caseId, c0);
        vm.prank(j[1]);
        wr.commitVote(caseId, c0);
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        vm.prank(j[1]);
        vm.expectRevert(RestMyCase.InvalidReveal.selector);
        wr.revealVote(caseId, 1, _salt(j[0]));
    }

    function test_CommitGuards() public {
        uint256 caseId = _toDrawn(SEED);
        address j = wr.getJurors(caseId)[0];
        vm.startPrank(j);
        vm.expectRevert(RestMyCase.InvalidReveal.selector);
        wr.commitVote(caseId, bytes32(0));
        wr.commitVote(caseId, bytes32(uint256(1)));
        vm.expectRevert(RestMyCase.AlreadyCommitted.selector);
        wr.commitVote(caseId, bytes32(uint256(2)));
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(RestMyCase.NotJuror.selector);
        wr.commitVote(caseId, bytes32(uint256(1)));
    }

    // ------------------------------------------------------------------ rounding

    function test_Rounding_RemainderDistributed() public {
        vm.prank(owner);
        wr.setSpeedFee(RestMyCase.Speed.Standard, 1e18 + 1); // pot = 2e18 + 2, split 3 ways -> remainder 1... check exact sum
        uint256 caseId = _toDrawn(SEED);
        address[] memory j = wr.getJurors(caseId);
        uint8[] memory v = _votes(1, 1, 2, 0, 0);
        _commitAll(caseId, v);
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        for (uint256 i; i < 3; ++i) {
            _reveal(caseId, j[i], v[i]);
        }
        wr.finalize(caseId);
        uint256 pot = 2 * (1e18 + 1);
        uint256 sum;
        for (uint256 i; i < 3; ++i) {
            sum += wr.owed(j[i]);
            vm.prank(j[i]);
            wr.withdraw();
        }
        assertEq(sum, pot);
        assertEq(gd.balanceOf(address(wr)), 0, "dust stuck");
    }

    // ------------------------------------------------------------------ owner powers, pause, fee

    function test_Pause_BlocksOnlyNewCases() public {
        uint256 openId = _open();
        uint256 votingId = _toDrawn(SEED);
        vm.prank(owner);
        wr.setNewCasesPaused(true);

        vm.prank(alice);
        vm.expectRevert(RestMyCase.NewCasesArePaused.selector);
        wr.openCase(RestMyCase.Speed.Standard, RestMyCase.Mode.TwoSided, CONTENT_A, inviteSigner);

        // Joining, voting, finalizing, refunds and withdrawals all still work.
        address[] memory j = wr.getJurors(votingId);
        uint8[] memory v = _votes(2, 2, 2, 2, 2);
        _commitAll(votingId, v);
        for (uint256 i; i < 5; ++i) {
            _reveal(votingId, j[i], 2);
        }
        wr.finalize(votingId);
        vm.prank(j[0]);
        wr.withdraw();

        vm.warp(block.timestamp + JOIN_WINDOW + 1);
        wr.cancelExpired(openId);
        vm.prank(alice);
        wr.withdraw();

        vm.prank(owner);
        wr.setNewCasesPaused(false);
        _open();
    }

    function test_Pause_DoesNotBlockJoin() public {
        uint256 caseId = _open();
        vm.prank(owner);
        wr.setNewCasesPaused(true);
        vm.prank(bob);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, _sig(caseId, bob));
    }

    function test_Fee_LockedPerCase() public {
        uint256 caseId = _open();
        vm.prank(owner);
        wr.setSpeedFee(RestMyCase.Speed.Standard, 1_000e18);
        uint256 before = gd.balanceOf(bob);
        vm.prank(bob);
        wr.joinCase(caseId, CONTENT_B, RestMyCase.Speed.Standard, FEE, _sig(caseId, bob));
        assertEq(before - gd.balanceOf(bob), FEE, "B pays the locked fee");
        assertEq(wr.getCase(caseId).fee, FEE);
        assertEq(wr.getCase(_open()).fee, 1_000e18);
    }

    function test_Fee_Cap() public {
        vm.startPrank(owner);
        vm.expectRevert(RestMyCase.InvalidFee.selector);
        wr.setSpeedFee(RestMyCase.Speed.Standard, 1_000e18 + 1);
        vm.expectRevert(RestMyCase.InvalidFee.selector);
        wr.setSpeedFee(RestMyCase.Speed.Standard, 0);
        wr.setSpeedFee(RestMyCase.Speed.Standard, 1_000e18);
        vm.stopPrank();

        RestMyCase.Config memory cfg = _config(5, 7);
        cfg.standardFee = 1_000e18 + 1;
        vm.expectRevert(RestMyCase.InvalidFee.selector);
        new RestMyCase(cfg);
    }

    function test_OwnerOnly() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        wr.setNewCasesPaused(true);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        wr.setSpeedFee(RestMyCase.Speed.Standard, 1e18);
        vm.stopPrank();
    }

    function test_Config_Validation() public {
        RestMyCase.Config memory cfg = _config(4, 7); // even jury
        vm.expectRevert(RestMyCase.InvalidConfig.selector);
        new RestMyCase(cfg);
        cfg = _config(5, 4); // min pool < jury
        vm.expectRevert(RestMyCase.InvalidConfig.selector);
        new RestMyCase(cfg);
        cfg = _config(33, 40); // jury too big
        vm.expectRevert(RestMyCase.InvalidConfig.selector);
        new RestMyCase(cfg);
        cfg = _config(5, 7);
        cfg.joinWindow = 0;
        vm.expectRevert(RestMyCase.InvalidConfig.selector);
        new RestMyCase(cfg);
    }

    function test_Withdraw_NothingOwed() public {
        vm.prank(alice);
        vm.expectRevert(RestMyCase.NothingToWithdraw.selector);
        wr.withdraw();
    }

    // ------------------------------------------------------------------ pool & snapshot manipulation

    function test_Snapshot_PostSeedPoolChangesDoNotAlterJury() public {
        uint256 caseId = _openAndJoin();
        wr.requestJury(caseId);
        uint256 snapshot = vm.snapshotState();

        rng.fulfill(wr.getCase(caseId).randomnessId, SEED);
        wr.drawJury(caseId);
        address[] memory expected = wr.getJurors(caseId);

        vm.revertToState(snapshot);
        // Seed becomes known, then the pool is manipulated before the draw.
        rng.fulfill(wr.getCase(caseId).randomnessId, SEED);
        for (uint256 i; i < 5; ++i) {
            address friend = makeAddr(string.concat("friend", vm.toString(i)));
            _verify(friend);
            vm.prank(friend);
            wr.joinPool();
        }
        vm.prank(expected[0]);
        wr.leavePool(); // leaving after the snapshot does not remove you from this draw
        vm.roll(block.number + 1);
        wr.drawJury(caseId);
        address[] memory actual = wr.getJurors(caseId);
        assertEq(keccak256(abi.encode(actual)), keccak256(abi.encode(expected)));
    }

    function test_Pool_LeaveAndRejoin() public {
        address j = pool[0];
        vm.startPrank(j);
        wr.leavePool();
        vm.expectRevert(RestMyCase.NotInPool.selector);
        wr.leavePool();
        wr.joinPool();
        vm.stopPrank();
        assertEq(wr.activePoolSize(), 10);
        assertEq(wr.poolLength(), 11);
    }

    function test_Pool_RemoveInvalidEntry() public {
        vm.expectRevert(RestMyCase.EntryStillValid.selector);
        wr.removeInvalidPoolEntry(0);
        id.removeWhitelisted(pool[0]);
        wr.removeInvalidPoolEntry(0);
        assertEq(wr.activePoolSize(), 9);
        vm.expectRevert(RestMyCase.NotInPool.selector);
        wr.removeInvalidPoolEntry(0);
    }

    // ------------------------------------------------------------------ token fee (G$ fee formula)

    function test_ReceiverFeeToken_AccountsActualReceived() public {
        gd.setFeeBps(100); // 1% charged to receiver
        uint256 caseId = _openAndJoin();
        RestMyCase.Case memory c = wr.getCase(caseId);
        assertEq(c.depositA, FEE * 99 / 100);
        assertEq(c.depositB, FEE * 99 / 100);
        vm.warp(block.timestamp + DRAW_WINDOW + 1);
        wr.cancelExpired(caseId);
        vm.prank(alice);
        wr.withdraw();
        vm.prank(bob);
        wr.withdraw();
        assertEq(gd.balanceOf(address(wr)), 0);
    }
}
