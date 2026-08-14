// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {NETH} from "src/NETH.sol";
import {GraveStub} from "test/mocks/GraveStub.sol";

contract NotGraveMinter {
    function mint(NETH neth, address to, uint256 amount) external {
        neth.mint(to, amount);
    }
}

contract NETHTest is Test {
    address internal setter;
    address internal alice;
    address internal bob;
    NETH internal neth;

    event GraveSet(address indexed grave);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setUp() public {
        setter = makeAddr("setter");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        neth = new NETH(setter);
    }

    function _lockStub() internal returns (GraveStub stub) {
        stub = new GraveStub(neth);
        vm.prank(setter);
        neth.setGrave(address(stub));
    }

    function _assertSelectorAbsent(bytes memory callData) internal {
        (bool ok, bytes memory data) = address(neth).call(callData);
        assertFalse(ok);
        assertEq(data.length, 0);
    }

    function test_metadata() public view {
        assertEq(neth.name(), "Nether");
        assertEq(neth.symbol(), "NETH");
        assertEq(neth.decimals(), 18);
    }

    function test_uninitializedState() public view {
        assertEq(neth.totalSupply(), 0);
        assertEq(neth.grave(), address(0));
        assertEq(neth.graveSetter(), setter);
        assertEq(neth.balanceOf(setter), 0);
    }

    function test_constructorRevertsZeroAddress() public {
        vm.expectRevert(NETH.ZeroAddress.selector);
        new NETH(address(0));
    }

    function test_mintRevertsBeforeSetGrave() public {
        vm.prank(setter);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        vm.prank(alice);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        NotGraveMinter other = new NotGraveMinter();
        vm.expectRevert(NETH.NotGrave.selector);
        other.mint(neth, alice, 1);

        assertEq(neth.totalSupply(), 0);
    }

    function test_setGraveRevertsZeroAddress() public {
        vm.prank(setter);
        vm.expectRevert(NETH.ZeroAddress.selector);
        neth.setGrave(address(0));
    }

    function test_setGraveRevertsEoa() public {
        vm.prank(setter);
        vm.expectRevert(NETH.NotContract.selector);
        neth.setGrave(alice);
    }

    function test_setGraveRevertsUnauthorized() public {
        GraveStub stub = new GraveStub(neth);
        vm.prank(alice);
        vm.expectRevert(NETH.NotGraveSetter.selector);
        neth.setGrave(address(stub));
    }

    function test_setGraveLocksOnceAndClearsSetter() public {
        GraveStub stub = new GraveStub(neth);

        vm.expectEmit(true, false, false, true, address(neth));
        emit GraveSet(address(stub));
        vm.prank(setter);
        neth.setGrave(address(stub));

        assertEq(neth.grave(), address(stub));
        assertEq(neth.graveSetter(), address(0));

        vm.prank(setter);
        vm.expectRevert(NETH.GraveAlreadySet.selector);
        neth.setGrave(address(stub));

        GraveStub other = new GraveStub(neth);
        vm.prank(alice);
        vm.expectRevert(NETH.GraveAlreadySet.selector);
        neth.setGrave(address(other));
    }

    function test_stubGraveCanMint() public {
        GraveStub stub = _lockStub();
        uint256 amount = 1e18;

        vm.expectEmit(true, true, false, true, address(neth));
        emit Transfer(address(0), alice, amount);
        stub.mint(alice, amount);

        assertEq(neth.balanceOf(alice), amount);
        assertEq(neth.totalSupply(), amount);
    }

    function test_mintRevertsFromNonGraveAfterLock() public {
        GraveStub stub = _lockStub();

        vm.prank(setter);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        vm.prank(alice);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        NotGraveMinter other = new NotGraveMinter();
        vm.expectRevert(NETH.NotGrave.selector);
        other.mint(neth, alice, 1);

        assertEq(neth.grave(), address(stub));
        assertEq(neth.totalSupply(), 0);
    }

    function test_noAdminMintPath() public {
        GraveStub stub = _lockStub();

        _assertSelectorAbsent(abi.encodeWithSignature("owner()"));
        _assertSelectorAbsent(abi.encodeWithSignature("transferOwnership(address)", alice));
        _assertSelectorAbsent(abi.encodeWithSignature("grantRole(bytes32,address)", bytes32(0), alice));
        _assertSelectorAbsent(abi.encodeWithSignature("DEFAULT_ADMIN_ROLE()"));
        _assertSelectorAbsent(abi.encodeWithSignature("MINTER_ROLE()"));

        vm.prank(setter);
        vm.expectRevert(NETH.NotGrave.selector);
        neth.mint(alice, 1);

        assertEq(neth.graveSetter(), address(0));
        assertEq(neth.grave(), address(stub));
        assertEq(neth.totalSupply(), 0);
    }

    function test_holderBurnDecreasesBalanceAndSupply() public {
        GraveStub stub = _lockStub();
        stub.mint(alice, 100);

        vm.expectEmit(true, true, false, true, address(neth));
        emit Transfer(alice, address(0), 40);
        vm.prank(alice);
        neth.burn(40);

        assertEq(neth.balanceOf(alice), 60);
        assertEq(neth.totalSupply(), 60);
    }

    function test_reaperStyleBurnFromStubBalance() public {
        GraveStub stub = _lockStub();
        stub.mint(address(stub), 50);

        vm.prank(address(stub));
        neth.burn(50);

        assertEq(neth.balanceOf(address(stub)), 0);
        assertEq(neth.totalSupply(), 0);
    }

    function test_burnFromRequiresAllowance() public {
        GraveStub stub = _lockStub();
        stub.mint(alice, 100);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, bob, 0, 25));
        neth.burnFrom(alice, 25);

        vm.prank(alice);
        neth.approve(bob, 25);

        vm.prank(bob);
        neth.burnFrom(alice, 25);

        assertEq(neth.balanceOf(alice), 75);
        assertEq(neth.totalSupply(), 75);
        assertEq(neth.allowance(alice, bob), 0);
    }

    function test_transferApproveTransferFromDoNotMint() public {
        GraveStub stub = _lockStub();
        stub.mint(alice, 100);
        uint256 supply = neth.totalSupply();

        vm.expectEmit(true, true, false, true, address(neth));
        emit Transfer(alice, bob, 30);
        vm.prank(alice);
        assertTrue(neth.transfer(bob, 30));

        vm.expectEmit(true, true, false, true, address(neth));
        emit Approval(alice, bob, 20);
        vm.prank(alice);
        neth.approve(bob, 20);

        vm.expectEmit(true, true, false, true, address(neth));
        emit Transfer(alice, bob, 20);
        vm.prank(bob);
        assertTrue(neth.transferFrom(alice, bob, 20));

        assertEq(neth.balanceOf(alice), 50);
        assertEq(neth.balanceOf(bob), 50);
        assertEq(neth.totalSupply(), supply);
        assertEq(neth.allowance(alice, bob), 0);
    }

    function test_noPauseUnpauseOrBlacklist() public {
        _assertSelectorAbsent(abi.encodeWithSignature("pause()"));
        _assertSelectorAbsent(abi.encodeWithSignature("unpause()"));
        _assertSelectorAbsent(abi.encodeWithSignature("paused()"));
        _assertSelectorAbsent(abi.encodeWithSignature("blacklist(address)", alice));
        _assertSelectorAbsent(abi.encodeWithSignature("isBlacklisted(address)", alice));
        _assertSelectorAbsent(abi.encodeWithSignature("addToBlacklist(address)", alice));
    }
}
