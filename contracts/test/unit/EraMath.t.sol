// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EraMath} from "src/libraries/EraMath.sol";
import {EraMathHarness} from "test/harness/EraMathHarness.sol";

contract EraMathTest is Test {
    uint256 internal constant FULL_ERA_NETH = 10_000_000 ether;
    uint256 internal constant INITIAL_CAPACITY = 10 ether;
    uint256 internal constant INITIAL_RATE = 1_000_000 ether;

    EraMathHarness internal math;

    function setUp() public {
        math = new EraMathHarness();
    }

    function test_eraTableZeroThroughSeven() public view {
        uint256[8] memory capacities =
            [uint256(10 ether), 20 ether, 40 ether, 80 ether, 160 ether, 320 ether, 640 ether, 1280 ether];
        uint256[8] memory rates = [
            uint256(1_000_000 ether),
            500_000 ether,
            250_000 ether,
            125_000 ether,
            62_500 ether,
            31_250 ether,
            15_625 ether,
            7_812.5 ether
        ];
        uint256 cumulativeEth;
        uint256 grossSupply;

        for (uint256 e; e < 8; ++e) {
            assertEq(math.eraCapacity(e), capacities[e]);
            assertEq(math.rewardRate(e), rates[e]);
            assertEq(math.nethForSegment(capacities[e], e), FULL_ERA_NETH);
            cumulativeEth += capacities[e];
            grossSupply += FULL_ERA_NETH;
            assertEq(cumulativeEth, 10 * ((uint256(2) << e) - 1) * 1 ether);
            assertEq(grossSupply, FULL_ERA_NETH * (e + 1));
        }
    }

    function test_completedEraFormulasGAndS() public view {
        for (uint256 n; n < 8; ++n) {
            uint256 g;
            uint256 s;
            for (uint256 e; e <= n; ++e) {
                g += math.eraCapacity(e);
                s += math.nethForSegment(math.eraCapacity(e), e);
            }
            assertEq(g, 10 * ((uint256(1) << (n + 1)) - 1) * 1 ether);
            assertEq(s, FULL_ERA_NETH * (n + 1));
        }
    }

    function test_fullEraIssuanceThroughMaxEra() public view {
        uint256 maxE = math.maxEra();
        for (uint256 e; e <= maxE; ++e) {
            assertEq(math.nethForSegment(math.eraCapacity(e), e), FULL_ERA_NETH);
        }
    }

    function test_rewardRateNeverIncreasesCapacityNeverDecreases() public view {
        uint256 maxE = math.maxEra();
        uint256 prevRate = math.rewardRate(0);
        uint256 prevCap = math.eraCapacity(0);
        for (uint256 e = 1; e <= maxE; ++e) {
            uint256 rate = math.rewardRate(e);
            uint256 cap = math.eraCapacity(e);
            assertLe(rate, prevRate);
            assertGe(cap, prevCap);
            prevRate = rate;
            prevCap = cap;
        }
    }

    function test_maxEraDerivedFromConstants() public view {
        assertEq(math.maxEra(), 79);
        assertEq(math.maxEra(), Math.log2(INITIAL_RATE));
        assertGt(math.rewardRate(math.maxEra()), 0);
        assertGt(math.nethForSegment(math.eraCapacity(math.maxEra()), math.maxEra()), 0);
    }

    function test_rewardRateRevertsPastMaxEra() public {
        uint256 past = math.maxEra() + 1;
        vm.expectRevert(abi.encodeWithSelector(EraMath.RewardRateZero.selector, past));
        math.rewardRate(past);
        vm.expectRevert(abi.encodeWithSelector(EraMath.RewardRateZero.selector, past));
        math.eraCapacity(past);
        vm.expectRevert(abi.encodeWithSelector(EraMath.RewardRateZero.selector, past));
        math.nethForSegment(1 ether, past);
    }

    function test_specCrossingExample() public view {
        uint256 nethAlready = math.nethForSegment(9 ether, 0);
        EraMath.SplitResult memory split = math.splitBury(0, 9 ether, nethAlready, 3 ether);
        assertEq(split.nethOut, 2_000_000 ether);
        assertEq(split.endingEra, 1);
        assertEq(split.endingEraBuried, 2 ether);
        assertEq(split.completed.length, 1);
        assertEq(split.completed[0].era, 0);
        assertEq(split.completed[0].ethBuried, 10 ether);
        assertEq(split.completed[0].nethMinted, FULL_ERA_NETH);
    }

    function test_nethForSegmentFloorsAndNeverExceedsRational() public view {
        uint256[4] memory eths = [uint256(1), uint256(1 ether) / 3, uint256(1 ether), uint256(3 ether)];
        for (uint256 e; e < 8; ++e) {
            uint256 denom = 1 ether * (uint256(2) ** e);
            for (uint256 i; i < eths.length; ++i) {
                uint256 ethAmount = eths[i];
                uint256 nethOut = math.nethForSegment(ethAmount, e);
                assertEq(nethOut, Math.mulDiv(ethAmount, INITIAL_RATE, denom));
                assertLe(nethOut * denom, ethAmount * INITIAL_RATE);
                if (nethOut < type(uint256).max) {
                    assertLt(ethAmount * INITIAL_RATE, (nethOut + 1) * denom);
                }
            }
        }
    }

    function test_splitBuryRevertsZeroValue() public {
        vm.expectRevert(EraMath.ZeroValue.selector);
        math.splitBury(0, 0, 0, 0);
    }

    function test_splitBuryRevertsZeroNethOut() public {
        vm.expectRevert(EraMath.ZeroNethOut.selector);
        math.splitBury(20, 0, 0, 1);
    }

    function test_splitBuryRevertsPastMaxEra() public {
        uint256 maxE = math.maxEra();
        uint256 cap = math.eraCapacity(maxE);
        vm.expectRevert(abi.encodeWithSelector(EraMath.RewardRateZero.selector, maxE + 1));
        math.splitBury(maxE, cap, FULL_ERA_NETH, 1);
    }
}
