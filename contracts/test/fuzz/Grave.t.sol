// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {EraMath} from "src/libraries/EraMath.sol";
import {EraMathHarness} from "test/harness/EraMathHarness.sol";

contract GraveFuzzTest is Test {
    address internal setter;
    address internal alice;
    NETH internal neth;
    Grave internal grave;
    EraMathHarness internal math;

    function setUp() public {
        setter = makeAddr("setter");
        alice = makeAddr("alice");
        neth = new NETH(setter);
        grave = new Grave(address(neth));
        math = new EraMathHarness();
        vm.prank(setter);
        neth.setGrave(address(grave));
        vm.deal(alice, type(uint128).max);
    }

    function testFuzz_protectedPrincipalIncreasesByExactValue(uint256 amount) public {
        amount = bound(amount, 1, 1000 ether);
        uint256 principalBefore = grave.protectedPrincipal();
        uint256 aliceBefore = alice.balance;

        vm.prank(alice);
        grave.bury{value: amount}(0);

        assertEq(grave.protectedPrincipal(), principalBefore + amount);
        assertEq(alice.balance, aliceBefore - amount);
        assertEq(address(grave).balance, principalBefore + amount);
    }

    function testFuzz_protectedPrincipalNeverDecreases(uint256 first, uint256 second) public {
        first = bound(first, 1, 100 ether);
        second = bound(second, 1, 100 ether);
        vm.prank(alice);
        grave.bury{value: first}(0);
        uint256 afterFirst = grave.protectedPrincipal();
        vm.prank(alice);
        grave.bury{value: second}(0);
        assertGe(grave.protectedPrincipal(), afterFirst);
    }

    function testFuzz_quoteBuryEqualsBuryOutput(uint256 amount) public {
        amount = bound(amount, 1, 500 ether);
        uint256 era = grave.currentEra();
        uint256 buried = grave.currentEraBuried();
        uint256 quote = grave.quoteBury(amount);
        EraMath.SplitResult memory split = math.splitBury(era, buried, math.nethForSegment(buried, era), amount);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: amount}(0);

        assertEq(nethOut, quote);
        assertEq(nethOut, split.nethOut);
        assertEq(grave.totalNethMinted(), nethOut);
        assertEq(neth.balanceOf(alice), nethOut);
        assertGt(nethOut, 0);
    }

    function testFuzz_totalMintedEqualsDeterministicIssuance(uint256 a, uint256 b, uint256 c) public {
        a = bound(a, 1, 80 ether);
        b = bound(b, 1, 80 ether);
        c = bound(c, 1, 80 ether);
        uint256 expected;
        uint256 era;
        uint256 buried;
        uint256 nethThis;

        EraMath.SplitResult memory s = math.splitBury(era, buried, nethThis, a);
        expected += s.nethOut;
        era = s.endingEra;
        buried = s.endingEraBuried;
        nethThis = s.endingNethMintedThisEra;

        s = math.splitBury(era, buried, nethThis, b);
        expected += s.nethOut;
        era = s.endingEra;
        buried = s.endingEraBuried;
        nethThis = s.endingNethMintedThisEra;

        s = math.splitBury(era, buried, nethThis, c);
        expected += s.nethOut;

        vm.startPrank(alice);
        grave.bury{value: a}(0);
        grave.bury{value: b}(0);
        grave.bury{value: c}(0);
        vm.stopPrank();

        assertEq(grave.totalNethMinted(), expected);
        assertEq(neth.totalSupply(), expected);
    }

    function testFuzz_eraRewardRateNeverIncreases(uint256 amount) public {
        uint256 rateBefore = grave.currentRewardRate();
        uint256 capBefore = grave.currentEraCapacity();
        amount = bound(amount, 1, 400 ether);
        vm.prank(alice);
        grave.bury{value: amount}(0);
        assertLe(grave.currentRewardRate(), rateBefore);
        assertGe(grave.currentEraCapacity(), capBefore);
        assertGe(grave.currentEra(), 0);
    }

    function testFuzz_noAdminPathCanMint(address caller, uint256 amount) public {
        vm.assume(caller != address(grave));
        amount = bound(amount, 0, type(uint128).max);
        uint256 supply = neth.totalSupply();
        vm.prank(caller);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, amount);
        assertEq(neth.totalSupply(), supply);
        assertEq(grave.totalNethMinted(), 0);
    }

    function testFuzz_donatedEthNeverMintsOrRaisesPrincipal(uint256 amount) public {
        amount = bound(amount, 1, 100 ether);
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        uint256 principal = grave.protectedPrincipal();
        uint256 minted = grave.totalNethMinted();
        uint256 supply = neth.totalSupply();

        vm.deal(address(this), amount);
        (bool ok,) = address(grave).call{value: amount}("");
        assertTrue(ok);

        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
        assertEq(neth.totalSupply(), supply);
        assertEq(grave.harvestableYield(), amount);
        assertEq(grave.currentNAV(), principal + amount);
    }

    function testFuzz_successfulBuryNeverReturnsEth(uint256 amount) public {
        amount = bound(amount, 1, 50 ether);
        uint256 aliceBefore = alice.balance;
        uint256 graveBefore = address(grave).balance;
        vm.prank(alice);
        grave.bury{value: amount}(0);
        assertEq(alice.balance, aliceBefore - amount);
        assertEq(address(grave).balance, graveBefore + amount);
    }

    function testFuzz_currentEraOnlyStaysOrIncreases(uint256 amount) public {
        amount = bound(amount, 1, 200 ether);
        uint256 eraBefore = grave.currentEra();
        vm.prank(alice);
        grave.bury{value: amount}(0);
        assertGe(grave.currentEra(), eraBefore);
    }

    function testFuzz_zeroNethOutNeverSucceeds(uint256 eraJumpEth) public {
        eraJumpEth = bound(eraJumpEth, 10 * ((uint256(1) << 20) - 1) * 1 ether, 10 * ((uint256(1) << 21) - 1) * 1 ether);
        vm.deal(alice, eraJumpEth + 2);
        vm.prank(alice);
        grave.bury{value: eraJumpEth}(0);

        vm.prank(alice);
        try grave.bury{value: 1}(0) returns (uint256 nethOut) {
            assertGt(nethOut, 0);
        } catch (bytes memory data) {
            assertEq(data, abi.encodeWithSelector(EraMath.ZeroNethOut.selector));
        }
    }

    function testFuzz_minNethOutTooHighReverts(uint256 amount) public {
        amount = bound(amount, 1, 20 ether);
        uint256 quote = grave.quoteBury(amount);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Grave.InsufficientNethOut.selector, quote, quote + 1));
        grave.bury{value: amount}(quote + 1);
        assertEq(grave.protectedPrincipal(), 0);
        assertEq(alice.balance, type(uint128).max);
    }
}
