// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {EraMath} from "src/libraries/EraMath.sol";
import {EraMathHarness} from "test/harness/EraMathHarness.sol";

contract ReenteringNETH {
    Grave public grave;
    bool internal entered;

    function setGrave(Grave grave_) external {
        grave = grave_;
    }

    function mint(address, uint256) external {
        if (!entered) {
            entered = true;
            grave.bury{value: 1 ether}(0);
        }
    }

    receive() external payable {}
}

contract EthForce {
    constructor(address payable to) payable {
        selfdestruct(to);
    }
}

contract GraveTest is Test {
    uint256 internal constant FULL_ERA_NETH = 10_000_000 ether;

    address internal setter;
    address internal alice;
    address internal bob;
    NETH internal neth;
    Grave internal grave;
    EraMathHarness internal math;

    event Buried(address indexed user, uint256 ethAmount, uint256 nethMinted, uint256 endingEra);
    event EraCompleted(uint256 indexed era, uint256 ethBuried, uint256 nethMinted);
    event Transfer(address indexed from, address indexed to, uint256 value);

    function setUp() public {
        setter = makeAddr("setter");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        neth = new NETH(setter);
        grave = new Grave(address(neth));
        math = new EraMathHarness();
        vm.prank(setter);
        neth.setGrave(address(grave));
        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
    }

    function _assertSelectorAbsent(bytes memory callData) internal {
        (bool ok, bytes memory data) = address(grave).call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function test_constructorRevertsZeroAddress() public {
        vm.expectRevert(Grave.ZeroAddress.selector);
        new Grave(address(0));
    }

    function test_constructorRevertsEoa() public {
        vm.expectRevert(Grave.NotContract.selector);
        new Grave(alice);
    }

    function test_genesisState() public view {
        assertEq(grave.protectedPrincipal(), 0);
        assertEq(grave.currentEra(), 0);
        assertEq(grave.currentEraBuried(), 0);
        assertEq(grave.totalNethMinted(), 0);
        assertEq(neth.totalSupply(), 0);
        assertEq(grave.currentNAV(), 0);
        assertEq(grave.currentEraCapacity(), 10 ether);
        assertEq(grave.currentRewardRate(), 1_000_000 ether);
        assertEq(grave.activeStrategy(), address(0));
        assertEq(grave.harvestableYield(), 0);
        assertEq(address(neth.grave()), address(grave));
    }

    function test_buryRevertsZeroValue() public {
        uint256 aliceEth = alice.balance;
        vm.prank(alice);
        vm.expectRevert(EraMath.ZeroValue.selector);
        grave.bury{value: 0}(0);
        assertEq(alice.balance, aliceEth);
        assertEq(grave.protectedPrincipal(), 0);
        assertEq(neth.totalSupply(), 0);
    }

    function test_buryEraZeroOneEth() public {
        vm.expectEmit(true, false, false, true, address(grave));
        emit Buried(alice, 1 ether, 1_000_000 ether, 0);
        vm.expectEmit(true, true, false, true, address(neth));
        emit Transfer(address(0), alice, 1_000_000 ether);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 1 ether}(0);

        assertEq(nethOut, 1_000_000 ether);
        assertEq(neth.balanceOf(alice), 1_000_000 ether);
        assertEq(grave.protectedPrincipal(), 1 ether);
        assertEq(address(grave).balance, 1 ether);
        assertEq(grave.currentNAV(), 1 ether);
        assertEq(grave.currentEra(), 0);
        assertEq(grave.currentEraBuried(), 1 ether);
        assertEq(grave.totalNethMinted(), 1_000_000 ether);
        assertEq(neth.totalSupply(), 1_000_000 ether);
    }

    function test_exactEraZeroCompletion() public {
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(0, 10 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit Buried(alice, 10 ether, FULL_ERA_NETH, 1);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 10 ether}(0);

        assertEq(nethOut, FULL_ERA_NETH);
        assertEq(grave.currentEra(), 1);
        assertEq(grave.currentEraBuried(), 0);
        assertEq(grave.protectedPrincipal(), 10 ether);
        assertEq(grave.currentEraCapacity(), 20 ether);
        assertEq(grave.currentRewardRate(), 500_000 ether);
    }

    function test_buryCrossesOneEra() public {
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(0, 10 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit Buried(alice, 11 ether, 10_500_000 ether, 1);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 11 ether}(0);

        assertEq(nethOut, 10_500_000 ether);
        assertEq(grave.currentEra(), 1);
        assertEq(grave.currentEraBuried(), 1 ether);
        assertEq(grave.protectedPrincipal(), 11 ether);
    }

    function test_buryCrossesTwoEras() public {
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(0, 10 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(1, 20 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit Buried(alice, 31 ether, 20_250_000 ether, 2);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 31 ether}(0);

        assertEq(nethOut, 20_250_000 ether);
        assertEq(grave.currentEra(), 2);
        assertEq(grave.currentEraBuried(), 1 ether);
    }

    function test_buryCrossesManyEras() public {
        uint256 ethIn = 150 ether;
        uint256 expected = 40_000_000 ether;

        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(0, 10 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(1, 20 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(2, 40 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(3, 80 ether, FULL_ERA_NETH);
        vm.expectEmit(true, false, false, true, address(grave));
        emit Buried(alice, ethIn, expected, 4);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: ethIn}(0);

        assertEq(nethOut, expected);
        assertEq(grave.currentEra(), 4);
        assertEq(grave.currentEraBuried(), 0);
        assertEq(grave.protectedPrincipal(), ethIn);
        assertEq(grave.totalNethMinted(), expected);
        assertEq(address(grave).balance, ethIn);
    }

    function test_minNethOutSucceedsWhenOutputMeetsMin() public {
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 1 ether}(1_000_000 ether);
        assertEq(nethOut, 1_000_000 ether);
    }

    function test_minNethOutRevertsOnSameBlockEraTransition() public {
        uint256 quote = grave.quoteBury(5 ether);

        vm.prank(bob);
        grave.bury{value: 10 ether}(0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Grave.InsufficientNethOut.selector, 2_500_000 ether, quote));
        grave.bury{value: 5 ether}(quote);
    }

    function test_quoteBuryMatchesBury() public {
        uint256 quote = grave.quoteBury(3 ether);
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 3 ether}(quote);
        assertEq(nethOut, quote);
        assertEq(quote, 3_000_000 ether);
    }

    function test_quoteBuryMatchesBuryAfterPartialEra() public {
        vm.prank(bob);
        grave.bury{value: 7 ether}(0);
        uint256 quote = grave.quoteBury(5 ether);
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 5 ether}(0);
        assertEq(nethOut, quote);
        assertEq(nethOut, 4_000_000 ether);
    }

    function test_mintOnlyViaGrave() public {
        vm.prank(alice);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        vm.prank(setter);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        vm.prank(address(grave));
        neth.mint(alice, 1);
        assertEq(neth.balanceOf(alice), 1);
    }

    function test_receiveDonationDoesNotMintOrRaisePrincipal() public {
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        uint256 supply = neth.totalSupply();
        uint256 principal = grave.protectedPrincipal();

        vm.deal(bob, 2 ether);
        vm.prank(bob);
        (bool ok,) = address(grave).call{value: 2 ether}("");
        assertTrue(ok);

        assertEq(grave.protectedPrincipal(), principal);
        assertEq(neth.totalSupply(), supply);
        assertEq(grave.currentNAV(), 3 ether);
        assertEq(grave.harvestableYield(), 2 ether);
        assertEq(address(grave).balance, 3 ether);
    }

    function test_dealDoesNotMintOrRaisePrincipal() public {
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        uint256 supply = neth.totalSupply();

        vm.deal(address(grave), address(grave).balance + 4 ether);

        assertEq(grave.protectedPrincipal(), 1 ether);
        assertEq(neth.totalSupply(), supply);
        assertEq(grave.currentNAV(), 5 ether);
        assertEq(grave.harvestableYield(), 4 ether);
    }

    function test_selfdestructForceEthDoesNotMintOrRaisePrincipal() public {
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        uint256 supply = neth.totalSupply();

        new EthForce{value: 3 ether}(payable(address(grave)));

        assertEq(grave.protectedPrincipal(), 1 ether);
        assertEq(neth.totalSupply(), supply);
        assertEq(grave.currentNAV(), 4 ether);
        assertEq(grave.harvestableYield(), 3 ether);
    }

    function test_currentNavIsBalanceAndNoStrategy() public {
        vm.prank(alice);
        grave.bury{value: 2 ether}(0);
        assertEq(grave.currentNAV(), address(grave).balance);
        assertEq(grave.activeStrategy(), address(0));
    }

    function test_zeroYieldSolvencyIndependentOfDonations() public {
        vm.prank(alice);
        grave.bury{value: 4 ether}(0);
        vm.prank(bob);
        grave.bury{value: 6 ether}(0);
        vm.prank(alice);
        (bool ok,) = address(grave).call{value: 5 ether}("");
        assertTrue(ok);

        assertEq(grave.protectedPrincipal(), 10 ether);
        assertEq(grave.totalNethMinted(), 10_000_000 ether);
        assertEq(grave.harvestableYield(), 5 ether);
        assertEq(address(grave).balance, 15 ether);
    }

    function test_noWithdrawRedeemHarvestPauseOrOwner() public {
        _assertSelectorAbsent(abi.encodeWithSignature("withdraw(uint256)", uint256(1)));
        _assertSelectorAbsent(abi.encodeWithSignature("redeem(uint256)", uint256(1)));
        _assertSelectorAbsent(abi.encodeWithSignature("unstake(uint256)", uint256(1)));
        _assertSelectorAbsent(abi.encodeWithSignature("harvest()"));
        _assertSelectorAbsent(abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(abi.encodeWithSignature("unpause()"));
        _assertSelectorAbsent(abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(abi.encodeWithSignature("transferOwnership(address)", alice));
    }

    function test_buryReentrancyGuarded() public {
        ReenteringNETH attacker = new ReenteringNETH();
        vm.deal(address(attacker), 5 ether);
        Grave g = new Grave(address(attacker));
        attacker.setGrave(g);
        vm.deal(alice, 2 ether);

        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        g.bury{value: 1 ether}(0);
    }

    function test_tinyBurialThatMintsZeroReverts() public {
        uint256 toEra20 = 10 * ((uint256(1) << 20) - 1) * 1 ether;
        vm.deal(alice, toEra20 + 1);
        vm.prank(alice);
        grave.bury{value: toEra20}(0);
        assertEq(grave.currentEra(), 20);

        vm.prank(alice);
        vm.expectRevert(EraMath.ZeroNethOut.selector);
        grave.bury{value: 1}(0);
    }

    function test_highEraArithmeticDoesNotOverflow() public {
        uint256 maxE = math.maxEra();
        uint256 toLast = 10 * ((uint256(1) << maxE) - 1) * 1 ether;
        vm.deal(alice, toLast + 1 ether);
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: toLast}(0);
        assertEq(grave.currentEra(), maxE);
        assertEq(nethOut, FULL_ERA_NETH * maxE);
        assertEq(grave.totalNethMinted(), FULL_ERA_NETH * maxE);

        vm.prank(alice);
        uint256 last = grave.bury{value: 1 ether}(0);
        assertGt(last, 0);
        assertEq(grave.currentEra(), maxE);
        assertEq(grave.currentEraBuried(), 1 ether);
    }

    function test_roundingAcrossBoundaryDoesNotExceedSegmentFloors() public {
        vm.prank(bob);
        grave.bury{value: 9 ether + 1}(0);

        uint256 quote = grave.quoteBury(2 ether - 1);
        uint256 first = math.nethForSegment(10 ether - (9 ether + 1), 0);
        uint256 second = math.nethForSegment(2 ether - 1 - (10 ether - (9 ether + 1)), 1);
        assertEq(quote, first + second);

        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 2 ether - 1}(0);
        assertEq(nethOut, quote);
        assertLe(nethOut, 1_000_000 ether + 500_000 ether);
    }

    function test_buryBeforeSetGraveReverts() public {
        NETH unlocked = new NETH(setter);
        Grave g = new Grave(address(unlocked));
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(NETH.NotGrave.selector);
        g.bury{value: 1 ether}(0);
        assertEq(g.protectedPrincipal(), 0);
        assertEq(unlocked.totalSupply(), 0);
    }

    function test_quoteBuryRevertsZeroValue() public {
        vm.expectRevert(EraMath.ZeroValue.selector);
        grave.quoteBury(0);
    }
}
