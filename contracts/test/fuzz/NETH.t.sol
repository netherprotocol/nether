// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NETH} from "src/NETH.sol";
import {GraveStub} from "test/mocks/GraveStub.sol";

contract NETHFuzzTest is Test {
    address internal setter;
    NETH internal neth;
    GraveStub internal stub;

    function setUp() public {
        setter = makeAddr("setter");
        neth = new NETH(setter);
        stub = new GraveStub(neth);
        vm.prank(setter);
        neth.setGrave(address(stub));
    }

    function testFuzz_mintRevertsBeforeSetGrave(address caller, address to, uint256 amount) public {
        NETH unlocked = new NETH(setter);
        vm.prank(caller);
        vm.expectRevert(NETH.NotGrave.selector);
        unlocked.mint(to, amount);
        assertEq(unlocked.totalSupply(), 0);
        assertEq(unlocked.grave(), address(0));
    }

    function testFuzz_noAdminPathCanMint(address caller, address to, uint256 amount) public {
        vm.assume(caller != address(stub));
        uint256 supplyBefore = neth.totalSupply();

        vm.prank(caller);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(to, amount);

        assertEq(neth.totalSupply(), supplyBefore);
        assertEq(neth.graveSetter(), address(0));
    }

    function testFuzz_onlyGraveCanMint(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 0, type(uint128).max);

        uint256 supplyBefore = neth.totalSupply();
        stub.mint(to, amount);

        assertEq(neth.balanceOf(to), amount);
        assertEq(neth.totalSupply(), supplyBefore + amount);
    }

    function testFuzz_setterCannotMint(address to, uint256 amount) public {
        uint256 supplyBefore = neth.totalSupply();
        vm.prank(setter);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(to, amount);
        assertEq(neth.totalSupply(), supplyBefore);
    }

    function testFuzz_setGraveSucceedsAtMostOnce(address caller, address grave_) public {
        vm.prank(caller);
        vm.expectRevert(NETH.GraveAlreadySet.selector);
        neth.setGrave(grave_);

        assertEq(neth.grave(), address(stub));
        assertEq(neth.graveSetter(), address(0));
    }

    function testFuzz_burnCannotIncreaseSupply(address holder, uint256 minted, uint256 burned) public {
        vm.assume(holder != address(0));
        minted = bound(minted, 0, type(uint128).max);
        stub.mint(holder, minted);

        uint256 supplyBefore = neth.totalSupply();
        if (burned > minted) {
            vm.prank(holder);
            vm.expectRevert();
            neth.burn(burned);
            assertEq(neth.totalSupply(), supplyBefore);
        } else {
            vm.prank(holder);
            neth.burn(burned);
            assertEq(neth.totalSupply(), supplyBefore - burned);
        }
    }

    function testFuzz_transferNeverChangesTotalSupply(address from, address to, uint256 minted, uint256 sent) public {
        vm.assume(from != address(0));
        minted = bound(minted, 0, type(uint128).max);
        stub.mint(from, minted);

        uint256 supply = neth.totalSupply();
        sent = bound(sent, 0, type(uint128).max);

        vm.prank(from);
        if (to == address(0) || sent > minted) {
            vm.expectRevert();
            neth.transfer(to, sent);
        } else {
            assertTrue(neth.transfer(to, sent));
        }
        assertEq(neth.totalSupply(), supply);
    }

    function testFuzz_transferFromNeverChangesTotalSupply(
        address from,
        address spender,
        address to,
        uint256 minted,
        uint256 sent
    ) public {
        vm.assume(from != address(0));
        vm.assume(spender != address(0));
        minted = bound(minted, 0, type(uint128).max);
        stub.mint(from, minted);

        uint256 supply = neth.totalSupply();
        sent = bound(sent, 0, minted);

        vm.prank(from);
        neth.approve(spender, sent);

        vm.prank(spender);
        if (to == address(0)) {
            vm.expectRevert();
            neth.transferFrom(from, to, sent);
        } else {
            assertTrue(neth.transferFrom(from, to, sent));
        }
        assertEq(neth.totalSupply(), supply);
    }

    function testFuzz_approveNeverChangesTotalSupply(address owner, address spender, uint256 amount) public {
        vm.assume(owner != address(0));
        uint256 supply = neth.totalSupply();

        vm.prank(owner);
        if (spender == address(0)) {
            vm.expectRevert();
            neth.approve(spender, amount);
        } else {
            neth.approve(spender, amount);
        }
        assertEq(neth.totalSupply(), supply);
    }
}
