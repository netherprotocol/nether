// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {AaveV3WethAdapter} from "src/strategy/AaveV3WethAdapter.sol";
import {IWETH9} from "src/interfaces/IWETH9.sol";
import {IAaveV3Pool} from "src/interfaces/IAaveV3Pool.sol";
import {IPoolAddressesProvider} from "src/interfaces/IPoolAddressesProvider.sol";
import {IAToken} from "src/interfaces/IAToken.sol";
import {TestInvestAdapter} from "test/mocks/TestInvestAdapter.sol";

interface IERC20View {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract AaveV3WethAdapterForkTest is Test {
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address internal constant EXPECTED_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address internal constant A_WETH = 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7;
    address internal constant VARIABLE_DEBT_WETH = 0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E;

    address internal setter;
    address internal admin;
    address internal alice;
    NETH internal neth;
    Grave internal grave;
    Reaper internal reaper;
    AaveV3WethAdapter internal adapter;
    address internal pool;

    receive() external payable {}

    function setUp() public {
        vm.createSelectFork("base");
        pool = IPoolAddressesProvider(PROVIDER).getPool();
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
        adapter = new AaveV3WethAdapter(address(grave), PROVIDER, WETH, A_WETH);
        vm.deal(alice, 10_000 ether);
        vm.deal(admin, 10_000 ether);
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        vm.prank(admin);
        grave.executeStrategyMigration();
    }

    function _assertSelectorAbsent(address target, bytes memory callData) internal {
        (bool ok, bytes memory data) = target.call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function _pokeReserve() internal {
        address whale = makeAddr("whale");
        vm.deal(whale, 2 ether);
        vm.prank(whale);
        IWETH9(WETH).deposit{value: 1 ether}();
        vm.prank(whale);
        IWETH9(WETH).approve(pool, 1 ether);
        vm.prank(whale);
        IAaveV3Pool(pool).supply(WETH, 0.01 ether, whale, 0);
    }

    function test_pinsAndCanonicalWeth() public {
        assertEq(pool, EXPECTED_POOL);
        assertEq(IAToken(A_WETH).POOL(), EXPECTED_POOL);
        assertEq(IAToken(A_WETH).UNDERLYING_ASSET_ADDRESS(), WETH);
        assertEq(adapter.underlying(), WETH);
        assertEq(address(adapter.weth()), WETH);
        assertEq(address(adapter.aWeth()), A_WETH);
        assertEq(IERC20View(WETH).decimals(), 18);
        assertEq(IERC20View(A_WETH).decimals(), 18);

        uint256 beforeBal = address(this).balance;
        IWETH9(WETH).deposit{value: 1 ether}();
        assertEq(IWETH9(WETH).balanceOf(address(this)), 1 ether);
        IWETH9(WETH).withdraw(1 ether);
        assertEq(address(this).balance, beforeBal);
        assertEq(IWETH9(WETH).balanceOf(address(this)), 0);
    }

    function test_burySuppliesAndLeavesNoIdle() public {
        uint256 adminBefore = admin.balance;
        vm.prank(alice);
        grave.bury{value: 2 ether}(0);
        assertEq(address(grave).balance, 0);
        uint256 aBal = IAToken(A_WETH).balanceOf(address(adapter));
        assertApproxEqAbs(aBal, 2 ether, 2);
        assertEq(adapter.totalAssetsInETH(), aBal);
        assertApproxEqAbs(grave.currentNAV(), grave.protectedPrincipal(), 2);
        assertEq(IERC20View(VARIABLE_DEBT_WETH).balanceOf(address(adapter)), 0);
        vm.prank(address(adapter));
        IAaveV3Pool(pool).setUserUseReserveAsCollateral(WETH, false);
        assertEq(admin.balance, adminBefore);
        _assertSelectorAbsent(
            address(adapter),
            abi.encodeWithSignature("borrow(address,uint256,uint256,uint16,address)", WETH, 1, 2, 0, address(adapter))
        );
    }

    function test_harvestAfterWarpAndPoke() public {
        vm.prank(alice);
        grave.bury{value: 5 ether}(0);
        uint256 deposited = adapter.totalAssetsInETH();
        uint256 principal = grave.protectedPrincipal();
        vm.warp(block.timestamp + 7 days);
        _pokeReserve();
        uint256 assetsAfter = adapter.totalAssetsInETH();
        assertGe(assetsAfter, deposited);
        uint256 surplus = grave.harvestableYield();
        if (surplus > 0) {
            uint256 harvested = grave.harvest();
            assertGt(harvested, 0);
            assertLe(harvested, surplus);
            assertEq(address(reaper).balance, harvested);
            assertGe(grave.currentNAV(), grave.protectedPrincipal());
            assertEq(grave.protectedPrincipal(), principal);
        }
        assertEq(IERC20View(VARIABLE_DEBT_WETH).balanceOf(address(adapter)), 0);
    }

    function test_migrateToMockAndBackToAave() public {
        vm.prank(alice);
        grave.bury{value: 1 ether}(0);
        TestInvestAdapter next = new TestInvestAdapter(address(grave));
        uint256 adminBefore = admin.balance;
        vm.prank(admin);
        grave.scheduleStrategy(address(next));
        vm.warp(block.timestamp + 14 days);
        uint256 navAtMigrate = adapter.totalAssetsInETH();
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(next));
        assertGt(address(next).balance, 0);
        assertApproxEqAbs(address(next).balance, navAtMigrate, 2);
        assertEq(admin.balance, adminBefore);
        assertEq(IERC20View(VARIABLE_DEBT_WETH).balanceOf(address(adapter)), 0);

        uint256 ethOnMock = address(next).balance;
        vm.prank(admin);
        grave.scheduleStrategy(address(adapter));
        vm.warp(block.timestamp + 14 days);
        vm.prank(admin);
        grave.executeStrategyMigration();
        assertEq(grave.activeStrategy(), address(adapter));
        assertApproxEqAbs(IAToken(A_WETH).balanceOf(address(adapter)), ethOnMock, 2);
        assertEq(address(next).balance, 0);
        assertEq(admin.balance, adminBefore);
        assertEq(IERC20View(VARIABLE_DEBT_WETH).balanceOf(address(adapter)), 0);
    }
}
