// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseTest} from "../utils/BaseTest.sol";
import {Handler} from "./Handler.sol";
import {console} from "forge-std/console.sol";

contract InvariantTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory parties = new address[](4);
        parties[0] = alice;
        parties[1] = bob;
        for (uint256 i = 2; i < 4; ++i) {
            parties[i] = makeAddr(string.concat("party", vm.toString(i)));
            _verify(parties[i]);
        }
        handler = new Handler(wr, gd, rng, parties, pool);
        targetContract(address(handler));
        // Use the 5-arg join etc. via fullCycle too; all handler functions are targeted.
    }

    /// The contract never pays out more than it received.
    function invariant_NeverPaysOutMoreThanReceived() public view {
        assertLe(handler.ghostWithdrawn(), handler.ghostDeposited());
    }

    /// Every G$ held is accounted for: escrow of live cases + amounts owed. No stuck or missing funds.
    /// One-sided cases have no party B (address 0); nothing may ever be credited there.
    function invariant_NothingCreditedToZeroAddress() public view {
        assertEq(wr.owed(address(0)), 0);
    }

    function invariant_BalanceMatchesLiabilities() public view {
        assertEq(gd.balanceOf(address(wr)), wr.totalEscrowed() + wr.totalOwed());
        assertEq(gd.balanceOf(address(wr)), handler.ghostDeposited() - handler.ghostWithdrawn());
    }

    function afterInvariant() external view {
        console.log("opened", handler.nOpened(), "joined", handler.nJoined());
        console.log("drawn", handler.nDrawn(), "reveals", handler.nReveals());
        console.log("resolved", handler.nResolved(), "refunded", handler.nRefunded());
        console.log("withdrawals", handler.nWithdrawals());
    }
}
