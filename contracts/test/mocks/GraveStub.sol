// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {NETH} from "src/NETH.sol";

contract GraveStub {
    NETH public immutable neth;

    constructor(NETH neth_) {
        neth = neth_;
    }

    function mint(address to, uint256 amount) external {
        neth.mint(to, amount);
    }
}
