// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IStrategyAdapter} from "src/interfaces/IStrategyAdapter.sol";

contract ScaffoldTest is Test {
    function test_projectCompiles() public pure {
        assertTrue(type(IStrategyAdapter).interfaceId != bytes4(0));
    }
}
