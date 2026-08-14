// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

contract MockWETH9 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error TransferFailed();

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 wad) external {
        balanceOf[msg.sender] -= wad;
        (bool ok,) = msg.sender.call{value: wad}("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    function approve(address guy, uint256 wad) external returns (bool) {
        allowance[msg.sender][guy] = wad;
        return true;
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        uint256 allowed = allowance[src][msg.sender];
        if (src != msg.sender && allowed != type(uint256).max) {
            allowance[src][msg.sender] = allowed - wad;
        }
        balanceOf[src] -= wad;
        balanceOf[dst] += wad;
        return true;
    }
}
