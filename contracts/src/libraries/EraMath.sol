// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

library EraMath {
    uint256 internal constant WAD = 1 ether;
    uint256 internal constant INITIAL_ERA_CAPACITY = 10 ether;
    uint256 internal constant INITIAL_REWARD_RATE = 1_000_000 ether;
    uint256 internal constant CAPACITY_MULTIPLIER = 2;
    uint256 internal constant REWARD_DIVISOR = 2;

    error ZeroValue();
    error ZeroNethOut();
    error RewardRateZero(uint256 era);

    struct CompletedEra {
        uint256 era;
        uint256 ethBuried;
        uint256 nethMinted;
    }

    struct SplitResult {
        uint256 nethOut;
        uint256 endingEra;
        uint256 endingEraBuried;
        uint256 endingNethMintedThisEra;
        CompletedEra[] completed;
    }

    struct SplitState {
        uint256 era;
        uint256 buried;
        uint256 nethThisEra;
        uint256 remaining;
        uint256 nethOut;
        uint256 completedCount;
    }

    function maxEra() internal pure returns (uint256) {
        return Math.log2(INITIAL_REWARD_RATE);
    }

    function eraCapacity(uint256 era) internal pure returns (uint256) {
        _requireMintableEra(era);
        return INITIAL_ERA_CAPACITY * CAPACITY_MULTIPLIER ** era;
    }

    function rewardRate(uint256 era) internal pure returns (uint256) {
        _requireMintableEra(era);
        return INITIAL_REWARD_RATE / REWARD_DIVISOR ** era;
    }

    // Floor once per segment (spec §5.4). Do not pre-truncate rewardRate or a full era can undershoot 10M NETH.
    function nethForSegment(uint256 ethAmount, uint256 era) internal pure returns (uint256) {
        _requireMintableEra(era);
        return Math.mulDiv(ethAmount, INITIAL_REWARD_RATE, WAD * REWARD_DIVISOR ** era);
    }

    function splitBury(uint256 currentEra_, uint256 currentEraBuried_, uint256 nethMintedThisEra_, uint256 ethAmount)
        internal
        pure
        returns (SplitResult memory result)
    {
        if (ethAmount == 0) {
            revert ZeroValue();
        }

        uint256 maxE = maxEra();
        if (currentEra_ > maxE) {
            revert RewardRateZero(currentEra_);
        }

        SplitState memory s = SplitState({
            era: currentEra_,
            buried: currentEraBuried_,
            nethThisEra: nethMintedThisEra_,
            remaining: ethAmount,
            nethOut: 0,
            completedCount: 0
        });

        CompletedEra[] memory completed = new CompletedEra[](maxE + 1);

        while (s.remaining > 0) {
            if (s.era > maxE) {
                revert RewardRateZero(s.era);
            }

            uint256 cap = eraCapacity(s.era);
            uint256 space = cap - s.buried;
            if (space == 0) {
                s.era += 1;
                s.buried = 0;
                s.nethThisEra = 0;
                continue;
            }

            uint256 take = s.remaining < space ? s.remaining : space;
            uint256 nethSeg = nethForSegment(take, s.era);
            s.nethOut += nethSeg;
            s.nethThisEra += nethSeg;
            s.buried += take;
            s.remaining -= take;

            if (s.buried == cap) {
                completed[s.completedCount] = CompletedEra({era: s.era, ethBuried: cap, nethMinted: s.nethThisEra});
                unchecked {
                    ++s.completedCount;
                }
                if (s.era == maxE) {
                    if (s.remaining > 0) {
                        revert RewardRateZero(s.era + 1);
                    }
                    break;
                }
                s.era += 1;
                s.buried = 0;
                s.nethThisEra = 0;
            }
        }

        if (s.nethOut == 0) {
            revert ZeroNethOut();
        }

        result.nethOut = s.nethOut;
        result.endingEra = s.era;
        result.endingEraBuried = s.buried;
        result.endingNethMintedThisEra = s.nethThisEra;
        result.completed = new CompletedEra[](s.completedCount);
        for (uint256 i; i < s.completedCount; ++i) {
            result.completed[i] = completed[i];
        }
    }

    function _requireMintableEra(uint256 era) private pure {
        if (era > maxEra()) {
            revert RewardRateZero(era);
        }
    }
}
