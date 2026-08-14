// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {EraMath} from "src/libraries/EraMath.sol";

contract EraMathHarness {
    function maxEra() external pure returns (uint256) {
        return EraMath.maxEra();
    }

    function eraCapacity(uint256 era) external pure returns (uint256) {
        return EraMath.eraCapacity(era);
    }

    function rewardRate(uint256 era) external pure returns (uint256) {
        return EraMath.rewardRate(era);
    }

    function nethForSegment(uint256 ethAmount, uint256 era) external pure returns (uint256) {
        return EraMath.nethForSegment(ethAmount, era);
    }

    function splitBury(uint256 currentEra_, uint256 currentEraBuried_, uint256 nethMintedThisEra_, uint256 ethAmount)
        external
        pure
        returns (EraMath.SplitResult memory)
    {
        return EraMath.splitBury(currentEra_, currentEraBuried_, nethMintedThisEra_, ethAmount);
    }
}
