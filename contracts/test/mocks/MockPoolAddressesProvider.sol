// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

contract MockPoolAddressesProvider {
    address internal _pool;

    constructor(address pool_) {
        _pool = pool_;
    }

    function getPool() external view returns (address) {
        return _pool;
    }

    function setPool(address pool_) external {
        _pool = pool_;
    }
}
