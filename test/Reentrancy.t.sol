// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "./utils/BaseTest.sol";
import {WhosRight} from "../src/WhosRight.sol";
import {MockGoodDollar} from "./mocks/MockGoodDollar.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Contract account that registers ERC777-style hooks on the mock G$ and tries to re-enter WhosRight.
contract HookAttacker {
    WhosRight public immutable wr;
    uint256 public reentryAttempts;
    uint256 public reentryBlocked;
    bool public armed;
    bool public revertOnReceive;
    uint256 public targetCase;

    constructor(WhosRight wr_, MockGoodDollar gd_) {
        wr = wr_;
        gd_.setHook(address(this));
        gd_.approve(address(wr_), type(uint256).max);
    }

    function arm(bool on, uint256 caseId) external {
        armed = on;
        targetCase = caseId;
    }

    function setRevertOnReceive(bool on) external {
        revertOnReceive = on;
    }

    function joinPool() external {
        wr.joinPool();
    }

    function openCase(bytes32 content, address signer) external returns (uint256) {
        return wr.openCase(content, signer);
    }

    function commit(uint256 caseId, bytes32 c) external {
        wr.commitVote(caseId, c);
    }

    function reveal(uint256 caseId, uint8 vote, bytes32 salt) external {
        wr.revealVote(caseId, vote, salt);
    }

    function withdraw() external {
        wr.withdraw();
    }

    function tokensToSend(address, address, address, uint256) external {
        _attack();
    }

    function tokensReceived(address, address, address, uint256) external {
        if (revertOnReceive) revert("blocked recipient");
        _attack();
    }

    function _attack() private {
        if (!armed) return;
        armed = false;
        _try(abi.encodeCall(WhosRight.withdraw, ()));
        _try(abi.encodeCall(WhosRight.cancelExpired, (targetCase)));
        _try(abi.encodeCall(WhosRight.finalize, (targetCase)));
        _try(abi.encodeCall(WhosRight.openCase, (keccak256("x"), address(1))));
        armed = true;
    }

    function _try(bytes memory data) private {
        reentryAttempts++;
        (bool ok, bytes memory ret) = address(wr).call(data);
        if (!ok && bytes4(ret) == ReentrancyGuard.ReentrancyGuardReentrantCall.selector) reentryBlocked++;
    }
}

contract ReentrancyTest is BaseTest {
    HookAttacker internal attacker;

    function setUp() public override {
        super.setUp();
        attacker = new HookAttacker(wr, gd);
        id.whitelist(address(attacker));
        gd.mint(address(attacker), 100_000e18);
    }

    function test_Reentrancy_DepositHookCannotReenter() public {
        attacker.arm(true, 1);
        uint256 caseId = attacker.openCase(CONTENT_A, inviteSigner); // tokensToSend fires during pull
        assertEq(attacker.reentryAttempts(), 4);
        assertEq(attacker.reentryBlocked(), 4);
        assertEq(wr.getCase(caseId).depositA, FEE);
        assertEq(wr.caseCount(), 1);
    }

    function test_Reentrancy_WithdrawHookCannotDoubleWithdraw() public {
        uint256 caseId = attacker.openCase(CONTENT_A, inviteSigner);
        vm.warp(block.timestamp + JOIN_WINDOW + 1);
        wr.cancelExpired(caseId);
        _openAndJoin(); // other users' escrow a double-withdraw could try to steal

        uint256 before = gd.balanceOf(address(attacker));
        attacker.arm(true, caseId);
        attacker.withdraw(); // tokensReceived fires during payout
        assertEq(attacker.reentryBlocked(), 4);
        assertEq(gd.balanceOf(address(attacker)) - before, FEE, "paid exactly once");
        assertEq(gd.balanceOf(address(wr)), 2 * FEE, "other escrow untouched");
        assertEq(wr.totalEscrowed() + wr.totalOwed(), gd.balanceOf(address(wr)));
    }

    function test_Reentrancy_AttackerJurorPaidOnce() public {
        attacker.joinPool();
        vm.roll(block.number + 1);
        uint256 caseId;
        address[] memory j;
        bool found;
        for (uint256 s; s < 50 && !found; ++s) {
            caseId = _toDrawn(keccak256(abi.encode("r", s)));
            j = wr.getJurors(caseId);
            for (uint256 i; i < j.length; ++i) {
                if (j[i] == address(attacker)) found = true;
            }
        }
        assertTrue(found, "attacker never drawn");
        bytes32 salt = keccak256("as");
        for (uint256 i; i < j.length; ++i) {
            if (j[i] == address(attacker)) {
                attacker.commit(caseId, wr.computeCommitment(caseId, address(attacker), 1, salt));
            } else {
                _commit(caseId, j[i], 1);
            }
        }
        for (uint256 i; i < j.length; ++i) {
            if (j[i] == address(attacker)) attacker.reveal(caseId, 1, salt);
            else _reveal(caseId, j[i], 1);
        }
        wr.finalize(caseId);
        uint256 before = gd.balanceOf(address(attacker));
        attacker.arm(true, caseId);
        attacker.withdraw();
        assertEq(gd.balanceOf(address(attacker)) - before, 2 * FEE / JURY);
        assertGt(attacker.reentryBlocked(), 0);
        assertEq(wr.owed(address(attacker)), 0);
    }

    function test_BlockedRecipientCannotBlockOthers() public {
        // A recipient whose transfers revert (like a G$-blocklisted account) only blocks its own withdrawal.
        uint256 caseId = attacker.openCase(CONTENT_A, inviteSigner);
        vm.warp(block.timestamp + JOIN_WINDOW + 1);
        wr.cancelExpired(caseId);
        attacker.setRevertOnReceive(true);
        vm.expectRevert();
        attacker.withdraw();
        assertEq(wr.owed(address(attacker)), FEE, "still owed, nothing lost");

        uint256 other = _openAndJoin();
        vm.warp(block.timestamp + DRAW_WINDOW + 1);
        wr.cancelExpired(other);
        vm.prank(alice);
        wr.withdraw();
        vm.prank(bob);
        wr.withdraw();
    }
}
