// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

interface IStrategyAdapter {
    function depositETH() external payable;
    function withdrawETH(uint256 amount, address recipient) external returns (uint256 received);
    function totalAssetsInETH() external view returns (uint256);
    function underlying() external view returns (address);
}
