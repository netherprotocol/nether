// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {IStrategyAdapter} from "src/interfaces/IStrategyAdapter.sol";
import {TestInvestAdapter} from "test/mocks/TestInvestAdapter.sol";

contract RevertingDepositAdapter is IStrategyAdapter {
    address public immutable grave;

    constructor(address grave_) {
        grave = grave_;
    }

    function depositETH() external payable {
        revert("deposit");
    }

    function withdrawETH(uint256, address) external view returns (uint256) {
        if (msg.sender != grave) revert();
        return 0;
    }

    function totalAssetsInETH() external view returns (uint256) {
        return address(this).balance;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }
}

contract RevertingWithdrawAdapter is IStrategyAdapter {
    address public immutable grave;

    constructor(address grave_) {
        grave = grave_;
    }

    function depositETH() external payable {
        if (msg.sender != grave) revert();
    }

    function withdrawETH(uint256, address) external view returns (uint256) {
        revert("withdraw");
    }

    function totalAssetsInETH() external view returns (uint256) {
        return address(this).balance;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }
}

contract ToggleNavAdapter is IStrategyAdapter {
    address public immutable grave;
    bool public broken;

    constructor(address grave_) {
        grave = grave_;
    }

    function setBroken(bool broken_) external {
        broken = broken_;
    }

    function depositETH() external payable {
        if (msg.sender != grave) revert();
    }

    function withdrawETH(uint256 amount, address recipient) external returns (uint256 received) {
        if (msg.sender != grave) revert();
        received = amount < address(this).balance ? amount : address(this).balance;
        if (received > 0) {
            payable(recipient).transfer(received);
        }
    }

    function totalAssetsInETH() external view returns (uint256) {
        if (broken) revert("nav");
        return address(this).balance;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }
}

contract ThiefAdapter is IStrategyAdapter {
    address public immutable grave;
    address payable public immutable thief;

    constructor(address grave_, address thief_) {
        grave = grave_;
        thief = payable(thief_);
    }

    function depositETH() external payable {
        if (msg.sender != grave) revert();
        if (msg.value > 0) {
            thief.transfer(msg.value);
        }
    }

    function withdrawETH(uint256, address) external view returns (uint256) {
        if (msg.sender != grave) revert();
        return 0;
    }

    function totalAssetsInETH() external view returns (uint256) {
        return address(this).balance;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }
}

contract ReenteringAdapter is IStrategyAdapter {
    Grave public grave;
    uint256 public mode;

    function setGrave(Grave grave_) external {
        grave = grave_;
    }

    function setMode(uint256 mode_) external {
        mode = mode_;
    }

    function depositETH() external payable {
        if (mode == 1) {
            mode = 0;
            grave.harvest();
        } else if (mode == 2) {
            mode = 0;
            grave.bury{value: 1}(0);
        }
    }

    function withdrawETH(uint256 amount, address recipient) external returns (uint256 received) {
        if (mode == 1) {
            mode = 0;
            grave.harvest();
        }
        received = amount < address(this).balance ? amount : address(this).balance;
        if (received > 0) {
            payable(recipient).transfer(received);
        }
    }

    function totalAssetsInETH() external view returns (uint256) {
        return address(this).balance;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }
}

contract RoundingDustAdapter is IStrategyAdapter {
    address public immutable grave;
    uint256 public dust;

    constructor(address grave_) {
        grave = grave_;
    }

    function setDust(uint256 dust_) external {
        dust = dust_;
    }

    function depositETH() external payable {
        if (msg.sender != grave) revert();
    }

    function withdrawETH(uint256 amount, address recipient) external returns (uint256 received) {
        if (msg.sender != grave) revert();
        uint256 cap = address(this).balance;
        received = amount < cap ? amount : cap;
        if (received > 0) {
            payable(recipient).transfer(received);
        }
        uint256 leftover = address(this).balance;
        uint256 burn = dust < leftover ? dust : leftover;
        if (burn > 0) {
            payable(address(0xdead)).transfer(burn);
        }
    }

    function totalAssetsInETH() external view returns (uint256) {
        return address(this).balance;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }
}

contract ReenteringReaper {
    Grave public grave;
    bool public attack;

    constructor(Grave grave_) {
        grave = grave_;
    }

    function setAttack(bool attack_) external {
        attack = attack_;
    }

    receive() external payable {
        if (attack) {
            attack = false;
            grave.harvest();
        }
    }
}

contract StrategyTest is Test {
    address internal setter;
    address internal admin;
    address internal alice;
    address internal bob;
    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;
    TestInvestAdapter internal adapter;

    event ReaperSet(address indexed reaper);
    event StrategyDeposit(address indexed strategy, uint256 ethAmount);
    event YieldHarvested(uint256 ethAmount, uint256 reaperBalance);
    event StrategyMigrationScheduled(address indexed oldStrategy, address indexed newStrategy, uint256 executeAfter);
    event StrategyMigrated(
        address indexed oldStrategy, address indexed newStrategy, uint256 navBefore, uint256 navAfter
    );
    event StrategyMigrationCancelled(address indexed oldStrategy, address indexed newStrategy);

    function setUp() public {
        setter = makeAddr("setter");
        admin = makeAddr("admin");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        neth = new NETH(setter);
        grave = new Grave(address(neth), admin);
        vm.prank(setter);
        neth.setGrave(address(grave));
        reaper = new Reaper(address(neth), address(grave));
        vm.prank(admin);
        grave.setReaper(address(reaper));
        adapter = new TestInvestAdapter(address(grave));
        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
        vm.deal(admin, 10_000 ether);
    }

    function _assertSelectorAbsent(address target, bytes memory callData) internal {
        (bool ok, bytes memory data) = target.call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function _activate(address strategy) internal {
        vm.prank(admin);
        grave.scheduleStrategy(strategy);
        vm.warp(block.timestamp + grave.STRATEGY_CHANGE_DELAY());
        vm.prank(admin);
        grave.executeStrategyMigration();
    }

    function _bury(address who, uint256 amount) internal returns (uint256 nethOut) {
        vm.prank(who);
        nethOut = grave.bury{value: amount}(0);
    }

    function test_genesisStrategySlotEmpty() public view {
        assertEq(grave.activeStrategy(), address(0));
        assertEq(grave.reaper(), address(reaper));
        assertEq(grave.owner(), admin);
        (address pending, uint256 executeAfter) = grave.pendingStrategy();
        assertEq(pending, address(0));
        assertEq(executeAfter, 0);
        assertEq(grave.STRATEGY_CHANGE_DELAY(), 14 days);
    }

    function test_pausedAbsentOnGraveNethReaper() public {
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("paused()"));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("unpause()"));
        _assertSelectorAbsent(address(neth), abi.encodeWithSignature("paused()"));
        _assertSelectorAbsent(address(reaper), abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(address(reaper), abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(address(reaper), abi.encodeWithSignature("harvest()"));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("withdraw(uint256)", uint256(1)));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("redeem(uint256)", uint256(1)));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("unstake(uint256)", uint256(1)));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("harvest(uint256)", uint256(1)));
    }

    function test_setReaperRevertsZeroEoaSecondCallAndNonOwner() public {
        NETH n2 = new NETH(setter);
        Grave g2 = new Grave(address(n2), admin);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        g2.setReaper(address(reaper));

        vm.prank(admin);
        vm.expectRevert(Grave.ZeroAddress.selector);
        g2.setReaper(address(0));

        vm.prank(admin);
        vm.expectRevert(Grave.NotContract.selector);
        g2.setReaper(alice);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(g2));
        emit ReaperSet(address(reaper));
        g2.setReaper(address(reaper));
        assertEq(g2.reaper(), address(reaper));

        vm.prank(admin);
        vm.expectRevert(Grave.ReaperAlreadySet.selector);
        g2.setReaper(address(reaper));
    }

    function test_harvestBeforeSetReaperReverts() public {
        NETH n2 = new NETH(setter);
        Grave g2 = new Grave(address(n2), admin);
        vm.prank(setter);
        n2.setGrave(address(g2));
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        g2.bury{value: 1 ether}(0);
        vm.prank(alice);
        (bool ok,) = address(g2).call{value: 1 ether}("");
        assertTrue(ok);
        vm.expectRevert(Grave.ReaperNotSet.selector);
        g2.harvest();
    }

    function test_transferAndAcceptOwnership() public {
        vm.prank(admin);
        grave.transferOwnership(alice);
        assertEq(grave.owner(), admin);
        assertEq(grave.pendingOwner(), alice);
        vm.prank(alice);
        grave.acceptOwnership();
        assertEq(grave.owner(), alice);
        assertEq(grave.pendingOwner(), address(0));
    }

    function test_renounceOwnershipSucceeds() public {
        vm.prank(admin);
        grave.renounceOwnership();
        assertEq(grave.owner(), address(0));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, admin));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
    }

    function test_nonOwnerCannotScheduleExecuteCancelOrSetReaper() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        grave.scheduleStrategy(address(adapter));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        grave.cancelScheduledStrategy();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        grave.executeStrategyMigration();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        grave.setReaper(address(reaper));
    }

    function test_donationHarvestWithoutStrategy() public {
        _bury(alice, 1 ether);
        uint256 principal = grave.protectedPrincipal();
        uint256 harvestedBefore = reaper.totalHarvestedETH();
        uint256 donatedBefore = reaper.totalDonatedETH();

        vm.prank(bob);
        (bool ok,) = address(grave).call{value: 2 ether}("");
        assertTrue(ok);
        assertEq(grave.currentNAV(), 3 ether);
        assertEq(grave.harvestableYield(), 2 ether);

        vm.expectEmit(false, false, false, true, address(grave));
        emit YieldHarvested(2 ether, 2 ether);
        uint256 harvested = grave.harvest();

        assertEq(harvested, 2 ether);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.currentNAV(), 1 ether);
        assertGe(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(reaper.totalHarvestedETH(), harvestedBefore + 2 ether);
        assertEq(reaper.totalDonatedETH(), donatedBefore);
        assertEq(address(reaper).balance, 2 ether);
        assertEq(neth.balanceOf(admin), 0);
        assertEq(admin.balance, 10_000 ether);
    }

    function test_harvestRevertsWhenNavBelowPrincipal() public {
        _activate(address(adapter));
        _bury(alice, 2 ether);
        adapter.simulateLoss(1 ether);
        assertLt(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(grave.harvestableYield(), 0);
        uint256 principal = grave.protectedPrincipal();
        vm.expectRevert(Grave.NoHarvestableYield.selector);
        grave.harvest();
        assertEq(grave.protectedPrincipal(), principal);
    }

    function test_harvestRevertsWhenNavEqualsPrincipal() public {
        _activate(address(adapter));
        _bury(alice, 1 ether);
        assertEq(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(grave.harvestableYield(), 0);
        vm.expectRevert(Grave.NoHarvestableYield.selector);
        grave.harvest();
    }

    function test_harvestClampsWhenWithdrawLeavesWeiBelowPrincipal() public {
        RoundingDustAdapter dusty = new RoundingDustAdapter(address(grave));
        _activate(address(dusty));
        _bury(alice, 2 ether);
        vm.deal(address(dusty), address(dusty).balance + 0.5 ether);
        dusty.setDust(1);
        uint256 surplus = grave.harvestableYield();
        assertEq(surplus, 0.5 ether);
        uint256 harvested = grave.harvest();
        assertEq(harvested, surplus - 1);
        assertEq(address(reaper).balance, harvested);
        assertEq(grave.protectedPrincipal(), 2 ether);
        assertGe(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(grave.currentNAV(), 2 ether);
        assertEq(address(grave).balance, 1);
    }

    function test_harvestSurplusOnlyAndPostHarvestNav() public {
        _activate(address(adapter));
        _bury(alice, 2 ether);
        adapter.simulateProfit{value: 0.5 ether}();
        uint256 principal = grave.protectedPrincipal();
        uint256 minted = grave.totalNethMinted();
        uint256 harvested = grave.harvest();
        assertEq(harvested, 0.5 ether);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
        assertGe(grave.currentNAV(), principal);
        assertEq(grave.currentNAV(), principal);
        assertEq(reaper.totalHarvestedETH(), 0.5 ether);
    }

    function test_lossThenRecoveryHarvestsOnlyExcess() public {
        _activate(address(adapter));
        _bury(alice, 5 ether);
        adapter.simulateLoss(2 ether);
        assertEq(grave.harvestableYield(), 0);
        vm.expectRevert(Grave.NoHarvestableYield.selector);
        grave.harvest();

        adapter.simulateProfit{value: 3 ether}();
        assertEq(grave.harvestableYield(), 1 ether);
        uint256 harvested = grave.harvest();
        assertEq(harvested, 1 ether);
        assertEq(grave.protectedPrincipal(), 5 ether);
        assertEq(grave.currentNAV(), 5 ether);
    }

    function test_reportedNavHighRealizableLow() public {
        _activate(address(adapter));
        _bury(alice, 3 ether);
        adapter.setReportedNav(100 ether);
        adapter.setRealizable(0);
        vm.prank(bob);
        (bool ok,) = address(grave).call{value: 4 ether}("");
        assertTrue(ok);

        uint256 adminBefore = admin.balance;
        uint256 harvested = grave.harvest();
        assertEq(harvested, 1 ether);
        assertEq(admin.balance, adminBefore);
        assertEq(grave.protectedPrincipal(), 3 ether);
        assertEq(address(grave).balance, 3 ether);
    }

    function test_withdrawRecipientIsGraveNotAdmin() public {
        _activate(address(adapter));
        _bury(alice, 1 ether);
        adapter.simulateProfit{value: 0.2 ether}();
        uint256 adminBefore = admin.balance;
        uint256 graveBefore = address(grave).balance;
        grave.harvest();
        assertEq(admin.balance, adminBefore);
        assertEq(address(grave).balance, graveBefore);
        assertEq(adapter.grave(), address(grave));
    }

    function test_yieldHarvestedMatchesReaperGain() public {
        _activate(address(adapter));
        _bury(alice, 1 ether);
        adapter.simulateProfit{value: 0.3 ether}();
        uint256 reaperBefore = address(reaper).balance;
        uint256 harvested = grave.harvest();
        assertEq(address(reaper).balance, reaperBefore + harvested);
        assertEq(harvested, 0.3 ether);
    }

    function test_harvestReentrancyFromAdapterFails() public {
        ReenteringAdapter reenter = new ReenteringAdapter();
        reenter.setGrave(grave);
        _activate(address(reenter));
        _bury(alice, 1 ether);
        vm.deal(address(reenter), address(reenter).balance + 1 ether);
        reenter.setMode(1);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        grave.harvest();
    }

    function test_harvestReentrancyFromReaperFails() public {
        NETH n2 = new NETH(setter);
        Grave g2 = new Grave(address(n2), admin);
        vm.prank(setter);
        n2.setGrave(address(g2));
        ReenteringReaper evil = new ReenteringReaper(g2);
        vm.prank(admin);
        g2.setReaper(address(evil));
        vm.deal(alice, 3 ether);
        vm.prank(alice);
        g2.bury{value: 1 ether}(0);
        vm.prank(alice);
        (bool ok,) = address(g2).call{value: 1 ether}("");
        assertTrue(ok);
        evil.setAttack(true);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        g2.harvest();
    }

    function test_zeroYieldSolvencyHarvestCannotPullPrincipal() public {
        _activate(address(adapter));
        _bury(alice, 4 ether);
        _bury(bob, 6 ether);
        uint256 principal = grave.protectedPrincipal();
        uint256 harvestedBefore = reaper.totalHarvestedETH();
        assertEq(principal, 10 ether);
        assertEq(grave.harvestableYield(), 0);
        vm.expectRevert(Grave.NoHarvestableYield.selector);
        grave.harvest();
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(reaper.totalHarvestedETH(), harvestedBefore);
        assertEq(grave.totalNethMinted(), 10_000_000 ether);
    }

    function test_buryDepositsIdleIntoAdapter() public {
        _activate(address(adapter));
        vm.expectEmit(true, false, false, true, address(grave));
        emit StrategyDeposit(address(adapter), 2 ether);
        _bury(alice, 2 ether);
        assertEq(address(grave).balance, 0);
        assertEq(adapter.totalAssetsInETH(), 2 ether);
        assertEq(grave.currentNAV(), 2 ether);
        assertEq(grave.protectedPrincipal(), 2 ether);
    }

    function test_revertingDepositDoesNotRevertBury() public {
        RevertingDepositAdapter bad = new RevertingDepositAdapter(address(grave));
        _activate(address(bad));
        uint256 nethOut = _bury(alice, 1 ether);
        assertEq(nethOut, 1_000_000 ether);
        assertEq(grave.protectedPrincipal(), 1 ether);
        assertEq(address(grave).balance, 1 ether);
        assertEq(neth.balanceOf(alice), 1_000_000 ether);
        assertEq(address(bad).balance, 0);
    }

    function test_scheduleSetsExecuteAfter14Days() public {
        uint256 expected = block.timestamp + 14 days;
        vm.expectEmit(true, true, false, true, address(grave));
        emit StrategyMigrationScheduled(address(0), address(adapter), expected);
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        (address pending, uint256 executeAfter) = grave.pendingStrategy();
        assertEq(pending, address(adapter));
        assertEq(executeAfter, expected);
    }

    function test_executeBeforeDelayRevertsAndAfterSucceeds() public {
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        (, uint256 executeAfter) = grave.pendingStrategy();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Grave.StrategyDelayNotElapsed.selector, executeAfter));
        grave.executeStrategyMigration();

        vm.warp(executeAfter);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
        (address pending,) = grave.pendingStrategy();
        assertEq(pending, address(0));
    }

    function test_firstAdapterStillWaits14Days() public {
        assertEq(grave.activeStrategy(), address(0));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        vm.warp(block.timestamp + 14 days - 1);
        vm.prank(admin);
        vm.expectRevert();
        grave.executeStrategyMigration();
        vm.warp(block.timestamp + 1);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
    }

    function test_secondScheduleWhilePendingRevertsAndCancelRestartsClock() public {
        TestInvestAdapter adapter2 = new TestInvestAdapter(address(grave));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        vm.prank(admin);
        vm.expectRevert(Grave.StrategyAlreadyPending.selector);
        grave.scheduleStrategy(address(adapter2));

        vm.expectEmit(true, true, false, true, address(grave));
        emit StrategyMigrationCancelled(address(0), address(adapter));
        vm.prank(admin);
        grave.cancelScheduledStrategy();
        (address pending,) = grave.pendingStrategy();
        assertEq(pending, address(0));

        uint256 t1 = block.timestamp;
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        (, uint256 executeAfter) = grave.pendingStrategy();
        assertEq(executeAfter, t1 + 14 days);
        vm.warp(t1 + 14 days - 1);
        vm.prank(admin);
        vm.expectRevert();
        grave.executeStrategyMigration();
    }

    function test_cancelRevertsWhenNonePending() public {
        vm.prank(admin);
        vm.expectRevert(Grave.NoPendingStrategy.selector);
        grave.cancelScheduledStrategy();
    }

    function test_scheduleRevertsZeroEoaAndSame() public {
        vm.prank(admin);
        vm.expectRevert(Grave.ZeroAddress.selector);
        grave.scheduleStrategy(address(0));
        vm.prank(admin);
        vm.expectRevert(Grave.NotContract.selector);
        grave.scheduleStrategy(alice);
        _activate(address(adapter));
        vm.prank(admin);
        vm.expectRevert(Grave.SameStrategy.selector);
        grave.scheduleStrategy(address(adapter));
    }

    function test_migrationRoutesOldToGraveToNewNotOwner() public {
        TestInvestAdapter adapter2 = new TestInvestAdapter(address(grave));
        _activate(address(adapter));
        _bury(alice, 3 ether);
        adapter.simulateProfit{value: 0.4 ether}();
        uint256 navBefore = grave.currentNAV();
        uint256 adminBefore = admin.balance;

        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        vm.warp(block.timestamp + 14 days);

        vm.expectEmit(true, true, false, true, address(grave));
        emit StrategyMigrated(address(adapter), address(adapter2), navBefore, navBefore);
        vm.prank(admin);
        grave.executeStrategyMigration();

        assertEq(grave.activeStrategy(), address(adapter2));
        assertEq(address(adapter).balance, 0);
        assertEq(adapter2.totalAssetsInETH(), navBefore);
        assertEq(address(grave).balance, 0);
        assertEq(admin.balance, adminBefore);
        assertEq(neth.balanceOf(admin), 0);
    }

    function test_navAfterMayBeBelowNavBefore() public {
        TestInvestAdapter adapter2 = new TestInvestAdapter(address(grave));
        _activate(address(adapter));
        _bury(alice, 2 ether);
        adapter.setReportedNav(10 ether);
        uint256 navBefore = grave.currentNAV();
        assertEq(navBefore, 10 ether);

        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertLt(grave.currentNAV(), navBefore);
        assertEq(grave.currentNAV(), 2 ether);
        assertEq(grave.protectedPrincipal(), 2 ether);
    }

    function test_revertingOldWithdrawContinuesAndOwnerUnchanged() public {
        RevertingWithdrawAdapter stuck = new RevertingWithdrawAdapter(address(grave));
        TestInvestAdapter next = new TestInvestAdapter(address(grave));
        _activate(address(stuck));
        _bury(alice, 2 ether);
        assertEq(address(stuck).balance, 2 ether);
        uint256 adminBefore = admin.balance;

        vm.prank(admin);
        grave.scheduleStrategy(address(next));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();

        assertEq(grave.activeStrategy(), address(next));
        assertEq(address(stuck).balance, 2 ether);
        assertEq(next.totalAssetsInETH(), 0);
        assertLt(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(admin.balance, adminBefore);
    }

    function test_executeUsesScheduledAddressNotAnother() public {
        TestInvestAdapter other = new TestInvestAdapter(address(grave));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
        assertTrue(grave.activeStrategy() != address(other));
    }

    function test_brokenNavAdapterCanBeMigratedAway() public {
        ToggleNavAdapter broken = new ToggleNavAdapter(address(grave));
        TestInvestAdapter next = new TestInvestAdapter(address(grave));
        _activate(address(broken));
        _bury(alice, 1 ether);
        vm.prank(bob);
        (bool ok,) = address(grave).call{value: 0.5 ether}("");
        assertTrue(ok);
        broken.setBroken(true);
        vm.expectRevert();
        grave.currentNAV();

        vm.prank(admin);
        grave.scheduleStrategy(address(next));
        vm.warp(block.timestamp + 14 days);
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(next));
        assertEq(admin.balance, adminBefore);
        assertEq(next.totalAssetsInETH(), 0.5 ether);
        assertEq(address(broken).balance, 1 ether);
    }

    function test_thiefAdapterDoesNotPayOwner() public {
        ThiefAdapter thief = new ThiefAdapter(address(grave), alice);
        _bury(bob, 2 ether);
        uint256 ownerBefore = admin.balance;
        uint256 aliceBefore = alice.balance;
        vm.prank(admin);
        grave.scheduleStrategy(address(thief));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(admin.balance, ownerBefore);
        assertEq(alice.balance, aliceBefore + 2 ether);
        assertEq(address(grave).balance, 0);
    }

    function test_adapterOnlyGraveAndUnderlyingZero() public {
        vm.expectRevert(TestInvestAdapter.NotGrave.selector);
        adapter.depositETH{value: 0}();
        vm.expectRevert(TestInvestAdapter.NotGrave.selector);
        adapter.withdrawETH(1, alice);
        assertEq(adapter.underlying(), address(0));
        assertEq(adapter.grave(), address(grave));
    }

    function test_adapterConstructorRejectsZero() public {
        vm.expectRevert(TestInvestAdapter.ZeroAddress.selector);
        new TestInvestAdapter(address(0));
    }

    function test_startAuctionWorksWithoutGravePause() public {
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("paused()"));
        vm.prank(bob);
        (bool ok,) = address(reaper).call{value: 1 ether}("");
        assertTrue(ok);
        uint256 id = reaper.startAuction();
        assertEq(id, 1);
        assertTrue(reaper.activeAuction().active);
    }

    function test_ownerCannotMintNeth() public {
        vm.prank(admin);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(admin, 1);
    }

    function test_yieldScenario0Pct() public {
        _runYieldScenario(10 ether, 0, 1000);
    }

    function test_yieldScenario1Pct() public {
        _runYieldScenario(10 ether, 10, 1000);
    }

    function test_yieldScenario1_5Pct() public {
        _runYieldScenario(10 ether, 15, 1000);
    }

    function test_yieldScenario2_2Pct() public {
        _runYieldScenario(10 ether, 22, 1000);
    }

    function test_yieldScenario3Pct() public {
        _runYieldScenario(10 ether, 30, 1000);
    }

    function _runYieldScenario(uint256 principal, uint256 yieldNum, uint256 yieldDen) internal {
        _activate(address(adapter));
        uint256 mintedBefore = grave.totalNethMinted();
        _bury(alice, principal);
        uint256 minted = grave.totalNethMinted();
        uint256 profit = principal * yieldNum / yieldDen;
        uint256 harvestedBefore = reaper.totalHarvestedETH();
        if (profit > 0) {
            adapter.simulateProfit{value: profit}();
            uint256 harvested = grave.harvest();
            assertEq(harvested, profit);
            assertEq(reaper.totalHarvestedETH(), harvestedBefore + profit);
        } else {
            vm.expectRevert(Grave.NoHarvestableYield.selector);
            grave.harvest();
            assertEq(reaper.totalHarvestedETH(), harvestedBefore);
        }
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
        assertEq(minted, mintedBefore + 10_000_000 ether);
        assertLe(reaper.totalHarvestedETH() - harvestedBefore, grave.currentNAV() + profit);
        if (profit > 0) {
            assertEq(grave.currentNAV(), principal);
        }
    }
}
