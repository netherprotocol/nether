// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {AaveV3WethAdapter} from "src/strategy/AaveV3WethAdapter.sol";
import {IWETH9} from "src/interfaces/IWETH9.sol";
import {IAaveV3Pool} from "src/interfaces/IAaveV3Pool.sol";
import {IPoolAddressesProvider} from "src/interfaces/IPoolAddressesProvider.sol";
import {IAToken} from "src/interfaces/IAToken.sol";

interface IERC20View {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface IAaveV3PoolTestSlice {
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
        external;

    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
        external
        returns (uint256);

    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}

contract ProtocolE2EForkTest is Test {
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address internal constant EXPECTED_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address internal constant A_WETH = 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7;
    address internal constant VARIABLE_DEBT_WETH = 0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E;

    uint256 internal constant ERA0_RATE = 1_000_000 ether;
    uint256 internal constant FULL_ERA_NETH = 10_000_000 ether;
    uint256 internal constant AUCTION_DURATION = 7 days;
    uint256 internal constant STRATEGY_DELAY = 14 days;
    uint256 internal constant VARIABLE_RATE_MODE = 2;
    uint256 internal constant DUST = 2;

    address internal setter;
    address internal admin;
    address internal successor;
    address internal alice;
    address internal bob;
    address internal donor;
    address internal whale;
    address internal pool;

    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;
    AaveV3WethAdapter internal adapterA;
    AaveV3WethAdapter internal adapterB;

    event EraCompleted(uint256 indexed era, uint256 ethBuried, uint256 nethMinted);
    event ReaperDonation(address indexed from, uint256 amount);

    function setUp() public {
        vm.createSelectFork("base");
        pool = IPoolAddressesProvider(PROVIDER).getPool();
        assertEq(pool, EXPECTED_POOL);
        assertEq(IAToken(A_WETH).POOL(), EXPECTED_POOL);

        setter = _eoa("nether-e2e-setter");
        admin = _eoa("nether-e2e-admin");
        successor = _eoa("nether-e2e-successor");
        alice = _eoa("nether-e2e-alice");
        bob = _eoa("nether-e2e-bob");
        donor = _eoa("nether-e2e-donor");
        whale = _eoa("nether-e2e-whale");

        vm.deal(setter, 100 ether);
        vm.deal(admin, 100 ether);
        vm.deal(successor, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 10_000 ether);
        vm.deal(donor, 100 ether);
        vm.deal(whale, 1_000 ether);
    }

    function test_protocolLifecycleOnBaseFork() public {
        _beat0ForkAndPins();
        _beat1DeployAndWire();
        _beat2BuryBeforeStrategy();
        _beat3DonateHarvestDonationAuction();
        _beat4FirstAdapter();
        _beat5EraChanges();
        _beat6HarvestAaveYield();
        _beat7AaveFundedAuction();
        _beat8OwnershipHandoff();
        _beat9MigrateAaveToAave();
        _beat10DonationThenBuryDeploysIdle();
    }

    function _beat0ForkAndPins() internal {
        assertEq(IPoolAddressesProvider(PROVIDER).getPool(), EXPECTED_POOL);
        assertEq(IAToken(A_WETH).POOL(), EXPECTED_POOL);
        assertEq(IAToken(A_WETH).UNDERLYING_ASSET_ADDRESS(), WETH);
        assertEq(IERC20View(WETH).decimals(), 18);
        assertEq(IERC20View(A_WETH).decimals(), 18);

        uint256 ethBefore = whale.balance;
        uint256 wethBefore = IWETH9(WETH).balanceOf(whale);
        vm.prank(whale);
        IWETH9(WETH).deposit{value: 1 ether}();
        assertEq(IWETH9(WETH).balanceOf(whale), wethBefore + 1 ether);
        vm.prank(whale);
        IWETH9(WETH).withdraw(1 ether);
        assertEq(IWETH9(WETH).balanceOf(whale), wethBefore);
        assertEq(whale.balance, ethBefore);
    }

    function _beat1DeployAndWire() internal {
        _deployFamily();

        assertEq(neth.grave(), address(0));
        assertEq(grave.reaper(), address(0));
        assertEq(grave.activeStrategy(), address(0));
        assertEq(grave.owner(), admin);
        assertEq(neth.totalSupply(), 0);
        assertEq(grave.protectedPrincipal(), 0);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        grave.setReaper(address(reaper));

        vm.prank(setter);
        neth.setGrave(address(grave));
        vm.prank(admin);
        grave.setReaper(address(reaper));

        assertEq(neth.grave(), address(grave));
        assertEq(neth.graveSetter(), address(0));
        assertEq(grave.reaper(), address(reaper));
        assertEq(adapterA.underlying(), WETH);
        assertEq(adapterA.grave(), address(grave));

        vm.prank(setter);
        vm.expectRevert(NETH.GraveAlreadySet.selector);
        neth.setGrave(address(grave));
        vm.prank(admin);
        vm.expectRevert(Grave.ReaperAlreadySet.selector);
        grave.setReaper(address(reaper));
    }

    function _beat2BuryBeforeStrategy() internal {
        uint256 quoted = grave.quoteBury(1 ether);
        vm.recordLogs();
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 1 ether}(quoted);
        _assertNoEraCompleted(vm.getRecordedLogs());

        assertEq(nethOut, quoted);
        assertEq(neth.balanceOf(alice), nethOut);
        assertEq(grave.protectedPrincipal(), 1 ether);
        assertEq(address(grave).balance, 1 ether);
        assertEq(grave.currentEra(), 0);
        assertEq(grave.currentRewardRate(), ERA0_RATE);
        assertEq(adapterA.totalAssetsInETH(), 0);

        vm.prank(alice);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);
    }

    function _beat3DonateHarvestDonationAuction() internal {
        uint256 supplyBefore = neth.totalSupply();
        uint256 principalBefore = grave.protectedPrincipal();
        _donate(donor, address(grave), 0.5 ether);

        assertEq(neth.totalSupply(), supplyBefore);
        assertEq(grave.protectedPrincipal(), principalBefore);
        assertEq(grave.currentNAV(), 1.5 ether);
        assertEq(grave.harvestableYield(), 0.5 ether);
        assertEq(address(grave).balance, 1.5 ether);

        uint256 harvestedBefore = reaper.totalHarvestedETH();
        uint256 donatedBefore = reaper.totalDonatedETH();
        uint256 harvested = grave.harvest();
        assertEq(harvested, 0.5 ether);
        assertEq(reaper.totalHarvestedETH(), harvestedBefore + 0.5 ether);
        assertEq(reaper.totalDonatedETH(), donatedBefore);
        assertEq(grave.protectedPrincipal(), 1 ether);
        assertEq(address(grave).balance, 1 ether);
        assertEq(grave.harvestableYield(), 0);

        uint256 r = grave.currentRewardRate();
        vm.prank(bob);
        reaper.startAuction();
        assertEq(reaper.currentReaperRate(), 2 * r);

        uint256 aliceNeth = neth.balanceOf(alice);
        uint256 supplyAtSell = neth.totalSupply();
        uint256 aliceEthBefore = alice.balance;
        uint256 quote = reaper.quoteReaperSale(aliceNeth);
        vm.prank(alice);
        neth.approve(address(reaper), aliceNeth);
        vm.prank(alice);
        uint256 ethOut = reaper.sellToReaper(aliceNeth, quote);

        assertEq(ethOut, quote);
        assertEq(neth.totalSupply(), supplyAtSell - aliceNeth);
        assertEq(neth.balanceOf(alice), 0);
        assertEq(neth.balanceOf(address(reaper)), 0);
        assertEq(alice.balance, aliceEthBefore + ethOut);
        assertEq(reaper.totalNethReaped(), aliceNeth);
        assertEq(reaper.activeAuction().ethRemaining, 0.5 ether - ethOut);

        vm.warp(block.timestamp + AUCTION_DURATION);
        reaper.finalizeAuction();
        assertFalse(reaper.activeAuction().active);
        assertLe(reaper.availableReaperETH(), DUST);
        assertEq(neth.balanceOf(address(reaper)), 0);
    }

    function _beat4FirstAdapter() internal {
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        grave.scheduleStrategy(address(adapterA));
        (address pending, uint256 executeAfter) = grave.pendingStrategy();
        assertEq(pending, address(adapterA));
        assertEq(executeAfter, block.timestamp + STRATEGY_DELAY);

        vm.prank(admin);
        grave.executeStrategyMigration();

        assertEq(grave.activeStrategy(), address(adapterA));
        (address pendingAfter, uint256 executeAfterCleared) = grave.pendingStrategy();
        assertEq(pendingAfter, address(0));
        assertEq(executeAfterCleared, 0);
        assertEq(address(grave).balance, 0);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterA)), 1 ether, DUST);
        assertApproxEqAbs(grave.currentNAV(), grave.protectedPrincipal(), DUST);
        assertEq(grave.currentEra(), 0);
        _assertNoAdapterDebt(address(adapterA));
        assertEq(admin.balance, adminBefore);
    }

    function _beat5EraChanges() internal {
        uint256 aBefore = IAToken(A_WETH).balanceOf(address(adapterA));
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(0, 10 ether, FULL_ERA_NETH);
        _buryQuoted(bob, 9 ether);
        assertEq(grave.currentEra(), 1);
        assertEq(grave.currentRewardRate(), ERA0_RATE / 2);
        assertEq(grave.protectedPrincipal(), 10 ether);
        assertEq(address(grave).balance, 0);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterA)), aBefore + 9 ether, DUST);
        _assertNoAdapterDebt(address(adapterA));

        aBefore = IAToken(A_WETH).balanceOf(address(adapterA));
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(1, 20 ether, FULL_ERA_NETH);
        _buryQuoted(bob, 20 ether);
        assertEq(grave.currentEra(), 2);
        assertEq(grave.currentRewardRate(), ERA0_RATE / 4);
        assertEq(grave.protectedPrincipal(), 30 ether);
        assertEq(address(grave).balance, 0);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterA)), aBefore + 20 ether, DUST);
        _assertNoAdapterDebt(address(adapterA));

        aBefore = IAToken(A_WETH).balanceOf(address(adapterA));
        vm.recordLogs();
        _buryQuoted(bob, 20 ether);
        _assertNoEraCompleted(vm.getRecordedLogs());
        assertEq(grave.currentEra(), 2);
        assertEq(grave.currentRewardRate(), ERA0_RATE / 4);
        assertEq(grave.protectedPrincipal(), 50 ether);
        assertEq(address(grave).balance, 0);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterA)), aBefore + 20 ether, DUST);
        _assertNoAdapterDebt(address(adapterA));

        vm.expectRevert(Grave.NoHarvestableYield.selector);
        grave.harvest();
    }

    function _beat6HarvestAaveYield() internal {
        uint256 nav0 = adapterA.totalAssetsInETH();
        uint256 principal = grave.protectedPrincipal();
        uint256 harvestedBefore = reaper.totalHarvestedETH();
        uint256 donatedBefore = reaper.totalDonatedETH();
        uint256 adminBefore = admin.balance;
        uint256 successorBefore = successor.balance;

        vm.warp(block.timestamp + 90 days);
        _pokeAaveWethIndex();
        _induceAaveSupplyYieldIfNeeded(nav0);

        assertGt(adapterA.totalAssetsInETH(), nav0);
        assertGt(grave.harvestableYield(), 0);

        uint256 harvested = grave.harvest();
        assertGt(harvested, 0);
        assertEq(reaper.totalHarvestedETH(), harvestedBefore + harvested);
        assertEq(reaper.totalDonatedETH(), donatedBefore);
        assertEq(grave.protectedPrincipal(), principal);
        assertGe(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(admin.balance, adminBefore);
        assertEq(successor.balance, successorBefore);
        _assertNoAdapterDebt(address(adapterA));
    }

    function _beat7AaveFundedAuction() internal {
        uint256 startTime = _startAaveAuctionAndObserveCurve();
        uint256 donation = _donateToReaperDuringAuction();
        _completeEraDuringAuction();
        _partialSellToReaper();
        _finalizeAaveAuctionAndFollowOn(startTime, donation);
    }

    function _startAaveAuctionAndObserveCurve() internal returns (uint256 startTime) {
        uint256 r = grave.currentRewardRate();
        assertEq(r, ERA0_RATE / 4);
        uint256 harvestedBudget = reaper.availableReaperETH();
        assertGt(harvestedBudget, 0);

        vm.prank(bob);
        reaper.startAuction();
        startTime = block.timestamp;
        assertEq(reaper.activeAuction().ethBudget, harvestedBudget);
        assertEq(reaper.currentReaperRate(), 2 * r);
        assertEq(reaper.activeAuction().snapshottedRewardRate, r);

        vm.warp(startTime + AUCTION_DURATION / 2);
        uint256 midRate = reaper.currentReaperRate();
        assertEq(midRate, Math.mulDiv(r, 200 * AUCTION_DURATION - 95 * (AUCTION_DURATION / 2), 100 * AUCTION_DURATION));
        assertLt(midRate, 2 * r);
        assertGt(midRate, Math.mulDiv(r, 105, 100));
    }

    function _donateToReaperDuringAuction() internal returns (uint256 donation) {
        uint256 ethRemainingBefore = reaper.activeAuction().ethRemaining;
        uint256 ethBudgetBefore = reaper.activeAuction().ethBudget;
        uint256 harvestedBefore = reaper.totalHarvestedETH();
        uint256 donatedBefore = reaper.totalDonatedETH();
        uint256 availableBefore = reaper.availableReaperETH();
        donation = 0.25 ether;
        vm.expectEmit(true, false, false, true, address(reaper));
        emit ReaperDonation(donor, donation);
        _donate(donor, address(reaper), donation);
        assertEq(reaper.totalDonatedETH(), donatedBefore + donation);
        assertEq(reaper.availableReaperETH(), availableBefore + donation);
        assertEq(reaper.totalHarvestedETH(), harvestedBefore);
        assertEq(reaper.activeAuction().ethRemaining, ethRemainingBefore);
        assertEq(reaper.activeAuction().ethBudget, ethBudgetBefore);
    }

    function _completeEraDuringAuction() internal {
        uint256 rateBeforeEra = reaper.currentReaperRate();
        uint256 snapBeforeEra = reaper.activeAuction().snapshottedRewardRate;
        uint256 aBefore = IAToken(A_WETH).balanceOf(address(adapterA));
        vm.expectEmit(true, false, false, true, address(grave));
        emit EraCompleted(2, 40 ether, FULL_ERA_NETH);
        _buryQuoted(bob, 20 ether);
        assertEq(grave.currentEra(), 3);
        assertEq(grave.currentRewardRate(), ERA0_RATE / 8);
        assertEq(reaper.activeAuction().snapshottedRewardRate, snapBeforeEra);
        assertEq(reaper.currentReaperRate(), rateBeforeEra);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterA)), aBefore + 20 ether, DUST);
    }

    function _partialSellToReaper() internal {
        uint256 bobNethBefore = neth.balanceOf(bob);
        uint256 supplyBefore = neth.totalSupply();
        uint256 bobEthBefore = bob.balance;
        uint256 reapedBefore = reaper.totalNethReaped();
        uint256 remainingBeforeSell = reaper.activeAuction().ethRemaining;
        uint256 nethIn = _partialFillNethIn();
        uint256 minEthOut = reaper.quoteReaperSale(nethIn);
        vm.prank(bob);
        neth.approve(address(reaper), nethIn);
        vm.prank(bob);
        uint256 ethPaid = reaper.sellToReaper(nethIn, minEthOut);
        uint256 nethTaken = bobNethBefore - neth.balanceOf(bob);

        assertGt(ethPaid, 0);
        assertLt(reaper.activeAuction().ethRemaining, remainingBeforeSell);
        assertGt(reaper.activeAuction().ethRemaining, 0);
        assertEq(neth.totalSupply(), supplyBefore - nethTaken);
        assertEq(neth.balanceOf(address(reaper)), 0);
        assertEq(bob.balance, bobEthBefore + ethPaid);
        assertEq(reaper.totalNethReaped(), reapedBefore + nethTaken);
    }

    function _finalizeAaveAuctionAndFollowOn(uint256 startTime, uint256 donation) internal {
        vm.warp(startTime + AUCTION_DURATION);
        uint256 unspent = reaper.activeAuction().ethRemaining;
        uint256 availableAtFinalize = reaper.availableReaperETH();
        reaper.finalizeAuction();
        assertFalse(reaper.activeAuction().active);
        assertEq(reaper.availableReaperETH(), availableAtFinalize + unspent);
        assertEq(neth.balanceOf(address(reaper)), 0);

        uint256 donatedTotal = reaper.totalDonatedETH();
        uint256 followBudget = reaper.availableReaperETH();
        vm.prank(bob);
        reaper.startAuction();
        assertGe(reaper.activeAuction().ethBudget, donation);
        assertEq(reaper.activeAuction().ethBudget, followBudget);
        assertEq(reaper.totalDonatedETH(), donatedTotal);
        vm.warp(block.timestamp + AUCTION_DURATION);
        reaper.finalizeAuction();
        assertFalse(reaper.activeAuction().active);
    }

    function _beat8OwnershipHandoff() internal {
        vm.prank(admin);
        grave.transferOwnership(successor);
        assertEq(grave.owner(), admin);
        assertEq(grave.pendingOwner(), successor);

        vm.prank(successor);
        grave.acceptOwnership();
        assertEq(grave.owner(), successor);
        assertEq(grave.pendingOwner(), address(0));

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, admin));
        grave.scheduleStrategy(address(adapterA));
    }

    function _beat9MigrateAaveToAave() internal {
        adapterB = new AaveV3WethAdapter(address(grave), PROVIDER, WETH, A_WETH);
        uint256 adminBefore = admin.balance;
        uint256 successorBefore = successor.balance;
        uint256 principal = grave.protectedPrincipal();
        uint256 supply = neth.totalSupply();

        vm.prank(successor);
        grave.scheduleStrategy(address(adapterB));
        (, uint256 executeAfter) = grave.pendingStrategy();
        vm.prank(successor);
        vm.expectRevert(abi.encodeWithSelector(Grave.StrategyDelayNotElapsed.selector, executeAfter));
        grave.executeStrategyMigration();
        _warpDelay();
        uint256 navFromA = adapterA.totalAssetsInETH();
        vm.prank(successor);
        grave.executeStrategyMigration();

        assertEq(grave.activeStrategy(), address(adapterB));
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterA)), 0, DUST);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterB)), navFromA, DUST);
        assertEq(address(grave).balance, 0);
        assertEq(successor.balance, successorBefore);
        assertEq(admin.balance, adminBefore);
        _assertNoAdapterDebt(address(adapterA));
        _assertNoAdapterDebt(address(adapterB));
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(neth.totalSupply(), supply);
    }

    function _beat10DonationThenBuryDeploysIdle() internal {
        uint256 supplyBefore = neth.totalSupply();
        uint256 principalBefore = grave.protectedPrincipal();
        uint256 aBefore = IAToken(A_WETH).balanceOf(address(adapterB));
        uint256 donation = 0.4 ether;

        _donate(donor, address(grave), donation);
        assertEq(neth.totalSupply(), supplyBefore);
        assertEq(grave.protectedPrincipal(), principalBefore);
        assertEq(address(grave).balance, donation);
        assertEq(IAToken(A_WETH).balanceOf(address(adapterB)), aBefore);
        uint256 idle = address(grave).balance;
        uint256 principal = grave.protectedPrincipal();
        assertLt(idle, principal);

        _buryQuoted(bob, 1 ether);
        assertEq(grave.protectedPrincipal(), principalBefore + 1 ether);
        assertEq(address(grave).balance, 0);
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapterB)), aBefore + donation + 1 ether, DUST);

        uint256 principalAfterBury = grave.protectedPrincipal();
        if (grave.harvestableYield() == 0) {
            vm.expectRevert(Grave.NoHarvestableYield.selector);
            grave.harvest();
        } else {
            uint256 harvested = grave.harvest();
            assertGt(harvested, 0);
            assertEq(grave.protectedPrincipal(), principalAfterBury);
            assertGe(grave.currentNAV(), principalAfterBury);
        }

        _assertSelectorAbsent(address(reaper), abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(address(reaper), abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(address(reaper), abi.encodeWithSignature("withdraw(uint256)", uint256(1)));
        _assertSelectorAbsent(address(neth), abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(address(grave), abi.encodeWithSignature("pause()"));
    }

    function _eoa(string memory name) internal returns (address addr) {
        addr = makeAddr(name);
        require(addr.code.length == 0, "actor has code");
    }

    function _deployFamily() internal {
        neth = new NETH(setter);
        grave = new Grave(address(neth), admin);
        reaper = new Reaper(address(neth), address(grave));
        adapterA = new AaveV3WethAdapter(address(grave), PROVIDER, WETH, A_WETH);
    }

    function _warpDelay() internal {
        vm.warp(block.timestamp + STRATEGY_DELAY);
    }

    function _buryQuoted(address who, uint256 amount) internal returns (uint256 nethOut) {
        uint256 quoted = grave.quoteBury(amount);
        vm.prank(who);
        nethOut = grave.bury{value: amount}(quoted);
        assertEq(nethOut, quoted);
    }

    function _donate(address from, address to, uint256 amount) internal {
        vm.prank(from);
        (bool ok,) = to.call{value: amount}("");
        assertTrue(ok);
    }

    function _pokeAaveWethIndex() internal {
        vm.startPrank(whale);
        IWETH9(WETH).deposit{value: 1 ether}();
        IWETH9(WETH).approve(pool, 1 ether);
        IAaveV3Pool(pool).supply(WETH, 0.01 ether, whale, 0);
        IAaveV3Pool(pool).supply(WETH, 0.01 ether, whale, 0);
        IAaveV3Pool(pool).withdraw(WETH, 0.01 ether, whale);
        vm.stopPrank();
    }

    function _induceAaveSupplyYieldIfNeeded(uint256 nav0) internal {
        if (adapterA.totalAssetsInETH() > nav0 && grave.harvestableYield() > 0) {
            return;
        }

        uint256 supplyAmt = 20 ether;
        uint256 borrowAmt = 5 ether;
        vm.startPrank(whale);
        IWETH9(WETH).deposit{value: supplyAmt}();
        IWETH9(WETH).approve(pool, supplyAmt);
        IAaveV3Pool(pool).supply(WETH, supplyAmt, whale, 0);
        IAaveV3PoolTestSlice(pool).borrow(WETH, borrowAmt, VARIABLE_RATE_MODE, 0, whale);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        _pokeAaveWethIndex();

        vm.startPrank(whale);
        uint256 debt = IERC20View(VARIABLE_DEBT_WETH).balanceOf(whale);
        uint256 wethBal = IWETH9(WETH).balanceOf(whale);
        if (wethBal < debt + 1 ether) {
            IWETH9(WETH).deposit{value: debt + 1 ether - wethBal}();
        }
        IWETH9(WETH).approve(pool, type(uint256).max);
        IAaveV3PoolTestSlice(pool).repay(WETH, type(uint256).max, VARIABLE_RATE_MODE, whale);
        vm.stopPrank();
    }

    function _partialFillNethIn() internal view returns (uint256 nethIn) {
        uint256 remaining = reaper.activeAuction().ethRemaining;
        uint256 rate = reaper.currentReaperRate();
        uint256 targetEth = remaining / 2;
        if (targetEth == 0) {
            targetEth = 1;
        }
        nethIn = Math.mulDiv(targetEth, rate, 1 ether, Math.Rounding.Ceil);
        if (nethIn == 0) {
            nethIn = 1 ether;
        }
        uint256 quote = reaper.quoteReaperSale(nethIn);
        if (quote >= remaining && remaining > 1) {
            nethIn = Math.mulDiv(targetEth / 2 == 0 ? 1 : targetEth / 2, rate, 1 ether, Math.Rounding.Ceil);
        }
    }

    function _assertNoAdapterDebt(address adapter) internal view {
        assertEq(IERC20View(VARIABLE_DEBT_WETH).balanceOf(adapter), 0);
    }

    function _assertNoEraCompleted(Vm.Log[] memory logs) internal pure {
        bytes32 topic = keccak256("EraCompleted(uint256,uint256,uint256)");
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics.length > 0) {
                assertTrue(logs[i].topics[0] != topic);
            }
        }
    }

    function _assertSelectorAbsent(address target, bytes memory callData) internal {
        (bool ok, bytes memory data) = target.call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }
}
