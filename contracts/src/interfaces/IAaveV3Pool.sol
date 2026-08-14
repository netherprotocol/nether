// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function setUserUseReserveAsCollateral(address asset, bool useAsCollateral) external;
}
