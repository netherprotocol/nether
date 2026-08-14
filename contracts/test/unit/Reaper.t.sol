// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";

contract ReenteringSeller {
    Reaper public reaper;
    NETH public neth;
    uint256 public mode;

    function set(Reaper reaper_, NETH neth_) external {
        reaper = reaper_;
        neth = neth_;
    }

    function setMode(uint256 mode_) external {
        mode = mode_;
    }

    function approveAll() external {
        neth.approve(address(reaper), type(uint256).max);
    }

    receive() external payable {
        if (mode == 1) {
            mode = 0;
            reaper.sellToReaper(1, 0);
        } else if (mode == 2) {
            mode = 0;
            reaper.startAuction();
        } else if (mode == 3) {
            mode = 0;
            reaper.finalizeAuction();
        }
    }
}

contract ReaperTest is Test {
    uint256 internal constant DURATION = 7 days;
    uint256 internal constant WAD = 1 ether;

    address internal setter;
    address internal alice;
    address internal bob;
    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;

    event ReapingStarted(
        uint256 indexed auctionId, uint256 ethBudget, uint256 snapshottedRewardRate, uint256 startTime, uint256 endTime
    );
    event Reaped(uint256 indexed auctionId, address indexed seller, uint256 nethBurned, uint256 ethPaid, uint256 rate);
    event ReapingFinalized(uint256 indexed auctionId, uint256 ethSpent, uint256 nethBurned, uint256 ethRolledOver);
    event ReaperDonation(address indexed from, uint256 amount);

    function setUp() public {
        setter = makeAddr("setter");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        neth = new NETH(setter);
        grave = new Grave(address(neth));
        vm.prank(setter);
        neth.setGrave(address(grave));
        reaper = new Reaper(address(neth), address(grave));
        vm.deal(alice, 10_000 ether);
        vm.deal(bob, 10_000 ether);
    }

    function _rate(uint256 r, uint256 elapsed) internal pure returns (uint256) {
        if (elapsed > DURATION) {
            elapsed = DURATION;
        }
        return Math.mulDiv(r, 200 * DURATION - 95 * elapsed, 100 * DURATION);
    }

    function _donate(address from, uint256 amount) internal {
        vm.prank(from);
        (bool ok,) = address(reaper).call{value: amount}("");
        assertTrue(ok);
    }

    function _bury(address who, uint256 amount) internal returns (uint256 nethOut) {
        vm.prank(who);
        nethOut = grave.bury{value: amount}(0);
    }

    function _approve(address who) internal {
        vm.prank(who);
        neth.approve(address(reaper), type(uint256).max);
    }

    function _assertSelectorAbsent(bytes memory callData) internal {
        (bool ok, bytes memory data) = address(reaper).call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function test_constructorRevertsZeroAddress() public {
        vm.expectRevert(Reaper.ZeroAddress.selector);
        new Reaper(address(0), address(grave));
        vm.expectRevert(Reaper.ZeroAddress.selector);
        new Reaper(address(neth), address(0));
    }

    function test_constructorRevertsEoa() public {
        vm.expectRevert(Reaper.NotContract.selector);
        new Reaper(alice, address(grave));
        vm.expectRevert(Reaper.NotContract.selector);
        new Reaper(address(neth), alice);
    }

    function test_genesisState() public view {
        Reaper.Auction memory auction = reaper.activeAuction();
        assertEq(reaper.availableReaperETH(), 0);
        assertEq(reaper.totalNethReaped(), 0);
        assertEq(reaper.totalHarvestedETH(), 0);
        assertEq(reaper.totalDonatedETH(), 0);
        assertEq(reaper.currentReaperRate(), 0);
        assertFalse(auction.active);
        assertEq(auction.id, 0);
        assertEq(address(reaper.neth()), address(neth));
        assertEq(address(reaper.grave()), address(grave));
        assertEq(address(reaper).balance, 0);
    }

    function test_receiveDonationDoesNotTouchGrave() public {
        uint256 principal = grave.protectedPrincipal();
        uint256 supply = neth.totalSupply();
        uint256 graveEth = address(grave).balance;

        vm.expectEmit(true, false, false, true, address(reaper));
        emit ReaperDonation(bob, 2 ether);
        _donate(bob, 2 ether);

        assertEq(reaper.availableReaperETH(), 2 ether);
        assertEq(reaper.totalDonatedETH(), 2 ether);
        assertEq(reaper.totalHarvestedETH(), 0);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(neth.totalSupply(), supply);
        assertEq(address(grave).balance, graveEth);
    }

    function test_ethFromGraveCountsAsHarvest() public {
        vm.deal(address(grave), 3 ether);
        vm.prank(address(grave));
        (bool ok,) = address(reaper).call{value: 3 ether}("");
        assertTrue(ok);

        assertEq(reaper.availableReaperETH(), 3 ether);
        assertEq(reaper.totalHarvestedETH(), 3 ether);
        assertEq(reaper.totalDonatedETH(), 0);
    }

    function test_startAuctionRevertsWhenEmpty() public {
        vm.expectRevert(Reaper.ZeroValue.selector);
        reaper.startAuction();
    }

    function test_startAuctionOneWei() public {
        _donate(alice, 1);
        uint256 r = grave.currentRewardRate();
        uint256 start = block.timestamp;
        vm.expectEmit(true, false, false, true, address(reaper));
        emit ReapingStarted(1, 1, r, start, start + DURATION);
        uint256 id = reaper.startAuction();
        assertEq(id, 1);
        Reaper.Auction memory auction = reaper.activeAuction();
        assertTrue(auction.active);
        assertEq(auction.ethBudget, 1);
        assertEq(auction.ethRemaining, 1);
        assertEq(auction.snapshottedRewardRate, r);
        assertEq(auction.endTime, start + DURATION);
        assertEq(reaper.availableReaperETH(), 0);
        assertEq(reaper.currentReaperRate(), 2 * r);
    }

    function test_secondStartWhileActiveRevertsEvenWithNewEth() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        _donate(bob, 1 ether);
        assertEq(reaper.availableReaperETH(), 1 ether);
        assertEq(reaper.activeAuction().ethRemaining, 1 ether);
        vm.expectRevert(Reaper.AuctionActive.selector);
        reaper.startAuction();
    }

    function test_ethDuringAuctionGoesToAvailableNotRemaining() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        _donate(bob, 2 ether);
        Reaper.Auction memory auction = reaper.activeAuction();
        assertEq(auction.ethRemaining, 1 ether);
        assertEq(reaper.availableReaperETH(), 2 ether);
    }

    function test_rateAtStartMidpointAndEnd() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        uint256 r = grave.currentRewardRate();
        assertEq(reaper.currentReaperRate(), 2 * r);

        vm.warp(block.timestamp + DURATION / 2);
        assertEq(reaper.currentReaperRate(), _rate(r, DURATION / 2));

        vm.warp(block.timestamp + DURATION / 2);
        assertEq(reaper.currentReaperRate(), _rate(r, DURATION));
        assertEq(reaper.currentReaperRate(), Math.mulDiv(r, 105, 100));
    }

    function test_rateNeverIncreasesDuringAuction() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        uint256 prev = reaper.currentReaperRate();
        for (uint256 i = 1; i <= 7; ++i) {
            vm.warp(block.timestamp + 1 days);
            uint256 next = reaper.currentReaperRate();
            assertLe(next, prev);
            prev = next;
        }
    }

    function test_eraChangeDoesNotModifyActiveAuction() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        uint256 r = reaper.activeAuction().snapshottedRewardRate;
        uint256 rateBefore = reaper.currentReaperRate();
        uint256 graveEthBefore = address(grave).balance;

        _bury(alice, 10 ether);
        assertEq(grave.currentEra(), 1);
        assertLt(grave.currentRewardRate(), r);
        assertEq(reaper.activeAuction().snapshottedRewardRate, r);
        assertEq(reaper.currentReaperRate(), rateBefore);
        assertEq(address(grave).balance, graveEthBefore + 10 ether);
    }

    function test_fullFillBurnsAndPaysFloorEth() public {
        uint256 minted = _bury(alice, 1 ether);
        _approve(alice);
        _donate(bob, 1 ether);
        reaper.startAuction();

        uint256 rate = reaper.currentReaperRate();
        uint256 expectedEth = Math.mulDiv(minted, WAD, rate);
        uint256 aliceEth = alice.balance;
        uint256 supply = neth.totalSupply();

        vm.expectEmit(true, true, false, true, address(reaper));
        emit Reaped(1, alice, minted, expectedEth, rate);
        vm.prank(alice);
        uint256 ethOut = reaper.sellToReaper(minted, expectedEth);

        assertEq(ethOut, expectedEth);
        assertEq(alice.balance, aliceEth + expectedEth);
        assertEq(neth.balanceOf(alice), 0);
        assertEq(neth.balanceOf(address(reaper)), 0);
        assertEq(neth.totalSupply(), supply - minted);
        assertEq(reaper.totalNethReaped(), minted);
        assertEq(reaper.activeAuction().ethRemaining, 1 ether - expectedEth);
        assertEq(grave.protectedPrincipal(), 1 ether);
    }

    function test_partialFillLeavesUnusedNeth() public {
        uint256 minted = _bury(alice, 1 ether);
        _approve(alice);
        _donate(bob, 0.1 ether);
        reaper.startAuction();
        uint256 rate = reaper.currentReaperRate();
        uint256 expectedTaken = Math.mulDiv(0.1 ether, rate, WAD, Math.Rounding.Ceil);

        vm.prank(alice);
        uint256 ethOut = reaper.sellToReaper(minted, 0);

        assertEq(ethOut, 0.1 ether);
        assertEq(neth.balanceOf(alice), minted - expectedTaken);
        assertEq(neth.balanceOf(address(reaper)), 0);
        assertEq(reaper.totalNethReaped(), expectedTaken);
        assertEq(reaper.activeAuction().ethRemaining, 0);

        uint256 leftover = neth.balanceOf(alice);
        vm.expectRevert(Reaper.ZeroEthOut.selector);
        vm.prank(alice);
        reaper.sellToReaper(leftover, 0);
    }

    function test_minEthOutRevertsWhenPriorFillReducesOutput() public {
        _bury(alice, 1 ether);
        _bury(bob, 1 ether);
        _approve(alice);
        _approve(bob);
        _donate(alice, 1 ether);
        reaper.startAuction();

        uint256 aliceNeth = neth.balanceOf(alice);
        uint256 originalQuote = reaper.quoteReaperSale(aliceNeth);
        vm.prank(alice);
        reaper.sellToReaper(aliceNeth, originalQuote);

        uint256 bobIn = 100_000 ether;
        uint256 reducedQuote = reaper.quoteReaperSale(bobIn);
        assertLt(reducedQuote, originalQuote);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Reaper.InsufficientEthOut.selector, reducedQuote, originalQuote));
        reaper.sellToReaper(bobIn, originalQuote);
    }

    function test_minEthOutExactSucceeds() public {
        _bury(alice, 1 ether);
        _approve(alice);
        _donate(bob, 1 ether);
        reaper.startAuction();
        uint256 nethIn = neth.balanceOf(alice);
        uint256 quote = reaper.quoteReaperSale(nethIn);
        vm.prank(alice);
        uint256 out = reaper.sellToReaper(nethIn, quote);
        assertEq(out, quote);
    }

    function test_quoteMatchesSell() public {
        _bury(alice, 1 ether);
        _approve(alice);
        _donate(bob, 1 ether);
        reaper.startAuction();
        uint256 nethIn = neth.balanceOf(alice);
        uint256 quote = reaper.quoteReaperSale(nethIn);
        vm.prank(alice);
        uint256 out = reaper.sellToReaper(nethIn, 0);
        assertEq(out, quote);
    }

    function test_afterExpirySellAndQuoteRevertRateStaysUntilFinalize() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        uint256 r = reaper.activeAuction().snapshottedRewardRate;
        vm.warp(block.timestamp + DURATION);
        assertEq(reaper.currentReaperRate(), Math.mulDiv(r, 105, 100));
        vm.expectRevert(Reaper.AuctionExpired.selector);
        reaper.quoteReaperSale(1 ether);
        vm.prank(alice);
        vm.expectRevert(Reaper.AuctionExpired.selector);
        reaper.sellToReaper(1 ether, 0);
    }

    function test_finalizeBeforeEndReverts() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        vm.expectRevert(Reaper.AuctionNotExpired.selector);
        reaper.finalizeAuction();
    }

    function test_finalizeRollsRemainingAndClearsActive() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        vm.warp(block.timestamp + DURATION);
        vm.expectEmit(true, false, false, true, address(reaper));
        emit ReapingFinalized(1, 0, 0, 1 ether);
        reaper.finalizeAuction();
        Reaper.Auction memory auction = reaper.activeAuction();
        assertFalse(auction.active);
        assertEq(auction.id, 1);
        assertEq(reaper.availableReaperETH(), 1 ether);
        assertEq(reaper.currentReaperRate(), 0);
    }

    function test_newAuctionAfterFinalizeWithRolloverAndDeposits() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        _donate(bob, 0.5 ether);
        vm.warp(block.timestamp + DURATION);
        reaper.finalizeAuction();
        assertEq(reaper.availableReaperETH(), 1.5 ether);
        uint256 id = reaper.startAuction();
        assertEq(id, 2);
        assertTrue(reaper.activeAuction().active);
        assertEq(reaper.activeAuction().ethBudget, 1.5 ether);
        assertEq(reaper.availableReaperETH(), 0);
    }

    function test_holderBurnDoesNotCountAsReaped() public {
        uint256 minted = _bury(alice, 1 ether);
        uint256 supply = neth.totalSupply();
        vm.prank(alice);
        neth.burn(minted / 2);
        assertEq(neth.totalSupply(), supply - minted / 2);
        assertEq(reaper.totalNethReaped(), 0);
        assertEq(grave.totalNethMinted(), minted);
    }

    function test_reaperOpsDoNotPullGraveEth() public {
        _bury(alice, 1 ether);
        uint256 principal = grave.protectedPrincipal();
        uint256 graveEth = address(grave).balance;
        _donate(bob, 1 ether);
        reaper.startAuction();
        _approve(alice);
        vm.prank(alice);
        reaper.sellToReaper(100_000 ether, 0);
        vm.warp(block.timestamp + DURATION);
        reaper.finalizeAuction();
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(address(grave).balance, graveEth);
    }

    function test_noWithdrawHarvestPauseOwnerOrDex() public {
        _assertSelectorAbsent(abi.encodeWithSignature("withdraw(uint256)", uint256(1)));
        _assertSelectorAbsent(abi.encodeWithSignature("harvest()"));
        _assertSelectorAbsent(abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(abi.encodeWithSignature("unpause()"));
        _assertSelectorAbsent(abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(abi.encodeWithSignature("swap(uint256,uint256)", uint256(1), uint256(1)));
        _assertSelectorAbsent(abi.encodeWithSignature("uniswapV2Call(address,uint256,uint256,bytes)", alice, 0, 0, ""));
    }

    function test_sellReentrancyGuarded() public {
        ReenteringSeller seller = new ReenteringSeller();
        seller.set(reaper, neth);
        vm.deal(address(seller), 2 ether);
        vm.prank(address(seller));
        grave.bury{value: 1 ether}(0);
        seller.approveAll();
        _donate(bob, 1 ether);
        reaper.startAuction();
        seller.setMode(1);
        uint256 nethIn = neth.balanceOf(address(seller));
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(address(seller));
        reaper.sellToReaper(nethIn, 0);
    }

    function test_startAndFinalizeReentrancyGuardedFromSell() public {
        ReenteringSeller seller = new ReenteringSeller();
        seller.set(reaper, neth);
        vm.deal(address(seller), 2 ether);
        vm.prank(address(seller));
        grave.bury{value: 1 ether}(0);
        seller.approveAll();
        _donate(bob, 1 ether);
        reaper.startAuction();

        seller.setMode(2);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(address(seller));
        reaper.sellToReaper(100_000 ether, 0);

        seller.setMode(3);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        vm.prank(address(seller));
        reaper.sellToReaper(100_000 ether, 0);
    }

    function test_zeroNethInReverts() public {
        _donate(alice, 1 ether);
        reaper.startAuction();
        vm.expectRevert(Reaper.ZeroValue.selector);
        reaper.quoteReaperSale(0);
        vm.prank(alice);
        vm.expectRevert(Reaper.ZeroValue.selector);
        reaper.sellToReaper(0, 0);
    }

    function test_tinyNethInRevertsZeroEthOut() public {
        _bury(alice, 1 ether);
        _approve(alice);
        _donate(bob, 1 ether);
        reaper.startAuction();
        vm.prank(alice);
        vm.expectRevert(Reaper.ZeroEthOut.selector);
        reaper.sellToReaper(1, 0);
    }

    function test_surplusDealCreditedAsDonationOnCollect() public {
        vm.deal(address(reaper), 1 ether);
        assertEq(reaper.availableReaperETH(), 0);
        vm.expectEmit(true, false, false, true, address(reaper));
        emit ReaperDonation(address(reaper), 1 ether);
        uint256 amount = reaper.collectSurplus();
        assertEq(amount, 1 ether);
        assertEq(reaper.availableReaperETH(), 1 ether);
        assertEq(reaper.totalDonatedETH(), 1 ether);
        uint256 id = reaper.startAuction();
        assertEq(id, 1);
        assertEq(reaper.activeAuction().ethBudget, 1 ether);
    }

    function test_startAuctionCollectsSurplus() public {
        vm.deal(address(reaper), 1);
        reaper.startAuction();
        assertEq(reaper.activeAuction().ethBudget, 1);
        assertEq(reaper.totalDonatedETH(), 1);
    }

    function test_quoteRevertsWithNoAuction() public {
        vm.expectRevert(Reaper.NoActiveAuction.selector);
        reaper.quoteReaperSale(1 ether);
    }

    function test_finalizeRevertsWithNoAuction() public {
        vm.expectRevert(Reaper.NoActiveAuction.selector);
        reaper.finalizeAuction();
    }

    function test_noAuctionCannotStartWithoutInjectedEth() public {
        vm.expectRevert(Reaper.ZeroValue.selector);
        reaper.startAuction();
        assertEq(reaper.availableReaperETH(), 0);
        assertFalse(reaper.activeAuction().active);
    }
}
