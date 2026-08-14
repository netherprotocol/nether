// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {EraMath} from "src/libraries/EraMath.sol";
import {EraMathHarness} from "test/harness/EraMathHarness.sol";

contract EraMathFuzzTest is Test {
    EraMathHarness internal math;

    function setUp() public {
        math = new EraMathHarness();
    }

    function testFuzz_rewardRateNeverIncreases(uint256 a, uint256 b) public view {
        uint256 maxE = math.maxEra();
        a = bound(a, 0, maxE);
        b = bound(b, 0, maxE);
        if (a <= b) {
            assertGe(math.rewardRate(a), math.rewardRate(b));
        } else {
            assertLe(math.rewardRate(a), math.rewardRate(b));
        }
    }

    function testFuzz_eraCapacityNeverDecreases(uint256 a, uint256 b) public view {
        uint256 maxE = math.maxEra();
        a = bound(a, 0, maxE);
        b = bound(b, 0, maxE);
        if (a <= b) {
            assertLe(math.eraCapacity(a), math.eraCapacity(b));
        } else {
            assertGe(math.eraCapacity(a), math.eraCapacity(b));
        }
    }

    function testFuzz_fullEraIssuance(uint256 era) public view {
        era = bound(era, 0, math.maxEra());
        assertEq(math.nethForSegment(math.eraCapacity(era), era), 10_000_000 ether);
    }

    function testFuzz_splitMatchesSegmentSum(uint256 buried, uint256 ethAmount) public view {
        buried = bound(buried, 0, 10 ether - 1);
        ethAmount = bound(ethAmount, 1, 150 ether);
        uint256 nethAlready = math.nethForSegment(buried, 0);
        EraMath.SplitResult memory split = math.splitBury(0, buried, nethAlready, ethAmount);
        assertGt(split.nethOut, 0);
        assertGe(split.endingEra, 0);
        assertLe(split.endingEra, math.maxEra());
        if (split.endingEra < math.maxEra() || split.endingEraBuried < math.eraCapacity(split.endingEra)) {
            assertLt(split.endingEraBuried, math.eraCapacity(split.endingEra) + 1);
        }
    }

    function testFuzz_pastMaxEraReverts(uint256 era) public {
        era = bound(era, math.maxEra() + 1, type(uint64).max);
        vm.expectRevert(abi.encodeWithSelector(EraMath.RewardRateZero.selector, era));
        math.rewardRate(era);
    }
}
