// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";

contract ReaperHandler is Test {
    uint256 internal constant DURATION = 7 days;

    Grave public grave;
    NETH public neth;
    Reaper public reaper;
    address[] public actors;

    uint256 public ghostProtected;
    uint256 public ghostReaped;
    uint256 public ghostDonated;

    constructor(Grave grave_, NETH neth_, Reaper reaper_, address[] memory actors_) {
        grave = grave_;
        neth = neth_;
        reaper = reaper_;
        actors = actors_;
    }

    function bury(uint256 actorSeed, uint256 amount) public {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 0, 50 ether);
        uint256 principalBefore = grave.protectedPrincipal();
        vm.deal(actor, actor.balance + amount);
        vm.prank(actor);
        try grave.bury{value: amount}(0) returns (uint256) {
            ghostProtected += amount;
            assertEq(grave.protectedPrincipal(), principalBefore + amount);
        } catch {
            assertEq(grave.protectedPrincipal(), principalBefore);
        }
    }

    function donate(uint256 amount) public {
        amount = bound(amount, 0, 5 ether);
        uint256 principal = grave.protectedPrincipal();
        uint256 donatedBefore = reaper.totalDonatedETH();
        vm.deal(address(this), amount);
        (bool ok,) = address(reaper).call{value: amount}("");
        if (ok && amount > 0) {
            ghostDonated += amount;
            assertEq(reaper.totalDonatedETH(), donatedBefore + amount);
        }
        assertEq(grave.protectedPrincipal(), principal);
    }

    function startAuction() public {
        try reaper.startAuction() {
            assertTrue(reaper.activeAuction().active);
        } catch {}
    }

    function sellToReaper(uint256 actorSeed, uint256 nethIn) public {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = neth.balanceOf(actor);
        if (bal == 0) {
            return;
        }
        nethIn = bound(nethIn, 0, bal);
        uint256 reapedBefore = reaper.totalNethReaped();
        uint256 graveEth = address(grave).balance;
        uint256 principal = grave.protectedPrincipal();
        vm.prank(actor);
        neth.approve(address(reaper), nethIn);
        vm.prank(actor);
        try reaper.sellToReaper(nethIn, 0) returns (uint256) {
            uint256 reaped = reaper.totalNethReaped() - reapedBefore;
            ghostReaped += reaped;
            assertEq(neth.balanceOf(address(reaper)), 0);
            assertEq(address(grave).balance, graveEth);
            assertEq(grave.protectedPrincipal(), principal);
        } catch {
            assertEq(reaper.totalNethReaped(), reapedBefore);
            assertEq(neth.balanceOf(address(reaper)), 0);
        }
    }

    function finalizeAuction(uint256 warpSeed) public {
        Reaper.Auction memory auction = reaper.activeAuction();
        if (auction.active && block.timestamp < auction.endTime) {
            uint256 extra = bound(warpSeed, 0, 3 days);
            vm.warp(auction.endTime + extra);
        }
        try reaper.finalizeAuction() {
            assertFalse(reaper.activeAuction().active);
        } catch {}
    }

    function collectSurplus(uint256 extra) public {
        extra = bound(extra, 0, 1 ether);
        if (extra > 0) {
            vm.deal(address(reaper), address(reaper).balance + extra);
        }
        uint256 donatedBefore = reaper.totalDonatedETH();
        uint256 amount = reaper.collectSurplus();
        if (amount > 0) {
            ghostDonated += amount;
            assertEq(reaper.totalDonatedETH(), donatedBefore + amount);
        }
    }

    function transferNeth(uint256 fromSeed, uint256 toSeed, uint256 amount) public {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 bal = neth.balanceOf(from);
        if (bal == 0 || to == address(0)) {
            return;
        }
        amount = bound(amount, 0, bal);
        uint256 reaped = reaper.totalNethReaped();
        vm.prank(from);
        assertTrue(neth.transfer(to, amount));
        assertEq(reaper.totalNethReaped(), reaped);
    }

    function burnNeth(uint256 actorSeed, uint256 amount) public {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = neth.balanceOf(actor);
        if (bal == 0) {
            return;
        }
        amount = bound(amount, 0, bal);
        uint256 reaped = reaper.totalNethReaped();
        vm.prank(actor);
        neth.burn(amount);
        assertEq(reaper.totalNethReaped(), reaped);
    }

    function warpTime(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, 8 days);
        vm.warp(block.timestamp + elapsed);
    }

    receive() external payable {}
}

contract ReaperInvariantTest is Test {
    ReaperHandler internal handler;
    Grave internal grave;
    NETH internal neth;
    Reaper internal reaper;

    function setUp() public {
        address setter = makeAddr("setter");
        neth = new NETH(setter);
        grave = new Grave(address(neth));
        vm.prank(setter);
        neth.setGrave(address(grave));
        reaper = new Reaper(address(neth), address(grave));

        address[] memory actors = new address[](3);
        actors[0] = makeAddr("alice");
        actors[1] = makeAddr("bob");
        actors[2] = makeAddr("carol");
        handler = new ReaperHandler(grave, neth, reaper, actors);

        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = ReaperHandler.bury.selector;
        selectors[1] = ReaperHandler.donate.selector;
        selectors[2] = ReaperHandler.startAuction.selector;
        selectors[3] = ReaperHandler.sellToReaper.selector;
        selectors[4] = ReaperHandler.finalizeAuction.selector;
        selectors[5] = ReaperHandler.collectSurplus.selector;
        selectors[6] = ReaperHandler.transferNeth.selector;
        selectors[7] = ReaperHandler.burnNeth.selector;
        selectors[8] = ReaperHandler.warpTime.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_protectedPrincipalEqualsGhost() public view {
        assertEq(grave.protectedPrincipal(), handler.ghostProtected());
    }

    function invariant_totalReapedEqualsGhost() public view {
        assertEq(reaper.totalNethReaped(), handler.ghostReaped());
    }

    function invariant_reaperHoldsNoNeth() public view {
        assertEq(neth.balanceOf(address(reaper)), 0);
    }

    function invariant_accountingLeBalance() public view {
        uint256 remaining = reaper.activeAuction().active ? reaper.activeAuction().ethRemaining : 0;
        assertLe(reaper.availableReaperETH() + remaining, address(reaper).balance);
    }

    function invariant_rateBoundsWhenActive() public view {
        Reaper.Auction memory auction = reaper.activeAuction();
        if (!auction.active) {
            assertEq(reaper.currentReaperRate(), 0);
            return;
        }
        uint256 rate = reaper.currentReaperRate();
        uint256 r = auction.snapshottedRewardRate;
        assertLe(rate, 2 * r);
        assertGe(rate, Math.mulDiv(r, 105, 100));
    }

    function invariant_donatedEthNeverMints() public view {
        assertLe(neth.totalSupply(), grave.totalNethMinted());
        assertEq(grave.protectedPrincipal(), handler.ghostProtected());
    }

    function invariant_noAdminMint() public view {
        assertEq(neth.grave(), address(grave));
        assertEq(neth.graveSetter(), address(0));
    }
}
