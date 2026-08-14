// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {AaveV3WethAdapter} from "src/strategy/AaveV3WethAdapter.sol";
import {MockWETH9} from "test/mocks/MockWETH9.sol";
import {MockAaveV3Pool} from "test/mocks/MockAaveV3Pool.sol";
import {MockPoolAddressesProvider} from "test/mocks/MockPoolAddressesProvider.sol";

contract AaveV3WethAdapterFuzzTest is Test {
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
        vm.deal(address(this), type(uint128).max);
        vm.deal(stranger, type(uint128).max);
    }

    function testFuzz_depositThenWithdrawReturnsMinAmountNav(uint256 depositAmt, uint256 withdrawAmt) public {
        depositAmt = bound(depositAmt, 1, 200 ether);
        adapter.depositETH{value: depositAmt}();
        uint256 nav = adapter.totalAssetsInETH();
        uint256 expected = withdrawAmt < nav ? withdrawAmt : nav;
        uint256 graveBefore = address(this).balance;
        uint256 received = adapter.withdrawETH(withdrawAmt, address(this));
        assertEq(received, expected);
        assertEq(address(this).balance, graveBefore + received);
        assertFalse(pool.usingAsCollateral(address(adapter), address(weth)));
        assertEq(pool.variableDebt().balanceOf(address(adapter)), 0);
    }

    function testFuzz_conservationAcrossWithdrawAndInterest(uint256 d1, uint256 d2, uint256 interest, uint256 w1)
        public
    {
        d1 = bound(d1, 1, 80 ether);
        d2 = bound(d2, 1, 80 ether);
        interest = bound(interest, 0, 40 ether);
        adapter.depositETH{value: d1}();
        adapter.depositETH{value: d2}();
        pool.simulateInterest{value: interest}(address(adapter), interest);
        uint256 cumulative = d1 + d2 + interest;
        w1 = bound(w1, 0, cumulative);
        uint256 received = adapter.withdrawETH(w1, address(this));
        uint256 remaining = adapter.totalAssetsInETH();
        assertEq(received + remaining, cumulative);
        assertEq(remaining, pool.aToken().balanceOf(address(adapter)));
        assertFalse(pool.usingAsCollateral(address(adapter), address(weth)));
        assertEq(pool.variableDebt().balanceOf(address(adapter)), 0);
    }

    function testFuzz_onlyGraveCanDepositOrWithdraw(address caller, uint256 amount) public {
        vm.assume(caller != address(this));
        amount = bound(amount, 1, 10 ether);
        vm.deal(caller, amount);
        vm.prank(caller);
        vm.expectRevert(AaveV3WethAdapter.NotGrave.selector);
        adapter.depositETH{value: amount}();
        vm.prank(caller);
        vm.expectRevert(AaveV3WethAdapter.NotGrave.selector);
        adapter.withdrawETH(amount, address(this));
    }

    function testFuzz_recipientOtherThanGraveReverts(address recipient, uint256 amount) public {
        vm.assume(recipient != address(this));
        amount = bound(amount, 1, 10 ether);
        adapter.depositETH{value: amount}();
        vm.expectRevert(AaveV3WethAdapter.InvalidRecipient.selector);
        adapter.withdrawETH(amount, recipient);
    }

    function testFuzz_retargetedProviderReverts(address newPool, uint256 amount) public {
        vm.assume(newPool != address(pool));
        amount = bound(amount, 1, 10 ether);
        adapter.depositETH{value: amount}();
        provider.setPool(newPool);
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        adapter.depositETH{value: amount}();
        vm.expectRevert(AaveV3WethAdapter.InvalidPool.selector);
        adapter.withdrawETH(amount, address(this));
        assertEq(pool.variableDebt().balanceOf(address(adapter)), 0);
    }
}
