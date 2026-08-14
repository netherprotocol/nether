// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {TestInvestAdapter} from "test/mocks/TestInvestAdapter.sol";

contract StrategyHandler is Test {
    Grave public grave;
    NETH public neth;
    Reaper public reaper;
    TestInvestAdapter public adapterA;
    TestInvestAdapter public adapterB;
    address public admin;
    address[] public actors;

    uint256 public ghostProtected;
    uint256 public ghostMinted;

    constructor(
        Grave grave_,
        NETH neth_,
        Reaper reaper_,
        TestInvestAdapter adapterA_,
        TestInvestAdapter adapterB_,
        address admin_,
        address[] memory actors_
    ) {
        grave = grave_;
        neth = neth_;
        reaper = reaper_;
        adapterA = adapterA_;
        adapterB = adapterB_;
        admin = admin_;
        actors = actors_;
    }

    function _activeAdapter() internal view returns (TestInvestAdapter) {
        address active = grave.activeStrategy();
        if (active == address(adapterA)) {
            return adapterA;
        }
        if (active == address(adapterB)) {
            return adapterB;
        }
        return TestInvestAdapter(address(0));
    }

    function bury(uint256 actorSeed, uint256 amount) public {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 0, 40 ether);
        uint256 principalBefore = grave.protectedPrincipal();
        vm.deal(actor, actor.balance + amount);
        vm.prank(actor);
        try grave.bury{value: amount}(0) returns (uint256 nethOut) {
            ghostProtected += amount;
            ghostMinted += nethOut;
            assertEq(grave.protectedPrincipal(), principalBefore + amount);
        } catch {
            assertEq(grave.protectedPrincipal(), principalBefore);
        }
    }

    function donateGrave(uint256 amount) public {
        amount = bound(amount, 0, 10 ether);
        uint256 principal = grave.protectedPrincipal();
        uint256 minted = grave.totalNethMinted();
        vm.deal(address(this), amount);
        (bool ok,) = address(grave).call{value: amount}("");
        ok;
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
    }

    function donateReaper(uint256 amount) public {
        amount = bound(amount, 0, 5 ether);
        uint256 principal = grave.protectedPrincipal();
        vm.deal(address(this), amount);
        (bool ok,) = address(reaper).call{value: amount}("");
        ok;
        assertEq(grave.protectedPrincipal(), principal);
    }

    function harvest() public {
        uint256 principal = grave.protectedPrincipal();
        uint256 adminBefore = admin.balance;
        uint256 idleBefore = address(grave).balance;
        uint256 reserved = idleBefore < principal ? idleBefore : principal;
        try grave.harvest() {
            assertEq(grave.protectedPrincipal(), principal);
            assertEq(admin.balance, adminBefore);
            assertEq(address(grave).balance, reserved);
        } catch {
            assertEq(grave.protectedPrincipal(), principal);
            assertEq(admin.balance, adminBefore);
        }
    }

    function startAuction() public {
        uint256 principal = grave.protectedPrincipal();
        try reaper.startAuction() {
            assertTrue(reaper.activeAuction().active);
        } catch {}
        assertEq(grave.protectedPrincipal(), principal);
    }

    function sellToReaper(uint256 actorSeed, uint256 nethIn) public {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = neth.balanceOf(actor);
        if (bal == 0) {
            return;
        }
        nethIn = bound(nethIn, 0, bal);
        uint256 principal = grave.protectedPrincipal();
        uint256 graveEth = address(grave).balance;
        vm.prank(actor);
        neth.approve(address(reaper), nethIn);
        vm.prank(actor);
        try reaper.sellToReaper(nethIn, 0) {
            assertEq(neth.balanceOf(address(reaper)), 0);
            assertEq(address(grave).balance, graveEth);
            assertEq(grave.protectedPrincipal(), principal);
        } catch {
            assertEq(neth.balanceOf(address(reaper)), 0);
            assertEq(grave.protectedPrincipal(), principal);
        }
    }

    function finalizeAuction(uint256 warpSeed) public {
        Reaper.Auction memory auction = reaper.activeAuction();
        if (auction.active && block.timestamp < auction.endTime) {
            vm.warp(auction.endTime + bound(warpSeed, 0, 1 days));
        }
        try reaper.finalizeAuction() {
            assertFalse(reaper.activeAuction().active);
        } catch {}
    }

    function scheduleStrategy() public {
        address current = grave.activeStrategy();
        address next = current == address(adapterA) ? address(adapterB) : address(adapterA);
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        try grave.scheduleStrategy(next) {} catch {}
        assertEq(admin.balance, adminBefore);
    }

    function cancelScheduledStrategy() public {
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        try grave.cancelScheduledStrategy() {} catch {}
        assertEq(admin.balance, adminBefore);
    }

    function executeStrategyMigration(uint256 warpSeed) public {
        (, uint256 executeAfter) = grave.pendingStrategy();
        if (executeAfter == 0) {
            return;
        }
        uint256 extra = bound(warpSeed, 0, 2 days);
        if (block.timestamp < executeAfter + extra) {
            vm.warp(executeAfter + extra);
        }
        uint256 adminBefore = admin.balance;
        uint256 principal = grave.protectedPrincipal();
        vm.prank(admin);
        try grave.executeStrategyMigration() {
            address active = grave.activeStrategy();
            assertTrue(active == address(adapterA) || active == address(adapterB));
            (address pending,) = grave.pendingStrategy();
            assertEq(pending, address(0));
        } catch {}
        assertEq(admin.balance, adminBefore);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(neth.balanceOf(admin), 0);
    }

    function simulateProfit(uint256 amount) public {
        TestInvestAdapter a = _activeAdapter();
        if (address(a) == address(0)) {
            return;
        }
        amount = bound(amount, 0, 5 ether);
        vm.deal(address(this), amount);
        a.simulateProfit{value: amount}();
    }

    function simulateLoss(uint256 amount) public {
        TestInvestAdapter a = _activeAdapter();
        if (address(a) == address(0)) {
            return;
        }
        uint256 bal = address(a).balance;
        if (bal == 0) {
            return;
        }
        amount = bound(amount, 0, bal);
        if (amount == 0) {
            return;
        }
        a.simulateLoss(amount);
    }

    function setReportedNav(uint256 nav, bool honest) public {
        TestInvestAdapter a = _activeAdapter();
        if (address(a) == address(0)) {
            return;
        }
        if (honest) {
            a.setReportedNav(type(uint256).max);
            a.setRealizable(type(uint256).max);
            return;
        }
        nav = bound(nav, 0, 1_000_000 ether);
        a.setReportedNav(nav);
    }

    function transferNeth(uint256 fromSeed, uint256 toSeed, uint256 amount) public {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 bal = neth.balanceOf(from);
        if (bal == 0 || to == address(0)) {
            return;
        }
        amount = bound(amount, 0, bal);
        vm.prank(from);
        assertTrue(neth.transfer(to, amount));
    }

    function burnNeth(uint256 actorSeed, uint256 amount) public {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = neth.balanceOf(actor);
        if (bal == 0) {
            return;
        }
        amount = bound(amount, 0, bal);
        vm.prank(actor);
        neth.burn(amount);
        assertLe(neth.totalSupply(), grave.totalNethMinted());
    }

    function warpTime(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 3 days);
        vm.warp(block.timestamp + elapsed);
    }

    receive() external payable {}
}

contract StrategyInvariantTest is Test {
    StrategyHandler internal handler;
    Grave internal grave;
    NETH internal neth;
    Reaper internal reaper;
    TestInvestAdapter internal adapterA;
    TestInvestAdapter internal adapterB;
    address internal admin;

    function setUp() public {
        address setter = makeAddr("setter");
        admin = makeAddr("admin");
        neth = new NETH(setter);
        grave = new Grave(address(neth), admin);
        vm.prank(setter);
        neth.setGrave(address(grave));
        reaper = new Reaper(address(neth), address(grave));
        vm.prank(admin);
        grave.setReaper(address(reaper));
        adapterA = new TestInvestAdapter(address(grave));
        adapterB = new TestInvestAdapter(address(grave));

        address[] memory actors = new address[](3);
        actors[0] = makeAddr("alice");
        actors[1] = makeAddr("bob");
        actors[2] = makeAddr("carol");
        handler = new StrategyHandler(grave, neth, reaper, adapterA, adapterB, admin, actors);

        bytes4[] memory selectors = new bytes4[](16);
        selectors[0] = StrategyHandler.bury.selector;
        selectors[1] = StrategyHandler.donateGrave.selector;
        selectors[2] = StrategyHandler.donateReaper.selector;
        selectors[3] = StrategyHandler.harvest.selector;
        selectors[4] = StrategyHandler.startAuction.selector;
        selectors[5] = StrategyHandler.sellToReaper.selector;
        selectors[6] = StrategyHandler.finalizeAuction.selector;
        selectors[7] = StrategyHandler.scheduleStrategy.selector;
        selectors[8] = StrategyHandler.cancelScheduledStrategy.selector;
        selectors[9] = StrategyHandler.executeStrategyMigration.selector;
        selectors[10] = StrategyHandler.simulateProfit.selector;
        selectors[11] = StrategyHandler.simulateLoss.selector;
        selectors[12] = StrategyHandler.setReportedNav.selector;
        selectors[13] = StrategyHandler.transferNeth.selector;
        selectors[14] = StrategyHandler.burnNeth.selector;
        selectors[15] = StrategyHandler.warpTime.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_protectedPrincipalEqualsGhost() public view {
        assertEq(grave.protectedPrincipal(), handler.ghostProtected());
    }

    function invariant_totalMintedEqualsGhost() public view {
        assertEq(grave.totalNethMinted(), handler.ghostMinted());
    }

    function invariant_supplyLeMinted() public view {
        assertLe(neth.totalSupply(), grave.totalNethMinted());
    }

    function invariant_reaperHoldsNoNeth() public view {
        assertEq(neth.balanceOf(address(reaper)), 0);
    }

    function invariant_singleActiveStrategy() public view {
        address active = grave.activeStrategy();
        assertTrue(active == address(0) || active == address(adapterA) || active == address(adapterB));
    }

    function invariant_ownerUnpaid() public view {
        assertEq(admin.balance, 0);
        assertEq(neth.balanceOf(admin), 0);
        assertEq(grave.owner(), admin);
    }

    function invariant_eraRateNeverIncreasesFromGenesis() public view {
        assertLe(grave.currentRewardRate(), 1_000_000 ether);
        assertGe(grave.currentEraCapacity(), 10 ether);
    }

    function invariant_noPause() public {
        (bool ok,) = address(grave).call(abi.encodeWithSignature("paused()"));
        assertFalse(ok);
        (ok,) = address(reaper).call(abi.encodeWithSignature("pause()"));
        assertFalse(ok);
    }
}
