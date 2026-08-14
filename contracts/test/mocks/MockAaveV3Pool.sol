// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {MockWETH9} from "./MockWETH9.sol";

contract MockAToken {
    address public immutable POOL;
    address public immutable UNDERLYING_ASSET_ADDRESS;
    mapping(address => uint256) public balanceOf;

    error NotPool();

    constructor(address pool_, address underlying_) {
        POOL = pool_;
        UNDERLYING_ASSET_ADDRESS = underlying_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != POOL) {
            revert NotPool();
        }
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != POOL) {
            revert NotPool();
        }
        balanceOf[from] -= amount;
    }
}

contract MockVariableDebtToken {
    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}

contract MockAaveV3Pool {
    MockWETH9 public immutable weth;
    MockAToken public immutable aToken;
    MockVariableDebtToken public immutable variableDebt;

    mapping(address => mapping(address => bool)) public usingAsCollateral;

    address public lastSupplyAsset;
    uint256 public lastSupplyAmount;
    address public lastSupplyOnBehalf;
    uint16 public lastReferralCode;
    uint256 public lastWithdrawAmount;
    uint256 public supplyCalls;
    uint256 public withdrawCalls;

    bool public supplyReverts;
    bool public withdrawReverts;

    error SupplyFailed();
    error WithdrawFailed();

    constructor(address weth_) {
        weth = MockWETH9(payable(weth_));
        aToken = new MockAToken(address(this), weth_);
        variableDebt = new MockVariableDebtToken();
    }

    function setSupplyReverts(bool value) external {
        supplyReverts = value;
    }

    function setWithdrawReverts(bool value) external {
        withdrawReverts = value;
    }

    function simulateInterest(address user, uint256 amount) external {
        aToken.mint(user, amount);
        weth.mint(address(this), amount);
    }

    function simulateLoss(address user, uint256 amount) external {
        aToken.burn(user, amount);
        weth.transfer(address(0xdead), amount);
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external {
        if (supplyReverts) {
            revert SupplyFailed();
        }
        supplyCalls += 1;
        lastSupplyAsset = asset;
        lastSupplyAmount = amount;
        lastSupplyOnBehalf = onBehalfOf;
        lastReferralCode = referralCode;
        weth.transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
        usingAsCollateral[onBehalfOf][asset] = true;
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        if (withdrawReverts) {
            revert WithdrawFailed();
        }
        withdrawCalls += 1;
        lastWithdrawAmount = amount;
        uint256 bal = aToken.balanceOf(msg.sender);
        uint256 toBurn = amount == type(uint256).max ? bal : amount;
        if (toBurn > bal) {
            toBurn = bal;
        }
        aToken.burn(msg.sender, toBurn);
        weth.transfer(to, toBurn);
        return toBurn;
    }

    function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external {
        if (usingAsCollateral[msg.sender][asset] == useAsCollateral) {
            return;
        }
        usingAsCollateral[msg.sender][asset] = useAsCollateral;
    }
}
