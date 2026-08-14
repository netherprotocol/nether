// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";

contract ReaperFuzzTest is Test {
    uint256 internal constant DURATION = 7 days;
    uint256 internal constant WAD = 1 ether;

    address internal setter;
    address internal alice;
    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;

    function setUp() public {
        setter = makeAddr("setter");
        alice = makeAddr("alice");
        neth = new NETH(setter);
        grave = new Grave(address(neth), makeAddr("admin"));
        vm.prank(setter);
        neth.setGrave(address(grave));
        reaper = new Reaper(address(neth), address(grave));
        vm.deal(alice, type(uint128).max);
    }

    function _donate(uint256 amount) internal {
        vm.prank(alice);
        (bool ok,) = address(reaper).call{value: amount}("");
        assertTrue(ok);
    }

    function _bury(uint256 amount) internal {
        vm.prank(alice);
        grave.bury{value: amount}(0);
        vm.prank(alice);
        neth.approve(address(reaper), type(uint256).max);
    }

    function _rate(uint256 r, uint256 elapsed) internal pure returns (uint256) {
        if (elapsed > DURATION) {
            elapsed = DURATION;
        }
        return Math.mulDiv(r, 200 * DURATION - 95 * elapsed, 100 * DURATION);
    }

    function testFuzz_reaperNeverSpendsGravePrincipal(uint256 buryAmt, uint256 donateAmt, uint256 nethIn) public {
        buryAmt = bound(buryAmt, 1 ether, 20 ether);
        donateAmt = bound(donateAmt, 1, 20 ether);
        _bury(buryAmt);
        uint256 principal = grave.protectedPrincipal();
        uint256 graveEth = address(grave).balance;
        _donate(donateAmt);
        reaper.startAuction();
        nethIn = bound(nethIn, 2_000_000, neth.balanceOf(alice));
        vm.prank(alice);
        try reaper.sellToReaper(nethIn, 0) {} catch {}
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(address(grave).balance, graveEth);
    }

    function testFuzz_acquiredNethNeverRemains(uint256 buryAmt, uint256 donateAmt, uint256 nethIn) public {
        buryAmt = bound(buryAmt, 1 ether, 10 ether);
        donateAmt = bound(donateAmt, 1, 5 ether);
        _bury(buryAmt);
        _donate(donateAmt);
        reaper.startAuction();
        nethIn = bound(nethIn, 2_000_000, neth.balanceOf(alice));
        uint256 reapedBefore = reaper.totalNethReaped();
        uint256 supplyBefore = neth.totalSupply();
        vm.prank(alice);
        try reaper.sellToReaper(nethIn, 0) returns (uint256) {
            assertEq(neth.balanceOf(address(reaper)), 0);
            assertGt(reaper.totalNethReaped(), reapedBefore);
            assertLt(neth.totalSupply(), supplyBefore);
        } catch {
            assertEq(neth.balanceOf(address(reaper)), 0);
            assertEq(reaper.totalNethReaped(), reapedBefore);
        }
    }

    function testFuzz_rateMonotonicSellerFavorable(uint256 donateAmt, uint256 t1, uint256 t2) public {
        donateAmt = bound(donateAmt, 1, 10 ether);
        _donate(donateAmt);
        reaper.startAuction();
        t1 = bound(t1, 0, DURATION);
        t2 = bound(t2, t1, DURATION);
        uint256 start = reaper.activeAuction().startTime;
        vm.warp(start + t1);
        uint256 r1 = reaper.currentReaperRate();
        vm.warp(start + t2);
        uint256 r2 = reaper.currentReaperRate();
        assertLe(r2, r1);
        uint256 snap = reaper.activeAuction().snapshottedRewardRate;
        assertGe(r1, _rate(snap, DURATION));
        assertGe(r2, _rate(snap, DURATION));
        assertLe(r1, 2 * snap);
        assertLe(r2, 2 * snap);
    }

    function testFuzz_rateNeverBelowEndMultiplier(uint256 donateAmt, uint256 elapsed) public {
        donateAmt = bound(donateAmt, 1, 10 ether);
        _donate(donateAmt);
        reaper.startAuction();
        elapsed = bound(elapsed, 0, DURATION + 3 days);
        vm.warp(reaper.activeAuction().startTime + elapsed);
        uint256 snap = reaper.activeAuction().snapshottedRewardRate;
        uint256 rate = reaper.currentReaperRate();
        assertGe(rate, Math.mulDiv(snap, 105, 100));
        assertLe(rate, 2 * snap);
    }

    function testFuzz_onlyOneActiveAuction(uint256 a, uint256 b) public {
        a = bound(a, 1, 5 ether);
        b = bound(b, 1, 5 ether);
        _donate(a);
        reaper.startAuction();
        _donate(b);
        vm.expectRevert(Reaper.AuctionActive.selector);
        reaper.startAuction();
        assertTrue(reaper.activeAuction().active);
        uint256 allocated = reaper.availableReaperETH() + reaper.activeAuction().ethRemaining;
        assertLe(allocated, address(reaper).balance);
    }

    function testFuzz_accountingLeBalance(uint256 donateAmt, uint256 extra) public {
        donateAmt = bound(donateAmt, 1, 10 ether);
        extra = bound(extra, 0, 10 ether);
        _donate(donateAmt);
        reaper.startAuction();
        if (extra > 0) {
            _donate(extra);
        }
        uint256 remaining = reaper.activeAuction().ethRemaining;
        assertLe(reaper.availableReaperETH() + remaining, address(reaper).balance);
    }

    function testFuzz_holderBurnDoesNotIncreaseReaped(uint256 buryAmt, uint256 burned) public {
        buryAmt = bound(buryAmt, 1, 10 ether);
        _bury(buryAmt);
        uint256 bal = neth.balanceOf(alice);
        burned = bound(burned, 0, bal);
        vm.prank(alice);
        neth.burn(burned);
        assertEq(reaper.totalNethReaped(), 0);
    }

    function testFuzz_startAuctionAnyPositiveAvailable(uint256 amount) public {
        amount = bound(amount, 1, 100 ether);
        _donate(amount);
        uint256 id = reaper.startAuction();
        assertEq(id, 1);
        assertTrue(reaper.activeAuction().active);
        assertEq(reaper.activeAuction().ethBudget, amount);
        assertEq(reaper.availableReaperETH(), 0);
    }

    function testFuzz_quoteEqualsSell(uint256 buryAmt, uint256 donateAmt, uint256 nethIn, uint256 elapsed) public {
        buryAmt = bound(buryAmt, 1 ether, 10 ether);
        donateAmt = bound(donateAmt, 1, 5 ether);
        elapsed = bound(elapsed, 0, DURATION - 1);
        _bury(buryAmt);
        _donate(donateAmt);
        reaper.startAuction();
        vm.warp(reaper.activeAuction().startTime + elapsed);
        uint256 bal = neth.balanceOf(alice);
        nethIn = bound(nethIn, 2_000_000, bal);
        uint256 quote = reaper.quoteReaperSale(nethIn);
        vm.prank(alice);
        uint256 out = reaper.sellToReaper(nethIn, 0);
        assertEq(out, quote);
        assertEq(neth.balanceOf(address(reaper)), 0);
    }

    function testFuzz_eraChangeDoesNotChangeSnapshot(uint256 donateAmt, uint256 extraBury) public {
        donateAmt = bound(donateAmt, 1, 5 ether);
        extraBury = bound(extraBury, 10 ether, 40 ether);
        _donate(donateAmt);
        reaper.startAuction();
        uint256 snap = reaper.activeAuction().snapshottedRewardRate;
        uint256 rate = reaper.currentReaperRate();
        _bury(extraBury);
        assertEq(reaper.activeAuction().snapshottedRewardRate, snap);
        assertEq(reaper.currentReaperRate(), rate);
    }

    function testFuzz_donatedEthNeverMintsOrDecreasesPrincipal(uint256 buryAmt, uint256 donateAmt) public {
        buryAmt = bound(buryAmt, 1, 10 ether);
        donateAmt = bound(donateAmt, 1, 10 ether);
        _bury(buryAmt);
        uint256 principal = grave.protectedPrincipal();
        uint256 minted = grave.totalNethMinted();
        uint256 supply = neth.totalSupply();
        _donate(donateAmt);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
        assertEq(neth.totalSupply(), supply);
        assertEq(reaper.totalDonatedETH(), donateAmt);
        assertEq(reaper.totalHarvestedETH(), 0);
    }

    function testFuzz_noAdminPathCanMint(address caller, uint256 amount) public {
        vm.assume(caller != address(grave));
        amount = bound(amount, 0, type(uint128).max);
        uint256 supply = neth.totalSupply();
        vm.prank(caller);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, amount);
        assertEq(neth.totalSupply(), supply);
    }
}
