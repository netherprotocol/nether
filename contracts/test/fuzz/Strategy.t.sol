// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {TestInvestAdapter} from "test/mocks/TestInvestAdapter.sol";

contract StrategyFuzzTest is Test {
    address internal setter;
    address internal admin;
    address internal alice;
    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;
    TestInvestAdapter internal adapter;
    TestInvestAdapter internal adapter2;

    function setUp() public {
        setter = makeAddr("setter");
        admin = makeAddr("admin");
        alice = makeAddr("alice");
        neth = new NETH(setter);
        grave = new Grave(address(neth), admin);
        vm.prank(setter);
        neth.setGrave(address(grave));
        reaper = new Reaper(address(neth), address(grave));
        vm.prank(admin);
        grave.setReaper(address(reaper));
        adapter = new TestInvestAdapter(address(grave));
        adapter2 = new TestInvestAdapter(address(grave));
        vm.deal(alice, type(uint128).max);
        vm.deal(admin, 1 ether);
    }

    function _activate(address strategy) internal {
        vm.prank(admin);
        grave.scheduleStrategy(strategy);
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
    }

    function testFuzz_protectedPrincipalNeverDecreasesOnHarvest(uint256 amount, uint256 profit) public {
        amount = bound(amount, 1, 50 ether);
        profit = bound(profit, 0, 10 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: amount}(0);
        uint256 principal = grave.protectedPrincipal();
        if (profit > 0) {
            adapter.simulateProfit{value: profit}();
        }
        try grave.harvest() {
            assertEq(grave.protectedPrincipal(), principal);
        } catch {
            assertEq(grave.protectedPrincipal(), principal);
        }
    }

    function testFuzz_harvestNeverSendsRequiredIdle(uint256 amount, uint256 donation, uint256 profit) public {
        amount = bound(amount, 1, 30 ether);
        donation = bound(donation, 0, 20 ether);
        profit = bound(profit, 0, 5 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: amount}(0);
        if (donation > 0) {
            vm.prank(alice);
            (bool ok,) = address(grave).call{value: donation}("");
            assertTrue(ok);
        }
        if (profit > 0) {
            adapter.simulateProfit{value: profit}();
        }
        uint256 idleBefore = address(grave).balance;
        uint256 principal = grave.protectedPrincipal();
        uint256 req = grave.requiredBacking();
        uint256 reserved = idleBefore < req ? idleBefore : req;
        try grave.harvest() returns (uint256 ethHarvested) {
            assertEq(grave.protectedPrincipal(), principal);
            assertEq(address(grave).balance, reserved);
            assertGe(grave.currentNAV(), req);
            assertGt(ethHarvested, 0);
        } catch {
            assertEq(address(grave).balance, idleBefore);
            assertEq(grave.protectedPrincipal(), principal);
        }
    }

    function testFuzz_harvestDoesNotHonorNavLie(uint256 lie, uint256 realizable, uint256 donation) public {
        lie = bound(lie, 0, 1000 ether);
        realizable = bound(realizable, 0, 20 ether);
        donation = bound(donation, 0, 20 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: 5 ether}(0);
        adapter.setReportedNav(lie);
        adapter.setRealizable(realizable);
        if (donation > 0) {
            vm.prank(alice);
            (bool ok,) = address(grave).call{value: donation}("");
            assertTrue(ok);
        }
        uint256 idleBefore = address(grave).balance;
        uint256 principal = grave.protectedPrincipal();
        uint256 req = grave.requiredBacking();
        uint256 reserved = idleBefore < req ? idleBefore : req;
        uint256 adminBefore = admin.balance;
        try grave.harvest() returns (uint256 ethHarvested) {
            assertEq(grave.protectedPrincipal(), principal);
            assertEq(address(grave).balance, reserved);
            assertEq(admin.balance, adminBefore);
            uint256 idleSurplus = idleBefore > req ? idleBefore - req : 0;
            uint256 adapterPaid = ethHarvested - idleSurplus;
            assertLe(adapterPaid, realizable);
            assertLe(ethHarvested, idleSurplus + realizable);
        } catch {
            assertEq(grave.protectedPrincipal(), principal);
            assertEq(admin.balance, adminBefore);
        }
        adapter.setReportedNav(type(uint256).max);
        adapter.setRealizable(type(uint256).max);
    }

    function testFuzz_cannotExecuteBeforeDelay(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 14 days - 1);
        _activate(address(adapter));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        (, uint256 executeAfter) = grave.pendingStrategy();
        vm.warp(block.timestamp + elapsed);
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Grave.StrategyDelayNotElapsed.selector, executeAfter));
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
        assertEq(admin.balance, adminBefore);
    }

    function testFuzz_firstAdapterExecutesImmediately(uint256 extraWarp) public {
        extraWarp = bound(extraWarp, 0, 14 days - 1);
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        (address scheduled,) = grave.pendingStrategy();
        vm.warp(block.timestamp + extraWarp);
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), scheduled);
        assertEq(grave.activeStrategy(), address(adapter));
        assertEq(admin.balance, adminBefore);
        (address pending,) = grave.pendingStrategy();
        assertEq(pending, address(0));
    }

    function testFuzz_executedAdapterEqualsScheduled(uint256 extraWarp) public {
        extraWarp = bound(extraWarp, 0, 30 days);
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        (address scheduled,) = grave.pendingStrategy();
        vm.warp(block.timestamp + 14 days + extraWarp);
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), scheduled);
        assertEq(grave.activeStrategy(), address(adapter));
        assertTrue(grave.activeStrategy() != address(adapter2));
        assertEq(admin.balance, adminBefore);
        (address pending,) = grave.pendingStrategy();
        assertEq(pending, address(0));
    }

    function testFuzz_onlyOneActiveStrategy(uint256 amount) public {
        amount = bound(amount, 1, 10 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: amount}(0);
        assertEq(grave.activeStrategy(), address(adapter));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        assertEq(grave.activeStrategy(), address(adapter));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter2));
        assertTrue(grave.activeStrategy() != address(adapter));
    }

    function testFuzz_ownerCannotMint(uint256 amount) public {
        amount = bound(amount, 0, type(uint128).max);
        uint256 supply = neth.totalSupply();
        vm.prank(admin);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(admin, amount);
        assertEq(neth.totalSupply(), supply);
    }

    function testFuzz_migrationDoesNotPayOwner(uint256 amount, uint256 profit) public {
        amount = bound(amount, 1, 20 ether);
        profit = bound(profit, 0, 5 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: amount}(0);
        if (profit > 0) {
            adapter.simulateProfit{value: profit}();
        }
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(admin.balance, adminBefore);
        assertEq(grave.activeStrategy(), address(adapter2));
        assertEq(neth.balanceOf(admin), 0);
    }

    function testFuzz_quoteBuryEqualsBuryWithAdapter(uint256 amount) public {
        amount = bound(amount, 1, 40 ether);
        _activate(address(adapter));
        uint256 quote = grave.quoteBury(amount);
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: amount}(0);
        assertEq(nethOut, quote);
        assertGt(nethOut, 0);
    }

    function testFuzz_eraRateNeverIncreases(uint256 amount) public {
        amount = bound(amount, 1, 200 ether);
        _activate(address(adapter));
        uint256 rateBefore = grave.currentRewardRate();
        vm.prank(alice);
        grave.bury{value: amount}(0);
        assertLe(grave.currentRewardRate(), rateBefore);
    }

    function testFuzz_donationNeverMintsOrRaisesPrincipal(uint256 amount) public {
        amount = bound(amount, 1, 50 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        uint256 principal = grave.protectedPrincipal();
        uint256 minted = grave.totalNethMinted();
        vm.prank(alice);
        (bool ok,) = address(grave).call{value: amount}("");
        assertTrue(ok);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
    }

    function testFuzz_reaperCannotSpendGravePrincipal(uint256 amount, uint256 profit) public {
        amount = bound(amount, 1, 15 ether);
        profit = bound(profit, 1, 3 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: amount}(0);
        adapter.simulateProfit{value: profit}();
        uint256 principal = grave.protectedPrincipal();
        grave.harvest();
        uint256 nethIn = neth.balanceOf(alice);
        vm.prank(alice);
        neth.approve(address(reaper), nethIn);
        reaper.startAuction();
        vm.prank(alice);
        try reaper.sellToReaper(nethIn, 0) {} catch {}
        assertEq(grave.protectedPrincipal(), principal);
        assertGe(grave.currentNAV(), grave.requiredBacking());
    }

    function testFuzz_recoverDoesNotPayOwner(uint256 amount) public {
        amount = bound(amount, 1, 10 ether);
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: amount}(0);
        adapter.setWithdrawRevert(true);
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter2));
        vm.warp(block.timestamp + 14 days);
        for (uint256 i; i < 3; ++i) {
            if (i > 0) {
                vm.warp(grave.lastMigrationFailureTime() + 1 days);
            }
            vm.prank(admin);
            grave.executeStrategyMigration();
        }
        assertEq(grave.impairedOwed(address(adapter)), amount);
        adapter.setWithdrawRevert(false);
        uint256 adminBefore = admin.balance;
        uint256 impairedBefore = grave.impairedCapital();
        grave.recoverImpaired(address(adapter));
        assertEq(admin.balance, adminBefore);
        assertEq(grave.impairedCapital(), 0);
        assertLt(grave.impairedCapital(), impairedBefore);
        assertEq(grave.impairedAdapterCount(), 0);
        assertEq(neth.balanceOf(admin), 0);
    }

    function testFuzz_nonOwnerScheduleReverts(address caller) public {
        vm.assume(caller != admin);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        grave.scheduleStrategy(address(adapter));
    }
}
