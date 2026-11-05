// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {WhosRight} from "../src/WhosRight.sol";

contract FuzzTest is BaseTest {
    /// Fee sharing: for any fee and any number of revealers with a majority, the full pot is credited,
    /// shares differ by at most 1 wei, non-revealers get nothing, and the contract ends empty.
    function testFuzz_FeeSharing(uint256 fee, uint8 revealMask, uint8 voteMask, bytes32 seed) public {
        fee = bound(fee, 1, wr.MAX_CASE_FEE());
        vm.prank(owner);
        wr.setSpeedFee(WhosRight.Speed.Standard, fee);

        uint256 caseId = _toDrawn(seed);
        address[] memory j = wr.getJurors(caseId);
        uint8 a;
        uint8 b;
        for (uint256 i; i < 5; ++i) {
            if ((revealMask >> i) & 1 == 1) {
                uint8 v = ((voteMask >> i) & 1) == 1 ? 1 : 2;
                _commit(caseId, j[i], v);
                v == 1 ? a++ : b++;
            }
        }
        vm.warp(wr.getCase(caseId).commitDeadline + 1);
        for (uint256 i; i < 5; ++i) {
            if ((revealMask >> i) & 1 == 1) _reveal(caseId, j[i], ((voteMask >> i) & 1) == 1 ? 1 : 2);
        }
        wr.finalize(caseId);

        uint256 pot = 2 * fee;
        uint256 r = a + b;
        if (r == 0 || a == b) {
            assertEq(wr.owed(alice), fee);
            assertEq(wr.owed(bob), fee);
        } else {
            uint256 sum;
            uint256 minShare = type(uint256).max;
            uint256 maxShare;
            for (uint256 i; i < 5; ++i) {
                uint256 o = wr.owed(j[i]);
                if ((revealMask >> i) & 1 == 0) {
                    assertEq(o, 0);
                    continue;
                }
                sum += o;
                if (o < minShare) minShare = o;
                if (o > maxShare) maxShare = o;
            }
            assertEq(sum, pot, "full pot credited");
            assertLe(maxShare - minShare, 1, "equal shares");
            assertEq(wr.owed(alice) + wr.owed(bob), 0, "winner gets nothing");
        }
        // Everyone withdraws: no dust left.
        for (uint256 i; i < 5; ++i) {
            if (wr.owed(j[i]) > 0) {
                vm.prank(j[i]);
                wr.withdraw();
            }
        }
        if (wr.owed(alice) > 0) {
            vm.prank(alice);
            wr.withdraw();
        }
        if (wr.owed(bob) > 0) {
            vm.prank(bob);
            wr.withdraw();
        }
        assertEq(gd.balanceOf(address(wr)), 0);
    }

    /// Parties are never drawn, for any seed.
    function testFuzz_PartiesNeverJurors(bytes32 seed) public {
        vm.prank(alice);
        wr.joinPool();
        vm.prank(bob);
        wr.joinPool();
        vm.roll(block.number + 1);
        uint256 caseId = _openAndJoin();
        wr.requestJury(caseId);
        rng.fulfill(wr.getCase(caseId).randomnessId, seed);
        wr.drawJury(caseId);
        address[] memory j = wr.getJurors(caseId);
        for (uint256 i; i < j.length; ++i) {
            assertTrue(j[i] != alice && j[i] != bob);
            for (uint256 k; k < i; ++k) {
                assertTrue(j[i] != j[k], "duplicate juror");
            }
        }
    }
}
