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
    uint256 public constant STRATEGY_MIGRATION_WITHDRAW_FAILURE_LIMIT = 3;
    uint256 public constant STRATEGY_MIGRATION_RETRY_DELAY = 1 days;

    NETH public immutable neth;

    address public reaper;
    address public activeStrategy;

    uint256 public currentEra;
    uint256 public currentEraBuried;
    uint256 public protectedPrincipal;
    uint256 public totalNethMinted;
    uint256 public impairedCapital;
    uint256 public pendingWithdrawFailures;
    uint256 public lastMigrationFailureTime;

    mapping(address => uint256) public impairedOwed;

    uint256 internal nethMintedThisEra;
    address internal pendingAdapter;
    uint256 internal pendingExecuteAfter;
    address[] internal impairedAdapters;
    mapping(address => uint256) internal impairedIndex;

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
    error StrategyMigrationRetryDelayNotElapsed(uint256 retryAfter);
    error AdapterNotImpaired();
    error ZeroRecover();

    event Buried(address indexed user, uint256 ethAmount, uint256 nethMinted, uint256 endingEra);
    event EraCompleted(uint256 indexed era, uint256 ethBuried, uint256 nethMinted);
    event StrategyDeposit(address indexed strategy, uint256 ethAmount);
    event StrategyDepositFailed(address indexed strategy, uint256 ethAmount, bytes reason);
    event YieldHarvested(uint256 ethAmount, uint256 reaperBalance);
    event StrategyMigrationScheduled(address indexed oldStrategy, address indexed newStrategy, uint256 executeAfter);
    event StrategyMigrated(
        address indexed oldStrategy, address indexed newStrategy, uint256 navBefore, uint256 navAfter
    );
    event ReaperSet(address indexed reaper);
    event StrategyMigrationCancelled(address indexed oldStrategy, address indexed newStrategy);
    event StrategyMigrationWithdrawFailed(
        address indexed oldStrategy, address indexed newStrategy, uint256 attempt, bytes reason
    );
    event StrategyImpaired(
        address indexed oldStrategy, address indexed newStrategy, uint256 impairedDelta, uint256 impairedCapital
    );
    event ImpairedRecovered(address indexed adapter, uint256 received, uint256 pay, uint256 impairedCapital);

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

    function requiredBacking() public view returns (uint256) {
        return protectedPrincipal - impairedCapital;
    }

    function harvestableYield() public view returns (uint256) {
        uint256 nav = currentNAV();
        uint256 req = requiredBacking();
        return nav > req ? nav - req : 0;
    }

    function pendingStrategy() external view returns (address adapter, uint256 executeAfter) {
        return (pendingAdapter, pendingExecuteAfter);
    }

    function impairedAdapterCount() external view returns (uint256) {
        return impairedAdapters.length;
    }

    function impairedAdapterAt(uint256 i) external view returns (address) {
        return impairedAdapters[i];
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
        uint256 req = requiredBacking();
        if (nav < req) {
            revert HarvestBreachesPrincipal();
        }
        uint256 maxSendable = nav - req;
        if (ethHarvested > maxSendable) {
            ethHarvested = maxSendable;
        }
        if (ethHarvested == 0) {
            revert ZeroHarvest();
        }

        Address.sendValue(payable(reaper_), ethHarvested);
        emit YieldHarvested(ethHarvested, reaper_.balance);
    }

    function recoverImpaired(address adapter) external nonReentrant returns (uint256 received) {
        uint256 owed = impairedOwed[adapter];
        if (owed == 0) {
            revert AdapterNotImpaired();
        }

        uint256 balBefore = address(this).balance;
        IStrategyAdapter(adapter).withdrawETH(type(uint256).max, address(this));
        received = address(this).balance - balBefore;
        if (received == 0) {
            revert ZeroRecover();
        }

        uint256 pay = received < owed ? received : owed;
        impairedOwed[adapter] = owed - pay;
        impairedCapital -= pay;
        if (owed == pay) {
            _removeImpaired(adapter);
        }
        emit ImpairedRecovered(adapter, received, pay, impairedCapital);
        _deployIdle();
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
        pendingWithdrawFailures = 0;
        lastMigrationFailureTime = 0;
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
        pendingWithdrawFailures = 0;
        lastMigrationFailureTime = 0;
    }

    function executeStrategyMigration() external onlyOwner nonReentrant {
        address pending = pendingAdapter;
        if (pending == address(0)) {
            revert NoPendingStrategy();
        }
        address old = activeStrategy;
        uint256 executeAfter = pendingExecuteAfter;
        if (old != address(0) && block.timestamp < executeAfter) {
            revert StrategyDelayNotElapsed(executeAfter);
        }
        if (old != address(0) && pendingWithdrawFailures > 0) {
            uint256 retryAfter = lastMigrationFailureTime + STRATEGY_MIGRATION_RETRY_DELAY;
            if (block.timestamp < retryAfter) {
                revert StrategyMigrationRetryDelayNotElapsed(retryAfter);
            }
        }

        uint256 navBefore = _navSnapshot();
        if (old == address(0)) {
            _completeMigration(old, pending, navBefore, true);
            return;
        }

        (bool fullSuccess,, bytes memory reason) = _tryPullRecoverable(old);
        if (fullSuccess) {
            _completeMigration(old, pending, navBefore, true);
            return;
        }

        uint256 failures = pendingWithdrawFailures + 1;
        pendingWithdrawFailures = failures;
        lastMigrationFailureTime = block.timestamp;
        emit StrategyMigrationWithdrawFailed(old, pending, failures, reason);

        if (failures < STRATEGY_MIGRATION_WITHDRAW_FAILURE_LIMIT) {
            return;
        }

        uint256 observedActive = address(this).balance + _assetsIfAny(pending);
        uint256 req = requiredBacking();
        uint256 delta = req > observedActive ? req - observedActive : 0;
        if (delta > 0) {
            impairedCapital += delta;
            _creditOwed(old, delta);
        }
        emit StrategyImpaired(old, pending, delta, impairedCapital);
        _completeMigration(old, pending, navBefore, false);
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

    function _assetsIfAny(address adapter) internal view returns (uint256) {
        try IStrategyAdapter(adapter).totalAssetsInETH() returns (uint256 assets) {
            return assets;
        } catch {
            return 0;
        }
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
        } catch (bytes memory reason) {
            emit StrategyDepositFailed(strategy, idle, reason);
        }
    }

    function _completeMigration(address old, address newAdapter, uint256 navBefore, bool revertOnDepositFail) internal {
        uint256 idle = address(this).balance;
        activeStrategy = newAdapter;
        pendingAdapter = address(0);
        pendingExecuteAfter = 0;
        pendingWithdrawFailures = 0;
        lastMigrationFailureTime = 0;

        if (idle > 0) {
            if (revertOnDepositFail) {
                IStrategyAdapter(newAdapter).depositETH{value: idle}();
                emit StrategyDeposit(newAdapter, idle);
            } else {
                _deployIdle();
            }
        }

        uint256 navAfter = currentNAV();
        emit StrategyMigrated(old, newAdapter, navBefore, navAfter);
    }

    function _tryPullRecoverable(address old)
        internal
        returns (bool fullSuccess, uint256 received, bytes memory reason)
    {
        uint256 balBefore = address(this).balance;
        bool reportedOk;
        uint256 request = type(uint256).max;

        try IStrategyAdapter(old).totalAssetsInETH() returns (uint256 assets) {
            reportedOk = true;
            request = assets;
        } catch (bytes memory data) {
            reason = data;
        }

        if (reportedOk && request == 0) {
            return (true, 0, "");
        }

        try IStrategyAdapter(old).withdrawETH(request, address(this)) {
            received = address(this).balance - balBefore;
        } catch (bytes memory data) {
            received = address(this).balance - balBefore;
            return (false, received, data);
        }

        if (!reportedOk) {
            return (false, received, reason);
        }

        uint256 remaining;
        try IStrategyAdapter(old).totalAssetsInETH() returns (uint256 left) {
            remaining = left;
        } catch (bytes memory data) {
            return (false, received, data);
        }

        if (remaining > 0 || received < request) {
            return (false, received, "");
        }
        return (true, received, "");
    }

    function _creditOwed(address adapter, uint256 delta) internal {
        if (delta == 0) {
            return;
        }
        if (impairedIndex[adapter] == 0) {
            impairedAdapters.push(adapter);
            impairedIndex[adapter] = impairedAdapters.length;
        }
        impairedOwed[adapter] += delta;
    }

    function _removeImpaired(address adapter) internal {
        uint256 idx = impairedIndex[adapter];
        uint256 lastIndex = impairedAdapters.length;
        uint256 i = idx - 1;
        if (i != lastIndex - 1) {
            address moved = impairedAdapters[lastIndex - 1];
            impairedAdapters[i] = moved;
            impairedIndex[moved] = idx;
        }
        impairedAdapters.pop();
        delete impairedIndex[adapter];
    }

    function _realizeHarvest(uint256 reportedHarvestable) internal returns (uint256 ethHarvested) {
        uint256 idle = address(this).balance;
        uint256 req = requiredBacking();
        uint256 idleSurplus = idle > req ? idle - req : 0;
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
