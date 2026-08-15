// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {NETH} from "./NETH.sol";
import {EraMath} from "./libraries/EraMath.sol";
import {IStrategyAdapter} from "./interfaces/IStrategyAdapter.sol";

contract Grave is ReentrancyGuard, Ownable2Step {
    uint256 public constant STRATEGY_CHANGE_DELAY = 14 days;

    NETH public immutable neth;

    address public reaper;
    address public activeStrategy;

    uint256 public currentEra;
    uint256 public currentEraBuried;
    uint256 public protectedPrincipal;
    uint256 public totalNethMinted;

    uint256 internal nethMintedThisEra;
    address internal pendingAdapter;
    uint256 internal pendingExecuteAfter;

    error ZeroAddress();
    error NotContract();
    error InsufficientNethOut(uint256 nethOut, uint256 minNethOut);
    error ReaperAlreadySet();
    error ReaperNotSet();
    error NoHarvestableYield();
    error ZeroHarvest();
    error HarvestBreachesPrincipal();
    error StrategyAlreadyPending();
    error NoPendingStrategy();
    error StrategyDelayNotElapsed(uint256 executeAfter);
    error InvalidStrategy();
    error SameStrategy();

    event Buried(address indexed user, uint256 ethAmount, uint256 nethMinted, uint256 endingEra);
    event EraCompleted(uint256 indexed era, uint256 ethBuried, uint256 nethMinted);
    event StrategyDeposit(address indexed strategy, uint256 ethAmount);
    event YieldHarvested(uint256 ethAmount, uint256 reaperBalance);
    event StrategyMigrationScheduled(address indexed oldStrategy, address indexed newStrategy, uint256 executeAfter);
    event StrategyMigrated(
        address indexed oldStrategy, address indexed newStrategy, uint256 navBefore, uint256 navAfter
    );
    event ReaperSet(address indexed reaper);
    event StrategyMigrationCancelled(address indexed oldStrategy, address indexed newStrategy);

    constructor(address neth_, address initialOwner_) Ownable(initialOwner_) {
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
        return address(this).balance + _strategyAssets();
    }

    function harvestableYield() public view returns (uint256) {
        uint256 nav = currentNAV();
        uint256 principal = protectedPrincipal;
        return nav > principal ? nav - principal : 0;
    }

    function pendingStrategy() external view returns (address adapter, uint256 executeAfter) {
        return (pendingAdapter, pendingExecuteAfter);
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
        _deployIdle();
    }

    function harvest() external nonReentrant returns (uint256 ethHarvested) {
        address reaper_ = reaper;
        if (reaper_ == address(0)) {
            revert ReaperNotSet();
        }

        uint256 reportedHarvestable = harvestableYield();
        if (reportedHarvestable == 0) {
            revert NoHarvestableYield();
        }

        ethHarvested = _realizeHarvest(reportedHarvestable);

        uint256 nav = currentNAV();
        uint256 principal = protectedPrincipal;
        if (nav < principal) {
            revert HarvestBreachesPrincipal();
        }
        uint256 maxSendable = nav - principal;
        if (ethHarvested > maxSendable) {
            ethHarvested = maxSendable;
        }
        if (ethHarvested == 0) {
            revert ZeroHarvest();
        }

        Address.sendValue(payable(reaper_), ethHarvested);
        emit YieldHarvested(ethHarvested, reaper_.balance);
    }

    function setReaper(address reaper_) external onlyOwner {
        if (reaper != address(0)) {
            revert ReaperAlreadySet();
        }
        if (reaper_ == address(0)) {
            revert ZeroAddress();
        }
        if (reaper_.code.length == 0) {
            revert NotContract();
        }
        reaper = reaper_;
        emit ReaperSet(reaper_);
    }

    function scheduleStrategy(address newAdapter) external onlyOwner {
        if (pendingAdapter != address(0)) {
            revert StrategyAlreadyPending();
        }
        if (newAdapter == address(0)) {
            revert ZeroAddress();
        }
        if (newAdapter.code.length == 0) {
            revert NotContract();
        }
        if (newAdapter == activeStrategy) {
            revert SameStrategy();
        }

        pendingAdapter = newAdapter;
        pendingExecuteAfter = block.timestamp + STRATEGY_CHANGE_DELAY;
        emit StrategyMigrationScheduled(activeStrategy, newAdapter, pendingExecuteAfter);
    }

    function cancelScheduledStrategy() external onlyOwner {
        address pending = pendingAdapter;
        if (pending == address(0)) {
            revert NoPendingStrategy();
        }
        emit StrategyMigrationCancelled(activeStrategy, pending);
        pendingAdapter = address(0);
        pendingExecuteAfter = 0;
    }

    function executeStrategyMigration() external onlyOwner nonReentrant {
        address pending = pendingAdapter;
        if (pending == address(0)) {
            revert NoPendingStrategy();
        }
        uint256 executeAfter = pendingExecuteAfter;
        address old = activeStrategy;
        if (old != address(0) && block.timestamp < executeAfter) {
            revert StrategyDelayNotElapsed(executeAfter);
        }
        uint256 navBefore = _navSnapshot();

        if (old != address(0)) {
            try IStrategyAdapter(old).totalAssetsInETH() returns (uint256 assets) {
                if (assets > 0) {
                    try IStrategyAdapter(old).withdrawETH(assets, address(this)) returns (uint256) {} catch {}
                }
            } catch {}
        }

        uint256 idle = address(this).balance;
        activeStrategy = pending;
        pendingAdapter = address(0);
        pendingExecuteAfter = 0;

        if (idle > 0) {
            IStrategyAdapter(pending).depositETH{value: idle}();
        }

        uint256 navAfter = currentNAV();
        emit StrategyMigrated(old, pending, navBefore, navAfter);
        if (idle > 0) {
            emit StrategyDeposit(pending, idle);
        }
    }

    function _strategyAssets() internal view returns (uint256) {
        address strategy = activeStrategy;
        if (strategy == address(0)) {
            return 0;
        }
        return IStrategyAdapter(strategy).totalAssetsInETH();
    }

    function _navSnapshot() internal view returns (uint256 nav) {
        nav = address(this).balance;
        address strategy = activeStrategy;
        if (strategy == address(0)) {
            return nav;
        }
        try IStrategyAdapter(strategy).totalAssetsInETH() returns (uint256 assets) {
            nav += assets;
        } catch {}
    }

    function _deployIdle() internal {
        address strategy = activeStrategy;
        if (strategy == address(0)) {
            return;
        }
        uint256 idle = address(this).balance;
        if (idle == 0) {
            return;
        }
        try IStrategyAdapter(strategy).depositETH{value: idle}() {
            emit StrategyDeposit(strategy, idle);
        } catch {}
    }

    function _realizeHarvest(uint256 reportedHarvestable) internal returns (uint256 ethHarvested) {
        uint256 idle = address(this).balance;
        uint256 principal = protectedPrincipal;
        uint256 idleSurplus = idle > principal ? idle - principal : 0;
        uint256 toPull = reportedHarvestable > idleSurplus ? reportedHarvestable - idleSurplus : 0;
        uint256 received;
        if (toPull > 0 && activeStrategy != address(0)) {
            received = _collectFromAdapter(toPull);
        }
        ethHarvested = idleSurplus + received;
    }

    function _collectFromAdapter(uint256 amount) internal returns (uint256 received) {
        address strategy = activeStrategy;
        if (strategy == address(0) || amount == 0) {
            return 0;
        }
        uint256 balBefore = address(this).balance;
        IStrategyAdapter(strategy).withdrawETH(amount, address(this));
        uint256 balAfter = address(this).balance;
        received = balAfter > balBefore ? balAfter - balBefore : 0;
    }
}
