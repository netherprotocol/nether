// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {AaveV3WethAdapter} from "src/strategy/AaveV3WethAdapter.sol";
import {MockWETH9} from "test/mocks/MockWETH9.sol";
import {MockAaveV3Pool, MockAToken} from "test/mocks/MockAaveV3Pool.sol";
import {MockPoolAddressesProvider} from "test/mocks/MockPoolAddressesProvider.sol";
import {TestInvestAdapter} from "test/mocks/TestInvestAdapter.sol";

contract AaveV3WethAdapterTest is Test {
    MockWETH9 internal weth;
    MockAaveV3Pool internal pool;
    MockPoolAddressesProvider internal provider;
    AaveV3WethAdapter internal adapter;
    address internal stranger;

    receive() external payable {}

    function setUp() public {
        stranger = makeAddr("stranger");
        weth = new MockWETH9();
        pool = new MockAaveV3Pool(address(weth));
        provider = new MockPoolAddressesProvider(address(pool));
        adapter = new AaveV3WethAdapter(address(this), address(provider), address(weth), address(pool.aToken()));
        vm.deal(address(this), 10_000 ether);
        vm.deal(stranger, 10_000 ether);
    }

    function _assertSelectorAbsent(address target, bytes memory callData) internal {
        (bool ok, bytes memory data) = target.call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function test_constructorStoresImmutablesAndNoPoolGetter() public view {
        assertEq(adapter.grave(), address(this));
        assertEq(address(adapter.provider()), address(provider));
        assertEq(address(adapter.weth()), address(weth));
        assertEq(address(adapter.aWeth()), address(pool.aToken()));
        assertEq(adapter.underlying(), address(weth));
        assertEq(adapter.totalAssetsInETH(), 0);
    }

    function test_constructorRevertsZeroAndEoa() public {
        address eoa = makeAddr("eoa");
        address aWeth = address(pool.aToken());

        vm.expectRevert(AaveV3WethAdapter.ZeroAddress.selector);
        new AaveV3WethAdapter(address(0), address(provider), address(weth), aWeth);

        vm.expectRevert(AaveV3WethAdapter.NotContract.selector);
        new AaveV3WethAdapter(eoa, address(provider), address(weth), aWeth);

        vm.expectRevert(AaveV3WethAdapter.ZeroAddress.selector);
        new AaveV3WethAdapter(address(this), address(0), address(weth), aWeth);

        vm.expectRevert(AaveV3WethAdapter.NotContract.selector);
        new AaveV3WethAdapter(address(this), eoa, address(weth), aWeth);

        vm.expectRevert(AaveV3WethAdapter.ZeroAddress.selector);
        new AaveV3WethAdapter(address(this), address(provider), address(0), aWeth);

        vm.expectRevert(AaveV3WethAdapter.NotContract.selector);
        new AaveV3WethAdapter(address(this), address(provider), eoa, aWeth);

        vm.expectRevert(AaveV3WethAdapter.ZeroAddress.selector);
        new AaveV3WethAdapter(address(this), address(provider), address(weth), address(0));

        vm.expectRevert(AaveV3WethAdapter.NotContract.selector);
        new AaveV3WethAdapter(address(this), address(provider), address(weth), eoa);
    }

    function test_constructorRevertsInvalidPoolAndAToken() public {
        address aWeth = address(pool.aToken());
        MockPoolAddressesProvider zeroPool = new MockPoolAddressesProvider(address(0));
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        new AaveV3WethAdapter(address(this), address(zeroPool), address(weth), aWeth);

        MockAToken mismatchedPool = new MockAToken(address(weth), address(weth));
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        new AaveV3WethAdapter(address(this), address(provider), address(weth), address(mismatchedPool));

        address notWeth = makeAddr("notWeth");
        MockAToken mismatchedUnderlying = new MockAToken(address(pool), notWeth);
        vm.expectRevert(AaveV3WethAdapter.InvalidAToken.selector);
        new AaveV3WethAdapter(address(this), address(provider), address(weth), address(mismatchedUnderlying));
    }

    function test_nonGraveDepositAndWithdrawRevert() public {
        vm.prank(stranger);
        vm.expectRevert(AaveV3WethAdapter.NotGrave.selector);
        adapter.depositETH{value: 1 ether}();

        vm.prank(stranger);
        vm.expectRevert(AaveV3WethAdapter.NotGrave.selector);
        adapter.withdrawETH(1 ether, address(this));
    }

    function test_withdrawToNonGraveReverts() public {
        adapter.depositETH{value: 1 ether}();
        vm.expectRevert(AaveV3WethAdapter.InvalidRecipient.selector);
        adapter.withdrawETH(1 ether, stranger);
    }

    function test_receiveFromNonWethReverts() public {
        (bool ok, bytes memory data) = address(adapter).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(data, abi.encodeWithSelector(AaveV3WethAdapter.NotWeth.selector));
    }

    function test_depositWrapsSuppliesAndDisablesCollateral() public {
        adapter.depositETH{value: 2 ether}();

        assertEq(address(adapter).balance, 0);
        assertEq(weth.balanceOf(address(adapter)), 0);
        assertEq(pool.aToken().balanceOf(address(adapter)), 2 ether);
        assertEq(adapter.totalAssetsInETH(), 2 ether);
        assertEq(pool.lastSupplyAsset(), address(weth));
        assertEq(pool.lastSupplyAmount(), 2 ether);
        assertEq(pool.lastSupplyOnBehalf(), address(adapter));
        assertEq(pool.lastReferralCode(), 0);
        assertEq(pool.supplyCalls(), 1);
        assertFalse(pool.usingAsCollateral(address(adapter), address(weth)));
        assertEq(weth.allowance(address(adapter), address(pool)), 0);
        assertEq(pool.variableDebt().balanceOf(address(adapter)), 0);
    }

    function test_zeroDepositReverts() public {
        vm.expectRevert(AaveV3WethAdapter.ZeroDeposit.selector);
        adapter.depositETH{value: 0}();
    }

    function test_revertingSupplyRevertsDepositAndUndoesWrap() public {
        pool.setSupplyReverts(true);
        uint256 ethBefore = address(this).balance;
        vm.expectRevert(MockAaveV3Pool.SupplyFailed.selector);
        adapter.depositETH{value: 1 ether}();
        assertEq(address(this).balance, ethBefore);
        assertEq(address(adapter).balance, 0);
        assertEq(weth.balanceOf(address(adapter)), 0);
        assertEq(pool.aToken().balanceOf(address(adapter)), 0);
        assertEq(pool.supplyCalls(), 0);
    }

    function test_withdrawReturnsEthToGrave() public {
        adapter.depositETH{value: 3 ether}();
        uint256 graveBefore = address(this).balance;
        uint256 received = adapter.withdrawETH(1 ether, address(this));
        assertEq(received, 1 ether);
        assertEq(address(this).balance, graveBefore + 1 ether);
        assertEq(pool.aToken().balanceOf(address(adapter)), 2 ether);
        assertEq(adapter.totalAssetsInETH(), 2 ether);
        assertEq(pool.lastWithdrawAmount(), 1 ether);
    }

    function test_withdrawAboveBalanceWithdrawsAllWithMax() public {
        adapter.depositETH{value: 1 ether}();
        uint256 graveBefore = address(this).balance;
        uint256 received = adapter.withdrawETH(5 ether, address(this));
        assertEq(received, 1 ether);
        assertEq(address(this).balance, graveBefore + 1 ether);
        assertEq(pool.aToken().balanceOf(address(adapter)), 0);
        assertEq(adapter.totalAssetsInETH(), 0);
        assertEq(pool.lastWithdrawAmount(), type(uint256).max);
    }

    function test_fullWithdrawUsesMaxAndLeavesNoDust() public {
        adapter.depositETH{value: 1 ether}();
        uint256 received = adapter.withdrawETH(1 ether, address(this));
        assertEq(received, 1 ether);
        assertEq(pool.lastWithdrawAmount(), type(uint256).max);
        assertEq(pool.aToken().balanceOf(address(adapter)), 0);
    }

    function test_zeroAmountOrZeroAssetsReturnsZeroWithoutPoolCall() public {
        uint256 callsBefore = pool.withdrawCalls();
        uint256 received = adapter.withdrawETH(0, address(this));
        assertEq(received, 0);
        assertEq(pool.withdrawCalls(), callsBefore);

        adapter.depositETH{value: 1 ether}();
        adapter.withdrawETH(1 ether, address(this));
        callsBefore = pool.withdrawCalls();
        received = adapter.withdrawETH(1 ether, address(this));
        assertEq(received, 0);
        assertEq(pool.withdrawCalls(), callsBefore);
    }

    function test_revertingPoolWithdrawRevertsAdapter() public {
        adapter.depositETH{value: 1 ether}();
        pool.setWithdrawReverts(true);
        vm.expectRevert(MockAaveV3Pool.WithdrawFailed.selector);
        adapter.withdrawETH(1 ether, address(this));
        assertEq(pool.aToken().balanceOf(address(adapter)), 1 ether);
    }

    function test_retargetedProviderRevertsDepositAndWithdraw() public {
        adapter.depositETH{value: 1 ether}();
        provider.setPool(address(weth));
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        adapter.depositETH{value: 1 ether}();
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        adapter.withdrawETH(1 ether, address(this));

        provider.setPool(address(0));
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        adapter.depositETH{value: 1 ether}();
    }

    function test_navTracksATokenAndInterestWithoutEthTransfer() public {
        adapter.depositETH{value: 2 ether}();
        assertEq(adapter.totalAssetsInETH(), pool.aToken().balanceOf(address(adapter)));
        uint256 ethBefore = address(adapter).balance;
        pool.simulateInterest{value: 0.5 ether}(address(adapter), 0.5 ether);
        assertEq(adapter.totalAssetsInETH(), 2.5 ether);
        assertEq(adapter.totalAssetsInETH(), pool.aToken().balanceOf(address(adapter)));
        assertEq(address(adapter).balance, ethBefore);

        adapter.withdrawETH(type(uint256).max, address(this));
        assertEq(adapter.totalAssetsInETH(), 0);
        assertEq(pool.aToken().balanceOf(address(adapter)), 0);
    }

    function test_absentOwnerPauseBorrowRescue() public {
        _assertSelectorAbsent(address(adapter), abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(address(adapter), abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(address(adapter), abi.encodeWithSignature("unpause()"));
        _assertSelectorAbsent(address(adapter), abi.encodeWithSignature("paused()"));
        _assertSelectorAbsent(address(adapter), abi.encodeWithSignature("pool()"));
        _assertSelectorAbsent(
            address(adapter),
            abi.encodeWithSignature(
                "borrow(address,uint256,uint256,uint16,address)", address(weth), 1, 2, 0, address(this)
            )
        );
        _assertSelectorAbsent(
            address(adapter), abi.encodeWithSignature("borrowETH(address,uint256,uint256)", address(pool), 1, 2)
        );
        _assertSelectorAbsent(
            address(adapter), abi.encodeWithSignature("rescue(address,uint256)", address(weth), uint256(1))
        );
        _assertSelectorAbsent(
            address(adapter),
            abi.encodeWithSignature("rescueToken(address,address,uint256)", address(weth), stranger, uint256(1))
        );
        assertEq(pool.variableDebt().balanceOf(address(adapter)), 0);
        adapter.depositETH{value: 1 ether}();
        assertEq(pool.variableDebt().balanceOf(address(adapter)), 0);
    }
}

contract AaveV3WethAdapterGraveTest is Test {
    address internal setter;
    address internal admin;
    address internal alice;
    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;
    MockWETH9 internal weth;
    MockAaveV3Pool internal pool;
    MockPoolAddressesProvider internal provider;
    AaveV3WethAdapter internal adapter;

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
        weth = new MockWETH9();
        pool = new MockAaveV3Pool(address(weth));
        provider = new MockPoolAddressesProvider(address(pool));
        adapter = new AaveV3WethAdapter(address(grave), address(provider), address(weth), address(pool.aToken()));
        vm.deal(alice, 10_000 ether);
        vm.deal(admin, 10_000 ether);
        vm.deal(address(this), 10_000 ether);
    }

    function _activate(address strategy) internal {
        vm.prank(admin);
        grave.scheduleStrategy(strategy);
        vm.warp(block.timestamp + grave.STRATEGY_CHANGE_DELAY());
        vm.prank(admin);
        grave.executeStrategyMigration();
    }

    function test_scheduleWarpAndExecuteFromEmpty() public {
        assertEq(grave.activeStrategy(), address(0));
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        (address pending, uint256 executeAfter) = grave.pendingStrategy();
        assertEq(pending, address(adapter));
        assertEq(executeAfter, block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
        (pending, executeAfter) = grave.pendingStrategy();
        assertEq(pending, address(0));
        assertEq(executeAfter, 0);
    }

    function test_buryDepositsAndNavIncludesAToken() public {
        _activate(address(adapter));
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 2 ether}(0);
        assertGt(nethOut, 0);
        assertEq(address(grave).balance, 0);
        assertEq(pool.aToken().balanceOf(address(adapter)), 2 ether);
        assertEq(adapter.totalAssetsInETH(), 2 ether);
        assertEq(grave.currentNAV(), 2 ether);
        assertEq(grave.protectedPrincipal(), 2 ether);
        assertFalse(pool.usingAsCollateral(address(adapter), address(weth)));
    }

    function test_interestThenHarvestSendsSurplusToReaper() public {
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: 2 ether}(0);
        uint256 principal = grave.protectedPrincipal();
        pool.simulateInterest{value: 0.4 ether}(address(adapter), 0.4 ether);
        assertEq(grave.harvestableYield(), 0.4 ether);
        uint256 harvested = grave.harvest();
        assertEq(harvested, 0.4 ether);
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(address(reaper).balance, 0.4 ether);
        assertEq(reaper.totalHarvestedETH(), 0.4 ether);
        assertEq(grave.currentNAV(), 2 ether);
        assertGe(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(pool.aToken().balanceOf(address(adapter)), 2 ether);
        assertEq(admin.balance, 10_000 ether);
    }

    function test_supplyRevertLeavesIdleEthOnGrave() public {
        _activate(address(adapter));
        pool.setSupplyReverts(true);
        vm.prank(alice);
        uint256 nethOut = grave.bury{value: 1 ether}(0);
        assertGt(nethOut, 0);
        assertEq(neth.balanceOf(alice), nethOut);
        assertEq(address(grave).balance, 1 ether);
        assertEq(pool.aToken().balanceOf(address(adapter)), 0);
        assertEq(grave.currentNAV(), 1 ether);
        assertEq(grave.protectedPrincipal(), 1 ether);
    }

    function test_lossMakesHarvestableZero() public {
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: 2 ether}(0);
        pool.simulateLoss(address(adapter), 1 ether);
        assertLt(grave.currentNAV(), grave.protectedPrincipal());
        assertEq(grave.harvestableYield(), 0);
        vm.expectRevert(Grave.NoHarvestableYield.selector);
        grave.harvest();
    }

    function test_migrateToTestInvestAdapter() public {
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        TestInvestAdapter next = new TestInvestAdapter(address(grave));
        uint256 adminBefore = admin.balance;
        _activate(address(next));
        assertEq(grave.activeStrategy(), address(next));
        assertEq(address(next).balance, 1 ether);
        assertEq(pool.aToken().balanceOf(address(adapter)), 0);
        assertEq(admin.balance, adminBefore);
    }

    function test_revertingAaveWithdrawIsRecordedFailureNotSwitch() public {
        _activate(address(adapter));
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        TestInvestAdapter next = new TestInvestAdapter(address(grave));
        pool.setWithdrawReverts(true);
        vm.prank(admin);
        grave.scheduleStrategy(address(next));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
        assertEq(grave.pendingWithdrawFailures(), 1);
        assertEq(pool.aToken().balanceOf(address(adapter)), 1 ether);
        assertEq(address(next).balance, 0);
        assertEq(grave.impairedCapital(), 0);
    }
}
