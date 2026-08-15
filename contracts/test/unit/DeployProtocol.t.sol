// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DeployProtocol} from "script/DeployProtocol.s.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {MockWETH9} from "test/mocks/MockWETH9.sol";
import {MockAaveV3Pool} from "test/mocks/MockAaveV3Pool.sol";
import {MockPoolAddressesProvider} from "test/mocks/MockPoolAddressesProvider.sol";

contract DeployProtocolTest is Test {
    using stdJson for string;

    MockWETH9 internal weth;
    MockAaveV3Pool internal pool;
    MockPoolAddressesProvider internal provider;
    address internal deployer;
    address internal setter;
    address internal successor;

    function setUp() public {
        deployer = makeAddr("deployer");
        setter = makeAddr("setter");
        successor = makeAddr("successor");
        weth = new MockWETH9();
        pool = new MockAaveV3Pool(address(weth));
        provider = new MockPoolAddressesProvider(address(pool));
        vm.deal(deployer, 100 ether);
        vm.deal(setter, 100 ether);
        vm.deal(successor, 100 ether);
    }

    function test_deploysAndWiresFamilyThenExecutesImmediately() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _fresh(deployer, deployer, "wires", true);
        cfg.skipExecute = false;

        DeployProtocol.FamilyState memory first = script.execute(cfg);
        assertGt(first.neth.code.length, 0);
        assertTrue(first.graveSet);
        assertTrue(first.reaperSet);
        assertTrue(first.adapterDeployed);
        assertTrue(first.strategyScheduled);
        assertTrue(first.strategyExecuted);
        assertEq(keccak256(bytes(first.status)), keccak256("complete"));
        assertEq(NETH(first.neth).grave(), first.grave);
        assertEq(NETH(first.neth).graveSetter(), address(0));
        assertEq(Grave(payable(first.grave)).reaper(), first.reaper);
        assertEq(Grave(payable(first.grave)).activeStrategy(), first.adapter);
        assertEq(NETH(first.neth).totalSupply(), 0);
        assertEq(Grave(payable(first.grave)).protectedPrincipal(), 0);
        assertFalse(Reaper(payable(first.reaper)).activeAuction().active);
        assertTrue(first.postChecksPassed);
    }

    function test_resumesFromJsonWithoutRedeploying() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _fresh(deployer, deployer, "resume", true);
        DeployProtocol.FamilyState memory first = script.execute(cfg);

        string memory json = vm.readFile(cfg.stateFile);
        assertEq(json.readAddress(".contracts.neth"), first.neth);
        assertTrue(json.readBool(".steps.setGrave"));
        assertTrue(json.readBool(".steps.setReaper"));

        DeployProtocol resume = new DeployProtocol();
        DeployProtocol.FamilyState memory second = resume.execute(cfg);
        assertEq(second.neth, first.neth);
        assertEq(second.grave, first.grave);
        assertEq(second.reaper, first.reaper);
        assertEq(second.adapter, first.adapter);
    }

    function test_pausesWhenGraveSetterWalletDiffers() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _fresh(deployer, setter, "wallet-switch", true);
        DeployProtocol.FamilyState memory first = script.execute(cfg);
        assertTrue(first.nethDeployed);
        assertTrue(first.graveDeployed);
        assertTrue(first.reaperDeployed);
        assertFalse(first.graveSet);
        assertEq(keccak256(bytes(first.status)), keccak256("waiting_wallet"));
        assertEq(NETH(first.neth).grave(), address(0));

        cfg.sender = setter;
        DeployProtocol setterRun = new DeployProtocol();
        DeployProtocol.FamilyState memory second = setterRun.execute(cfg);
        assertTrue(second.graveSet);
        assertFalse(second.reaperSet);
        assertEq(keccak256(bytes(second.status)), keccak256("waiting_wallet"));

        cfg.sender = deployer;
        DeployProtocol ownerRun = new DeployProtocol();
        DeployProtocol.FamilyState memory third = ownerRun.execute(cfg);
        assertTrue(third.reaperSet);
        assertTrue(third.strategyScheduled);
        assertEq(NETH(third.neth).grave(), third.grave);
        assertEq(Grave(payable(third.grave)).reaper(), third.reaper);
    }

    function test_ownershipHandoffRequiresRecipientWallet() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _fresh(deployer, deployer, "ownership", true);
        cfg.ownershipRecipient = successor;
        cfg.skipExecute = true;
        DeployProtocol.FamilyState memory first = script.execute(cfg);
        assertTrue(first.ownershipTransferred);
        assertFalse(first.ownershipAccepted);
        assertEq(Grave(payable(first.grave)).owner(), deployer);
        assertEq(Grave(payable(first.grave)).pendingOwner(), successor);
        assertEq(keccak256(bytes(first.status)), keccak256("waiting_ownership_accept"));

        cfg.sender = successor;
        DeployProtocol acceptRun = new DeployProtocol();
        DeployProtocol.FamilyState memory second = acceptRun.execute(cfg);
        assertTrue(second.ownershipAccepted);
        assertEq(Grave(payable(second.grave)).owner(), successor);
        assertEq(keccak256(bytes(second.status)), keccak256("complete"));
    }

    function test_revertsOnWrongChain() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _config(deployer, deployer, "wrong-chain", false);
        cfg.expectedChainId = 84532;
        vm.expectRevert(abi.encodeWithSelector(DeployProtocol.WrongChain.selector, block.chainid, uint256(84532)));
        script.execute(cfg);
    }

    function test_revertsWhenAavePoolPinDoesNotMatch() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _config(deployer, deployer, "aave-pin", false);
        cfg.pool = address(0xBEEF);
        vm.expectRevert(
            abi.encodeWithSelector(DeployProtocol.AavePinMismatch.selector, "pool", address(0xBEEF), address(pool))
        );
        script.execute(cfg);
    }

    function test_mainnetRequiresConfirmation() public {
        vm.chainId(8453);
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _config(deployer, deployer, "mainnet-confirm", false);
        cfg.network = "base";
        cfg.expectedChainId = 8453;
        cfg.confirmMainnet = false;
        cfg.skipBudget = true;
        vm.expectRevert(DeployProtocol.MainnetNotConfirmed.selector);
        script.execute(cfg);
    }

    function test_budgetAbortsWhenEstimateExceedsCap() public {
        vm.chainId(8453);
        vm.txGasPrice(1 gwei);
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _config(deployer, deployer, "budget", false);
        cfg.network = "base";
        cfg.expectedChainId = 8453;
        cfg.confirmMainnet = true;
        cfg.skipBudget = false;
        cfg.skipOwnershipTransfer = true;
        cfg.requireCanonicalWeth = false;
        cfg.ethUsdPrice = 1_000_000;
        cfg.maxDeployUsd = 1;
        vm.expectRevert(abi.encodeWithSelector(DeployProtocol.BudgetExceeded.selector, uint256(8980), uint256(1)));
        script.execute(cfg);
    }

    function test_statusOnlyDoesNotDeploy() public {
        DeployProtocol script = new DeployProtocol();
        DeployProtocol.RunConfig memory cfg = _config(deployer, deployer, "status-only", false);
        cfg.statusOnly = true;
        DeployProtocol.FamilyState memory state = script.execute(cfg);
        assertEq(state.neth, address(0));
        assertFalse(vm.exists(cfg.stateFile));
    }

    function _fresh(address sender, address graveSetter, string memory tag, bool persist)
        internal
        returns (DeployProtocol.RunConfig memory cfg)
    {
        cfg = _config(sender, graveSetter, tag, persist);
        if (bytes(cfg.stateFile).length != 0 && vm.exists(cfg.stateFile)) {
            vm.removeFile(cfg.stateFile);
        }
    }

    function _config(address sender, address graveSetter, string memory tag, bool persist)
        internal
        view
        returns (DeployProtocol.RunConfig memory cfg)
    {
        cfg.network = "anvil";
        cfg.expectedChainId = block.chainid;
        cfg.sender = sender;
        cfg.graveSetter = graveSetter;
        cfg.graveOwner = deployer;
        cfg.weth = address(weth);
        cfg.provider = address(provider);
        cfg.pool = address(pool);
        cfg.aWeth = address(pool.aToken());
        cfg.variableDebtWeth = address(pool.variableDebt());
        cfg.stateFile = string.concat("deployments/test-", tag, ".json");
        cfg.persist = persist;
        cfg.skipExecute = true;
        cfg.skipBudget = true;
        cfg.requireCanonicalWeth = false;
        cfg.maxDeployUsd = 15;
    }
}
