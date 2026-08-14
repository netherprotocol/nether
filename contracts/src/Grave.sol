// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {NETH} from "./NETH.sol";
import {EraMath} from "./libraries/EraMath.sol";

contract Grave is ReentrancyGuard {
    NETH public immutable neth;

    uint256 public currentEra;
    uint256 public currentEraBuried;
    uint256 public protectedPrincipal;
    uint256 public totalNethMinted;

    uint256 internal nethMintedThisEra;

    error ZeroAddress();
    error NotContract();
    error InsufficientNethOut(uint256 nethOut, uint256 minNethOut);

    event Buried(address indexed user, uint256 ethAmount, uint256 nethMinted, uint256 endingEra);
    event EraCompleted(uint256 indexed era, uint256 ethBuried, uint256 nethMinted);

    constructor(address neth_) {
        if (neth_ == address(0)) {
            revert ZeroAddress();
        }
        if (neth_.code.length == 0) {
            revert NotContract();
        }
        neth = NETH(neth_);
    }

    receive() external payable {}

    function currentEraCapacity() external view returns (uint256) {
        return EraMath.eraCapacity(currentEra);
    }

    function currentRewardRate() external view returns (uint256) {
        return EraMath.rewardRate(currentEra);
    }

    function quoteBury(uint256 ethAmount) external view returns (uint256 nethOut) {
        return EraMath.splitBury(currentEra, currentEraBuried, nethMintedThisEra, ethAmount).nethOut;
    }

    function currentNAV() public view returns (uint256) {
        return address(this).balance;
    }

    function harvestableYield() external view returns (uint256) {
        uint256 nav = currentNAV();
        uint256 principal = protectedPrincipal;
        return nav > principal ? nav - principal : 0;
    }

    function activeStrategy() external pure returns (address) {
        return address(0);
    }

    function bury(uint256 minNethOut) external payable nonReentrant returns (uint256 nethOut) {
        EraMath.SplitResult memory split = EraMath.splitBury(currentEra, currentEraBuried, nethMintedThisEra, msg.value);
        nethOut = split.nethOut;
        if (nethOut < minNethOut) {
            revert InsufficientNethOut(nethOut, minNethOut);
        }

        currentEra = split.endingEra;
        currentEraBuried = split.endingEraBuried;
        nethMintedThisEra = split.endingNethMintedThisEra;
        protectedPrincipal += msg.value;
        totalNethMinted += nethOut;

        uint256 completedLen = split.completed.length;
        for (uint256 i; i < completedLen; ++i) {
            EraMath.CompletedEra memory completed = split.completed[i];
            emit EraCompleted(completed.era, completed.ethBuried, completed.nethMinted);
        }
        emit Buried(msg.sender, msg.value, nethOut, split.endingEra);

        neth.mint(msg.sender, nethOut);
    }
}
