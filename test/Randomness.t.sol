// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {WitnetRandomnessSource, IWitnetRandomnessV2} from "../src/randomness/WitnetRandomnessSource.sol";
import {InsecureTestnetRandomness} from "../src/randomness/InsecureTestnetRandomness.sol";
import {MockWitnet} from "./mocks/MockWitnet.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {WhosRight} from "../src/WhosRight.sol";
import {IRandomnessSource} from "../src/interfaces/IRandomnessSource.sol";

contract WitnetSourceTest is Test {
    MockWitnet internal witnet;
    WitnetRandomnessSource internal src;
    address internal payer = makeAddr("payer");

    function setUp() public {
        witnet = new MockWitnet();
        src = new WitnetRandomnessSource(IWitnetRandomnessV2(address(witnet)));
        vm.deal(payer, 10 ether);
    }

    function test_ExactFeeForwarded_OverpaymentReturned() public {
        vm.prank(payer);
        uint256 id = src.request{value: 1 ether}(payer);
        assertEq(id, block.number);
        assertEq(witnet.collected(), 0.05 ether, "only the estimate goes to Witnet");
        assertEq(payer.balance, 10 ether - 0.05 ether, "excess returned");
        assertEq(address(src).balance, 0);
    }

    function test_InsufficientFeeReverts() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(WitnetRandomnessSource.InsufficientFee.selector, 0.01 ether, 0.05 ether));
        src.request{value: 0.01 ether}(payer);
    }

    function test_SameBlockSecondRequestFullyRefunded() public {
        vm.prank(payer);
        src.request{value: 0.05 ether}(payer);
        vm.prank(payer);
        uint256 id = src.request{value: 0.05 ether}(payer); // Witnet refunds via transfer (2300 gas)
        assertEq(id, block.number);
        assertEq(witnet.collected(), 0.05 ether);
        assertEq(payer.balance, 10 ether - 0.05 ether);
    }

    function test_FeeChangeIsReadAtCallTime() public {
        witnet.setBaseFee(0.2 ether);
        assertEq(src.fee(1 gwei), 0.2 ether);
        vm.prank(payer);
        vm.expectRevert();
        src.request{value: 0.05 ether}(payer);
    }

    function test_RetryKeepsKey() public {
        vm.prank(payer);
        uint256 id = src.request{value: 0.05 ether}(payer);
        vm.roll(block.number + 5);
        vm.prank(payer);
        assertEq(src.retry{value: 0.05 ether}(id, payer), id);
        assertFalse(src.isReady(id));
        witnet.resolve(id, keccak256("r"));
        assertTrue(src.isReady(id));
        assertEq(src.randomness(id), keccak256(abi.encode(id, keccak256("r"))));
    }

    function test_RejectsStrayCelo() public {
        vm.prank(payer);
        (bool ok,) = address(src).call{value: 1}("");
        assertFalse(ok);
    }
}

contract InsecureSourceTest is Test {
    function test_RefusesCeloMainnet() public {
        vm.chainId(42220);
        vm.expectRevert(InsecureTestnetRandomness.NotOnMainnet.selector);
        new InsecureTestnetRandomness();
    }

    function test_ReadyWindow() public {
        vm.chainId(11142220);
        InsecureTestnetRandomness src = new InsecureTestnetRandomness();
        uint256 id = src.request(address(this));
        assertFalse(src.isReady(id));
        vm.roll(block.number + 2);
        assertTrue(src.isReady(id));
        vm.roll(id + 257);
        assertFalse(src.isReady(id));
        vm.expectRevert(InsecureTestnetRandomness.NoFeeRequired.selector);
        src.request{value: 1}(address(this));
    }
}

/// @notice End-to-end through WhosRight with the Witnet adapter (mocked Witnet).
contract WhosRightWitnetTest is BaseTest {
    MockWitnet internal witnet;
    WhosRight internal wrw;

    function setUp() public override {
        super.setUp();
        witnet = new MockWitnet();
        WhosRight.Config memory cfg = _config(JURY, MIN_POOL);
        cfg.randomnessSource = IRandomnessSource(address(new WitnetRandomnessSource(IWitnetRandomnessV2(address(witnet)))));
        wrw = new WhosRight(cfg);
        for (uint256 i; i < pool.length; ++i) {
            vm.prank(pool[i]);
            wrw.joinPool();
        }
        vm.prank(alice);
        gd.approve(address(wrw), type(uint256).max);
        vm.prank(bob);
        gd.approve(address(wrw), type(uint256).max);
        vm.roll(block.number + 1);
    }

    function test_FullFlowWithWitnetAdapter() public {
        vm.prank(alice);
        uint256 caseId = wrw.openCase(CONTENT_A, inviteSigner);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(invitePk, _joinDigest(address(wrw), caseId, bob));
        vm.prank(bob);
        wrw.joinCase(caseId, CONTENT_B, abi.encodePacked(r, s, v));

        address keeper = makeAddr("keeper");
        vm.deal(keeper, 1 ether);
        uint256 fee = wrw.randomnessFee(tx.gasprice);
        vm.prank(keeper);
        wrw.requestJury{value: fee + 0.3 ether}(caseId);
        assertEq(keeper.balance, 1 ether - fee, "keeper pays exactly the Witnet fee");

        uint256 key = wrw.getCase(caseId).randomnessId;
        vm.roll(block.number + 300); // ~5 minutes of Celo blocks
        assertFalse(wrw.isRandomnessReady(caseId));
        witnet.resolve(key, keccak256("witnet"));
        wrw.drawJury(caseId);
        assertEq(wrw.getJurors(caseId).length, JURY);
    }
}
