// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {EraMathHarness} from "test/harness/EraMathHarness.sol";

contract GraveHandler is Test {
    Grave public grave;
    NETH public neth;
    address[] public actors;

    uint256 public ghostProtected;
    uint256 public ghostMinted;
    uint256 public ghostDonated;

    constructor(Grave grave_, NETH neth_, address[] memory actors_) {
        grave = grave_;
        neth = neth_;
        actors = actors_;
    }

    function bury(uint256 actorSeed, uint256 amount, uint256 minNethOut) public {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 0, 200 ether);
        minNethOut = bound(minNethOut, 0, 20_000_000 ether);

        uint256 principalBefore = grave.protectedPrincipal();
        uint256 mintedBefore = grave.totalNethMinted();
        uint256 eraBefore = grave.currentEra();
        uint256 actorEthBefore = actor.balance;
        uint256 graveEthBefore = address(grave).balance;

        vm.deal(actor, actor.balance + amount);
        vm.prank(actor);
        try grave.bury{value: amount}(minNethOut) returns (uint256 nethOut) {
            ghostProtected += amount;
            ghostMinted += nethOut;
            assertEq(grave.protectedPrincipal(), principalBefore + amount);
            assertEq(grave.totalNethMinted(), mintedBefore + nethOut);
            assertGe(grave.currentEra(), eraBefore);
            assertGt(nethOut, 0);
            assertEq(actor.balance, actorEthBefore);
            assertEq(address(grave).balance, graveEthBefore + amount);
        } catch {
            assertEq(grave.protectedPrincipal(), principalBefore);
            assertEq(grave.totalNethMinted(), mintedBefore);
            assertEq(grave.currentEra(), eraBefore);
        }
    }

    function donate(uint256 amount) public {
        amount = bound(amount, 0, 20 ether);
        uint256 principal = grave.protectedPrincipal();
        uint256 minted = grave.totalNethMinted();
        uint256 supply = neth.totalSupply();
        vm.deal(address(this), amount);
        (bool ok,) = address(grave).call{value: amount}("");
        if (ok) {
            ghostDonated += amount;
        }
        assertEq(grave.protectedPrincipal(), principal);
        assertEq(grave.totalNethMinted(), minted);
        assertEq(neth.totalSupply(), supply);
    }

    function transferNeth(uint256 fromSeed, uint256 toSeed, uint256 amount) public {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 bal = neth.balanceOf(from);
        if (bal == 0 || to == address(0)) {
            return;
        }
        amount = bound(amount, 0, bal);
        uint256 supply = neth.totalSupply();
        vm.prank(from);
        assertTrue(neth.transfer(to, amount));
        assertEq(neth.totalSupply(), supply);
    }

    function burnNeth(uint256 actorSeed, uint256 amount) public {
        address actor = actors[actorSeed % actors.length];
        uint256 bal = neth.balanceOf(actor);
        if (bal == 0) {
            return;
        }
        amount = bound(amount, 0, bal);
        uint256 supply = neth.totalSupply();
        vm.prank(actor);
        neth.burn(amount);
        assertEq(neth.totalSupply(), supply - amount);
        assertLe(neth.totalSupply(), grave.totalNethMinted());
    }

    receive() external payable {}
}

contract GraveInvariantTest is Test {
    GraveHandler internal handler;
    Grave internal grave;
    NETH internal neth;
    EraMathHarness internal math;

    function setUp() public {
        address setter = makeAddr("setter");
        neth = new NETH(setter);
        grave = new Grave(address(neth));
        math = new EraMathHarness();
        vm.prank(setter);
        neth.setGrave(address(grave));

        address[] memory actors = new address[](3);
        actors[0] = makeAddr("alice");
        actors[1] = makeAddr("bob");
        actors[2] = makeAddr("carol");
        handler = new GraveHandler(grave, neth, actors);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = GraveHandler.bury.selector;
        selectors[1] = GraveHandler.donate.selector;
        selectors[2] = GraveHandler.transferNeth.selector;
        selectors[3] = GraveHandler.burnNeth.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_protectedPrincipalEqualsGhost() public view {
        assertEq(grave.protectedPrincipal(), handler.ghostProtected());
    }

    function invariant_totalMintedEqualsGhost() public view {
        assertEq(grave.totalNethMinted(), handler.ghostMinted());
    }

    function invariant_navAtLeastPrincipal() public view {
        assertGe(grave.currentNAV(), grave.protectedPrincipal());
    }

    function invariant_navEqualsPrincipalPlusDonations() public view {
        assertEq(grave.currentNAV(), grave.protectedPrincipal() + handler.ghostDonated());
    }

    function invariant_supplyLeMinted() public view {
        assertLe(neth.totalSupply(), grave.totalNethMinted());
    }

    function invariant_harvestableIsSurplus() public view {
        uint256 nav = grave.currentNAV();
        uint256 principal = grave.protectedPrincipal();
        uint256 harvestable = grave.harvestableYield();
        if (nav > principal) {
            assertEq(harvestable, nav - principal);
        } else {
            assertEq(harvestable, 0);
        }
    }

    function invariant_eraRateNeverIncreasesFromGenesis() public view {
        uint256 era = grave.currentEra();
        assertLe(era, math.maxEra());
        assertLe(grave.currentRewardRate(), math.rewardRate(0));
        assertGe(grave.currentEraCapacity(), math.eraCapacity(0));
        assertLe(grave.currentEraBuried(), grave.currentEraCapacity());
    }

    function invariant_noStrategyAndIdleBacking() public view {
        assertEq(grave.activeStrategy(), address(0));
        assertEq(grave.currentNAV(), address(grave).balance);
    }
}
