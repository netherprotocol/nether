// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

interface IAToken {
    function balanceOf(address) external view returns (uint256);
    function POOL() external view returns (address);
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}
