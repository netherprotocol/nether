// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function approve(address guy, uint256 wad) external returns (bool);
    function transfer(address dst, uint256 wad) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}
