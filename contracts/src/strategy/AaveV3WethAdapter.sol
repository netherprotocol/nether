// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IStrategyAdapter} from "../interfaces/IStrategyAdapter.sol";
import {IWETH9} from "../interfaces/IWETH9.sol";
import {IAaveV3Pool} from "../interfaces/IAaveV3Pool.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IAToken} from "../interfaces/IAToken.sol";

contract AaveV3WethAdapter is IStrategyAdapter, ReentrancyGuard {
    address public immutable grave;
    IPoolAddressesProvider public immutable provider;
    IWETH9 public immutable weth;
    IAToken public immutable aWeth;

    error ZeroAddress();
    error NotContract();
    error NotGrave();
    error NotWeth();
    error InvalidPool();
    error InvalidAToken();
    error ZeroDeposit();
    error InvalidRecipient();

    constructor(address grave_, address provider_, address weth_, address aWeth_) {
        _requireContract(grave_);
        _requireContract(provider_);
        _requireContract(weth_);
        _requireContract(aWeth_);

        address pool = IPoolAddressesProvider(provider_).getPool();
        if (pool == address(0) || pool != IAToken(aWeth_).POOL()) {
            revert InvalidPool();
        }
        if (IAToken(aWeth_).UNDERLYING_ASSET_ADDRESS() != weth_) {
            revert InvalidAToken();
        }

        grave = grave_;
        provider = IPoolAddressesProvider(provider_);
        weth = IWETH9(weth_);
        aWeth = IAToken(aWeth_);
    }

    receive() external payable {
        if (msg.sender != address(weth)) {
            revert NotWeth();
        }
    }

    function depositETH() external payable nonReentrant {
        if (msg.sender != grave) {
            revert NotGrave();
        }
        if (msg.value == 0) {
            revert ZeroDeposit();
        }

        IAaveV3Pool pool = _pool();
        weth.deposit{value: msg.value}();
        bool approved = weth.approve(address(pool), msg.value);
        if (!approved) {
            revert InvalidPool();
        }
        pool.supply(address(weth), msg.value, address(this), 0);
        pool.setUserUseReserveAsCollateral(address(weth), false);
    }

    function withdrawETH(uint256 amount, address recipient) external nonReentrant returns (uint256 received) {
        if (msg.sender != grave) {
            revert NotGrave();
        }
        if (recipient != grave) {
            revert InvalidRecipient();
        }

        uint256 assets = aWeth.balanceOf(address(this));
        uint256 toWithdraw = amount < assets ? amount : assets;
        if (toWithdraw == 0) {
            return 0;
        }

        IAaveV3Pool pool = _pool();
        uint256 request = toWithdraw == assets ? type(uint256).max : toWithdraw;
        uint256 wethBefore = weth.balanceOf(address(this));
        uint256 receivedWeth = pool.withdraw(address(weth), request, address(this));
        uint256 delta = weth.balanceOf(address(this)) - wethBefore;
        uint256 unwrap = delta < receivedWeth ? delta : receivedWeth;
        weth.withdraw(unwrap);
        Address.sendValue(payable(recipient), unwrap);
        return unwrap;
    }

    function totalAssetsInETH() external view returns (uint256) {
        return aWeth.balanceOf(address(this));
    }

    function underlying() external view returns (address) {
        return address(weth);
    }

    function _pool() internal view returns (IAaveV3Pool) {
        address pool = provider.getPool();
        if (pool == address(0) || pool != aWeth.POOL()) {
            revert InvalidPool();
        }
        return IAaveV3Pool(pool);
    }

    function _requireContract(address account) internal view {
        if (account == address(0)) {
            revert ZeroAddress();
        }
        if (account.code.length == 0) {
            revert NotContract();
        }
    }
}
