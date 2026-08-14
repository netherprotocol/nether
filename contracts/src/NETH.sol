// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract NETH is ERC20, ERC20Burnable {
    address public grave;
    address public graveSetter;

    error ZeroAddress();
    error NotGraveSetter();
    error GraveAlreadySet();
    error NotGrave();
    error NotContract();

    event GraveSet(address indexed grave);

    constructor(address graveSetter_) ERC20("Nether", "NETH") {
        if (graveSetter_ == address(0)) {
            revert ZeroAddress();
        }
        graveSetter = graveSetter_;
    }

    function setGrave(address grave_) external {
        if (grave != address(0)) {
            revert GraveAlreadySet();
        }
        if (msg.sender != graveSetter) {
            revert NotGraveSetter();
        }
        if (grave_ == address(0)) {
            revert ZeroAddress();
        }
        if (grave_.code.length == 0) {
            revert NotContract();
        }
        grave = grave_;
        graveSetter = address(0);
        emit GraveSet(grave_);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != grave) {
            revert NotGrave();
        }
        _mint(to, amount);
    }
}
