// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IStrategyAdapter} from "src/interfaces/IStrategyAdapter.sol";

contract TestInvestAdapter is IStrategyAdapter {
    address public immutable grave;

    uint256 public reportedNav = type(uint256).max;
    uint256 public realizable = type(uint256).max;

    error ZeroAddress();
    error NotGrave();

    constructor(address grave_) {
        if (grave_ == address(0)) {
            revert ZeroAddress();
        }
        grave = grave_;
    }

    function depositETH() external payable {
        if (msg.sender != grave) {
            revert NotGrave();
        }
    }

    function withdrawETH(uint256 amount, address recipient) external returns (uint256 received) {
        if (msg.sender != grave) {
            revert NotGrave();
        }
        uint256 cap = address(this).balance;
        if (realizable < cap) {
            cap = realizable;
        }
        received = amount < cap ? amount : cap;
        if (received > 0) {
            Address.sendValue(payable(recipient), received);
        }
    }

    function totalAssetsInETH() external view returns (uint256) {
        if (reportedNav == type(uint256).max) {
            return address(this).balance;
        }
        return reportedNav;
    }

    function underlying() external pure returns (address) {
        return address(0);
    }

    function setReportedNav(uint256 nav) external {
        reportedNav = nav;
    }

    function setRealizable(uint256 amount) external {
        realizable = amount;
    }

    function simulateProfit() external payable {}

    function simulateLoss(uint256 amount) external {
        Address.sendValue(payable(address(0xdead)), amount);
    }
}
