// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.36;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {NETH} from "src/NETH.sol";
import {Grave} from "src/Grave.sol";
import {Reaper} from "src/Reaper.sol";
import {AaveV3WethAdapter} from "src/strategy/AaveV3WethAdapter.sol";
import {IPoolAddressesProvider} from "src/interfaces/IPoolAddressesProvider.sol";
import {IAToken} from "src/interfaces/IAToken.sol";

contract DeployProtocol is Script {
    using stdJson for string;

    uint256 internal constant BASE_CHAIN_ID = 8453;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 internal constant DEFAULT_MAX_DEPLOY_USD = 15;
    uint256 internal constant SCHEMA_VERSION = 1;
    address internal constant CANONICAL_WETH = 0x4200000000000000000000000000000000000006;

    uint256 internal constant GAS_NETH = 1_200_000;
    uint256 internal constant GAS_GRAVE = 3_500_000;
    uint256 internal constant GAS_REAPER = 2_200_000;
    uint256 internal constant GAS_ADAPTER = 1_800_000;
    uint256 internal constant GAS_SET_GRAVE = 80_000;
    uint256 internal constant GAS_SET_REAPER = 80_000;
    uint256 internal constant GAS_SCHEDULE = 120_000;
    uint256 internal constant GAS_EXECUTE = 250_000;
    uint256 internal constant GAS_TRANSFER = 50_000;
    uint256 internal constant GAS_ACCEPT = 50_000;

    struct RunConfig {
        string network;
        uint256 expectedChainId;
        address sender;
        address graveSetter;
        address graveOwner;
        address ownershipRecipient;
        address weth;
        address provider;
        address pool;
        address aWeth;
        address variableDebtWeth;
        string stateFile;
        bool persist;
        bool statusOnly;
        bool skipExecute;
        bool skipOwnershipTransfer;
        bool skipBudget;
        bool confirmMainnet;
        bool requireCanonicalWeth;
        uint256 ethUsdPrice;
        uint256 maxDeployUsd;
        uint256 persistNonce;
    }

    struct FamilyState {
        uint256 schemaVersion;
        string network;
        uint256 chainId;
        string status;
        address deployer;
        address graveSetter;
        address graveOwner;
        address ownershipRecipient;
        address weth;
        address provider;
        address pool;
        address aWeth;
        address variableDebtWeth;
        address neth;
        address grave;
        address reaper;
        address adapter;
        uint256 strategyExecuteAfter;
        uint256 createdAt;
        uint256 updatedAt;
        bool nethDeployed;
        bool graveDeployed;
        bool reaperDeployed;
        bool graveSet;
        bool reaperSet;
        bool adapterDeployed;
        bool strategyScheduled;
        bool strategyExecuted;
        bool ownershipTransferred;
        bool ownershipAccepted;
        bool postChecksPassed;
    }

    error WrongChain(uint256 actual, uint256 expected);
    error UnsupportedNetwork(string network);
    error MainnetNotConfirmed();
    error RedeployForbiddenOnMainnet();
    error BudgetExceeded(uint256 costUsd, uint256 maxUsd);
    error MissingEthUsdPrice();
    error ZeroAddress(string field);
    error MissingCode(address target, string field);
    error AavePinMismatch(string field, address expected, address actual);
    error CanonicalWethRequired(address actual);
    error StateMismatch(string field, address expected, address actual);
    error UnexpectedOnchainState(string field);
    error SchemaUnsupported(uint256 version);

    RunConfig internal _cfg;
    FamilyState internal _st;
    bool internal _paused;
    string internal _pauseReason;
    address internal _requiredWallet;

    function run() external {
        execute(_configFromEnv());
    }

    function execute(RunConfig memory cfg) public returns (FamilyState memory) {
        _cfg = cfg;
        _paused = false;
        _pauseReason = "";
        _requiredWallet = address(0);

        _checkChain();
        _loadState();
        _applyConfigToState();
        _checkAave();
        _reconcileOnchain();

        if (_cfg.statusOnly) {
            _refreshStatus();
            _printSummary();
            return _st;
        }

        _checkMainnetGuard();
        _checkBudget();

        vm.startBroadcast(_cfg.sender);
        _deployNeth();
        _deployGrave();
        _deployReaper();
        _wireSetGrave();
        _wireSetReaper();
        _deployAdapter();
        _scheduleStrategy();
        _executeStrategy();
        _transferOwnership();
        _acceptOwnership();
        vm.stopBroadcast();

        _postChecks();
        _refreshStatus();
        _persist();
        _printSummary();
        return _st;
    }

    function _configFromEnv() internal view returns (RunConfig memory cfg) {
        cfg.network = vm.envOr("DEPLOY_NETWORK", string(""));
        cfg.expectedChainId = _chainIdFor(cfg.network);
        cfg.sender = vm.envOr("DEPLOY_SENDER", address(0));
        if (cfg.sender == address(0)) {
            cfg.sender = msg.sender;
        }
        cfg.graveSetter = vm.envOr("GRAVE_SETTER", cfg.sender);
        cfg.graveOwner = vm.envOr("GRAVE_OWNER", cfg.sender);
        cfg.ownershipRecipient = vm.envOr("OWNERSHIP_RECIPIENT", address(0));
        cfg.stateFile = vm.envOr("DEPLOY_STATE_FILE", _defaultStateFile(cfg.network));
        cfg.statusOnly = vm.envOr("DEPLOY_STATUS_ONLY", false);
        cfg.skipExecute = vm.envOr("SKIP_EXECUTE_STRATEGY", false);
        cfg.skipOwnershipTransfer = vm.envOr("SKIP_OWNERSHIP_TRANSFER", false);
        cfg.skipBudget = vm.envOr("SKIP_BUDGET_CHECK", false);
        cfg.confirmMainnet = vm.envOr("CONFIRM_MAINNET", false);
        cfg.ethUsdPrice = vm.envOr("ETH_USD_PRICE", uint256(0));
        cfg.maxDeployUsd = vm.envOr("MAX_DEPLOY_USD", DEFAULT_MAX_DEPLOY_USD);
        cfg.requireCanonicalWeth = cfg.expectedChainId == BASE_CHAIN_ID;
        cfg.persist = vm.isContext(VmSafe.ForgeContext.ScriptBroadcast) || vm.envOr("DEPLOY_PERSIST", false);

        _loadAavePins(cfg);
    }

    function _loadAavePins(RunConfig memory cfg) internal view {
        _defaultAave(cfg.expectedChainId, cfg);
        string memory configFile = vm.envOr("AAVE_CONFIG_FILE", string(""));
        if (bytes(configFile).length != 0) {
            string memory json = vm.readFile(configFile);
            cfg.weth = json.readAddressOr(".weth", cfg.weth);
            cfg.provider = json.readAddressOr(".provider", cfg.provider);
            cfg.pool = json.readAddressOr(".pool", cfg.pool);
            cfg.aWeth = json.readAddressOr(".aWeth", cfg.aWeth);
            cfg.variableDebtWeth = json.readAddressOr(".variableDebtWeth", cfg.variableDebtWeth);
        }
        cfg.weth = vm.envOr("WETH", cfg.weth);
        cfg.provider = vm.envOr("AAVE_POOL_ADDRESSES_PROVIDER", cfg.provider);
        cfg.pool = vm.envOr("AAVE_POOL", cfg.pool);
        cfg.aWeth = vm.envOr("AAVE_AWETH", cfg.aWeth);
        cfg.variableDebtWeth = vm.envOr("AAVE_VARIABLE_DEBT_WETH", cfg.variableDebtWeth);
    }

    function _defaultAave(uint256 chainId, RunConfig memory cfg) internal pure {
        cfg.weth = CANONICAL_WETH;
        if (chainId == BASE_CHAIN_ID) {
            cfg.provider = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
            cfg.pool = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
            cfg.aWeth = 0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7;
            cfg.variableDebtWeth = 0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E;
        } else if (chainId == BASE_SEPOLIA_CHAIN_ID) {
            cfg.provider = 0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00;
            cfg.pool = 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27;
            cfg.aWeth = 0x73a5bB60b0B0fc35710DDc0ea9c407031E31Bdbb;
            cfg.variableDebtWeth = 0x562abf6562d6A2b165aDa02b5946bc3E7b4dD653;
        }
    }

    function _chainIdFor(string memory network) internal pure returns (uint256) {
        if (_eq(network, "base") || _eq(network, "8453")) {
            return BASE_CHAIN_ID;
        }
        if (_eq(network, "base-sepolia") || _eq(network, "base_sepolia") || _eq(network, "84532")) {
            return BASE_SEPOLIA_CHAIN_ID;
        }
        revert UnsupportedNetwork(network);
    }

    function _defaultStateFile(string memory network) internal pure returns (string memory) {
        if (_eq(network, "base") || _eq(network, "8453")) {
            return "deployments/base.json";
        }
        return "deployments/base-sepolia.json";
    }

    function _checkChain() internal view {
        if (block.chainid != _cfg.expectedChainId) {
            revert WrongChain(block.chainid, _cfg.expectedChainId);
        }
    }

    function _checkMainnetGuard() internal view {
        if (_cfg.expectedChainId != BASE_CHAIN_ID) {
            return;
        }
        if (!_cfg.confirmMainnet) {
            revert MainnetNotConfirmed();
        }
        if (vm.envOr("DEPLOY_REDEPLOY", false)) {
            revert RedeployForbiddenOnMainnet();
        }
        if (!_cfg.skipOwnershipTransfer && _cfg.ownershipRecipient == address(0)) {
            revert ZeroAddress("OWNERSHIP_RECIPIENT");
        }
    }

    function _checkAave() internal view {
        _requireContract(_cfg.weth, "weth");
        _requireContract(_cfg.provider, "provider");
        _requireContract(_cfg.aWeth, "aWeth");
        if (_cfg.requireCanonicalWeth && _cfg.weth != CANONICAL_WETH) {
            revert CanonicalWethRequired(_cfg.weth);
        }

        address livePool = IPoolAddressesProvider(_cfg.provider).getPool();
        if (livePool == address(0)) {
            revert ZeroAddress("provider.getPool()");
        }
        if (_cfg.pool != address(0) && livePool != _cfg.pool) {
            revert AavePinMismatch("pool", _cfg.pool, livePool);
        }
        address aTokenPool = IAToken(_cfg.aWeth).POOL();
        if (aTokenPool != livePool) {
            revert AavePinMismatch("aWeth.POOL", livePool, aTokenPool);
        }
        address underlying = IAToken(_cfg.aWeth).UNDERLYING_ASSET_ADDRESS();
        if (underlying != _cfg.weth) {
            revert AavePinMismatch("aWeth.UNDERLYING", _cfg.weth, underlying);
        }
        if (_cfg.variableDebtWeth != address(0)) {
            _requireContract(_cfg.variableDebtWeth, "variableDebtWeth");
        }
    }

    function _checkBudget() internal view {
        if (_cfg.skipBudget || _cfg.expectedChainId != BASE_CHAIN_ID) {
            return;
        }
        if (_cfg.ethUsdPrice == 0) {
            revert MissingEthUsdPrice();
        }
        uint256 gasLeft = _remainingGas();
        uint256 costUsd = (gasLeft * tx.gasprice * _cfg.ethUsdPrice) / 1 ether;
        if (costUsd > _cfg.maxDeployUsd) {
            revert BudgetExceeded(costUsd, _cfg.maxDeployUsd);
        }
    }

    function _remainingGas() internal view returns (uint256 gasUsed) {
        if (!_st.nethDeployed) gasUsed += GAS_NETH;
        if (!_st.graveDeployed) gasUsed += GAS_GRAVE;
        if (!_st.reaperDeployed) gasUsed += GAS_REAPER;
        if (!_st.adapterDeployed) gasUsed += GAS_ADAPTER;
        if (!_st.graveSet) gasUsed += GAS_SET_GRAVE;
        if (!_st.reaperSet) gasUsed += GAS_SET_REAPER;
        if (!_st.strategyScheduled) gasUsed += GAS_SCHEDULE;
        if (!_cfg.skipExecute && !_st.strategyExecuted) gasUsed += GAS_EXECUTE;
        if (!_cfg.skipOwnershipTransfer && _cfg.ownershipRecipient != address(0) && !_st.ownershipTransferred) {
            gasUsed += GAS_TRANSFER;
        }
        if (!_cfg.skipOwnershipTransfer && _cfg.ownershipRecipient != address(0) && !_st.ownershipAccepted) {
            gasUsed += GAS_ACCEPT;
        }
    }

    function _loadState() internal {
        _st.schemaVersion = SCHEMA_VERSION;
        _st.network = _cfg.network;
        _st.chainId = _cfg.expectedChainId;
        _st.createdAt = block.timestamp;
        _st.updatedAt = block.timestamp;
        if (bytes(_cfg.stateFile).length == 0 || !vm.exists(_cfg.stateFile)) {
            return;
        }
        string memory json = vm.readFile(_cfg.stateFile);
        uint256 version = json.readUintOr(".schemaVersion", 1);
        if (version != SCHEMA_VERSION) {
            revert SchemaUnsupported(version);
        }
        string memory network = json.readStringOr(".network", _cfg.network);
        uint256 chainId = json.readUintOr(".chainId", _cfg.expectedChainId);
        if (!_eq(network, _cfg.network) || chainId != _cfg.expectedChainId) {
            revert WrongChain(chainId, _cfg.expectedChainId);
        }
        _st.network = network;
        _st.chainId = chainId;
        _st.status = json.readStringOr(".status", "");
        _st.deployer = json.readAddressOr(".deployer", address(0));
        _st.graveSetter = json.readAddressOr(".graveSetter", address(0));
        _st.graveOwner = json.readAddressOr(".graveOwner", address(0));
        _st.ownershipRecipient = json.readAddressOr(".ownershipRecipient", address(0));
        _st.weth = json.readAddressOr(".aave.weth", address(0));
        _st.provider = json.readAddressOr(".aave.provider", address(0));
        _st.pool = json.readAddressOr(".aave.pool", address(0));
        _st.aWeth = json.readAddressOr(".aave.aWeth", address(0));
        _st.variableDebtWeth = json.readAddressOr(".aave.variableDebtWeth", address(0));
        _st.neth = json.readAddressOr(".contracts.neth", address(0));
        _st.grave = json.readAddressOr(".contracts.grave", address(0));
        _st.reaper = json.readAddressOr(".contracts.reaper", address(0));
        _st.adapter = json.readAddressOr(".contracts.adapter", address(0));
        _st.strategyExecuteAfter = json.readUintOr(".strategy.executeAfter", 0);
        _st.createdAt = json.readUintOr(".createdAt", block.timestamp);
        _st.nethDeployed = json.readBoolOr(".steps.neth", false);
        _st.graveDeployed = json.readBoolOr(".steps.grave", false);
        _st.reaperDeployed = json.readBoolOr(".steps.reaper", false);
        _st.graveSet = json.readBoolOr(".steps.setGrave", false);
        _st.reaperSet = json.readBoolOr(".steps.setReaper", false);
        _st.adapterDeployed = json.readBoolOr(".steps.adapter", false);
        _st.strategyScheduled = json.readBoolOr(".steps.scheduleStrategy", false);
        _st.strategyExecuted = json.readBoolOr(".steps.executeStrategy", false);
        _st.ownershipTransferred = json.readBoolOr(".steps.transferOwnership", false);
        _st.ownershipAccepted = json.readBoolOr(".steps.acceptOwnership", false);
        _st.postChecksPassed = json.readBoolOr(".steps.postChecks", false);
    }

    function _applyConfigToState() internal {
        if (_st.deployer == address(0)) {
            _st.deployer = _cfg.sender;
        }
        if (_st.graveSetter == address(0)) {
            _st.graveSetter = _cfg.graveSetter;
        }
        if (_st.graveOwner == address(0)) {
            _st.graveOwner = _cfg.graveOwner;
        }
        if (_cfg.ownershipRecipient != address(0)) {
            _st.ownershipRecipient = _cfg.ownershipRecipient;
        }
        if (_st.nethDeployed || _st.adapterDeployed) {
            if (_st.provider != address(0) && _st.provider != _cfg.provider) {
                revert StateMismatch("provider", _st.provider, _cfg.provider);
            }
            if (_st.weth != address(0) && _st.weth != _cfg.weth) {
                revert StateMismatch("weth", _st.weth, _cfg.weth);
            }
            if (_st.aWeth != address(0) && _st.aWeth != _cfg.aWeth) {
                revert StateMismatch("aWeth", _st.aWeth, _cfg.aWeth);
            }
        }
        _st.weth = _cfg.weth;
        _st.provider = _cfg.provider;
        _st.aWeth = _cfg.aWeth;
        _st.variableDebtWeth = _cfg.variableDebtWeth;
        address livePool = IPoolAddressesProvider(_cfg.provider).getPool();
        _st.pool = livePool;
        _st.updatedAt = block.timestamp;
    }

    function _reconcileOnchain() internal {
        if (_st.neth != address(0)) {
            _requireContract(_st.neth, "neth");
            NETH neth = NETH(_st.neth);
            _st.nethDeployed = true;
            address grave = neth.grave();
            if (grave != address(0)) {
                if (_st.grave != address(0) && grave != _st.grave) {
                    revert StateMismatch("neth.grave", _st.grave, grave);
                }
                _st.grave = grave;
                _st.graveSet = true;
            }
        }
        if (_st.grave != address(0)) {
            _requireContract(_st.grave, "grave");
            Grave grave = Grave(payable(_st.grave));
            _st.graveDeployed = true;
            if (address(grave.neth()) != _st.neth && _st.neth != address(0)) {
                revert StateMismatch("grave.neth", _st.neth, address(grave.neth()));
            }
            address reaper = grave.reaper();
            if (reaper != address(0)) {
                if (_st.reaper != address(0) && reaper != _st.reaper) {
                    revert StateMismatch("grave.reaper", _st.reaper, reaper);
                }
                _st.reaper = reaper;
                _st.reaperSet = true;
            }
            address active = grave.activeStrategy();
            if (active != address(0)) {
                _st.adapter = active;
                _st.adapterDeployed = true;
                _st.strategyScheduled = true;
                _st.strategyExecuted = true;
            } else {
                (address pending, uint256 executeAfter) = grave.pendingStrategy();
                if (pending != address(0)) {
                    if (_st.adapter != address(0) && pending != _st.adapter) {
                        revert StateMismatch("pendingStrategy", _st.adapter, pending);
                    }
                    _st.adapter = pending;
                    _st.adapterDeployed = true;
                    _st.strategyScheduled = true;
                    _st.strategyExecuteAfter = executeAfter;
                }
            }
            address owner = grave.owner();
            _st.graveOwner = owner;
            address pendingOwner = grave.pendingOwner();
            if (_st.ownershipRecipient != address(0) && owner == _st.ownershipRecipient) {
                _st.ownershipTransferred = true;
                _st.ownershipAccepted = true;
            } else if (_st.ownershipRecipient != address(0) && pendingOwner == _st.ownershipRecipient) {
                _st.ownershipTransferred = true;
            }
        }
        if (_st.reaper != address(0)) {
            _requireContract(_st.reaper, "reaper");
            _st.reaperDeployed = true;
        }
        if (_st.adapter != address(0)) {
            _requireContract(_st.adapter, "adapter");
            _st.adapterDeployed = true;
        }
    }

    function _deployNeth() internal {
        if (_paused || _st.nethDeployed) {
            return;
        }
        NETH neth = new NETH(_st.graveSetter);
        _st.neth = address(neth);
        _st.nethDeployed = true;
        _persist();
    }

    function _deployGrave() internal {
        if (_paused || _st.graveDeployed) {
            return;
        }
        if (_st.neth == address(0)) {
            revert UnexpectedOnchainState("neth missing before grave");
        }
        Grave grave = new Grave(_st.neth, _st.graveOwner);
        _st.grave = address(grave);
        _st.graveDeployed = true;
        _persist();
    }

    function _deployReaper() internal {
        if (_paused || _st.reaperDeployed) {
            return;
        }
        Reaper reaper = new Reaper(_st.neth, _st.grave);
        _st.reaper = address(reaper);
        _st.reaperDeployed = true;
        _persist();
    }

    function _wireSetGrave() internal {
        if (_paused || _st.graveSet) {
            return;
        }
        if (!_requireWallet(_st.graveSetter, "GRAVE_SETTER to call NETH.setGrave")) {
            return;
        }
        NETH(_st.neth).setGrave(_st.grave);
        _st.graveSet = true;
        _persist();
    }

    function _wireSetReaper() internal {
        if (_paused || _st.reaperSet) {
            return;
        }
        if (!_requireWallet(_currentGraveOwner(), "Grave owner to call setReaper")) {
            return;
        }
        Grave(payable(_st.grave)).setReaper(_st.reaper);
        _st.reaperSet = true;
        _persist();
    }

    function _deployAdapter() internal {
        if (_paused || _st.adapterDeployed) {
            return;
        }
        AaveV3WethAdapter adapter = new AaveV3WethAdapter(_st.grave, _st.provider, _st.weth, _st.aWeth);
        _st.adapter = address(adapter);
        _st.adapterDeployed = true;
        _persist();
    }

    function _scheduleStrategy() internal {
        if (_paused || _st.strategyScheduled) {
            return;
        }
        if (!_requireWallet(_currentGraveOwner(), "Grave owner to call scheduleStrategy")) {
            return;
        }
        Grave grave = Grave(payable(_st.grave));
        grave.scheduleStrategy(_st.adapter);
        (, uint256 executeAfter) = grave.pendingStrategy();
        _st.strategyExecuteAfter = executeAfter;
        _st.strategyScheduled = true;
        _persist();
    }

    function _executeStrategy() internal {
        if (_paused || _st.strategyExecuted || _cfg.skipExecute) {
            return;
        }
        if (!_st.strategyScheduled) {
            return;
        }
        if (block.timestamp < _st.strategyExecuteAfter) {
            _pause(
                address(0),
                string.concat(
                    "Strategy delay not elapsed. executeAfter=",
                    vm.toString(_st.strategyExecuteAfter),
                    " now=",
                    vm.toString(block.timestamp),
                    ". Re-run this script after the 14-day delay."
                )
            );
            return;
        }
        if (!_requireWallet(_currentGraveOwner(), "Grave owner to call executeStrategyMigration")) {
            return;
        }
        Grave(payable(_st.grave)).executeStrategyMigration();
        _st.strategyExecuted = true;
        _persist();
    }

    function _transferOwnership() internal {
        if (_paused || _cfg.skipOwnershipTransfer || _st.ownershipRecipient == address(0)) {
            return;
        }
        if (_st.ownershipTransferred || _st.ownershipAccepted) {
            return;
        }
        if (!_requireWallet(_currentGraveOwner(), "Grave owner to call transferOwnership")) {
            return;
        }
        Grave(payable(_st.grave)).transferOwnership(_st.ownershipRecipient);
        _st.ownershipTransferred = true;
        _persist();
    }

    function _acceptOwnership() internal {
        if (_paused || _cfg.skipOwnershipTransfer || _st.ownershipRecipient == address(0)) {
            return;
        }
        if (_st.ownershipAccepted) {
            return;
        }
        if (!_st.ownershipTransferred) {
            return;
        }
        if (!_requireWallet(_st.ownershipRecipient, "OWNERSHIP_RECIPIENT to call acceptOwnership")) {
            return;
        }
        Grave(payable(_st.grave)).acceptOwnership();
        _st.ownershipAccepted = true;
        _st.graveOwner = _st.ownershipRecipient;
        _persist();
    }

    function _postChecks() internal {
        if (_st.neth == address(0) || _st.grave == address(0) || _st.reaper == address(0)) {
            return;
        }
        NETH neth = NETH(_st.neth);
        Grave grave = Grave(payable(_st.grave));
        Reaper reaper = Reaper(payable(_st.reaper));
        if (!_eq(neth.name(), "Nether") || !_eq(neth.symbol(), "NETH")) {
            revert UnexpectedOnchainState("neth metadata");
        }
        if (_st.graveSet && neth.grave() != _st.grave) {
            revert StateMismatch("neth.grave", _st.grave, neth.grave());
        }
        if (_st.graveSet && neth.graveSetter() != address(0)) {
            revert UnexpectedOnchainState("neth.graveSetter still set");
        }
        if (_st.reaperSet && grave.reaper() != _st.reaper) {
            revert StateMismatch("grave.reaper", _st.reaper, grave.reaper());
        }
        if (address(grave.neth()) != _st.neth) {
            revert StateMismatch("grave.neth", _st.neth, address(grave.neth()));
        }
        if (address(reaper.neth()) != _st.neth || address(reaper.grave()) != _st.grave) {
            revert UnexpectedOnchainState("reaper wiring");
        }
        if (neth.totalSupply() != 0 || grave.protectedPrincipal() != 0) {
            revert UnexpectedOnchainState("non-zero genesis");
        }
        if (reaper.activeAuction().active) {
            revert UnexpectedOnchainState("active reaper auction");
        }
        if (_st.adapterDeployed) {
            AaveV3WethAdapter adapter = AaveV3WethAdapter(payable(_st.adapter));
            if (adapter.grave() != _st.grave) {
                revert StateMismatch("adapter.grave", _st.grave, adapter.grave());
            }
            if (adapter.underlying() != _st.weth) {
                revert StateMismatch("adapter.underlying", _st.weth, adapter.underlying());
            }
        }
        if (_st.strategyExecuted && grave.activeStrategy() != _st.adapter) {
            revert StateMismatch("activeStrategy", _st.adapter, grave.activeStrategy());
        }
        _st.postChecksPassed = _st.graveSet && _st.reaperSet && _st.adapterDeployed && _st.strategyScheduled;
    }

    function _requireWallet(address required, string memory role) internal returns (bool) {
        if (_cfg.sender == required) {
            return true;
        }
        _pause(required, string.concat("Switch wallet to ", vm.toString(required), " (", role, "), then re-run."));
        return false;
    }

    function _pause(address required, string memory reason) internal {
        _paused = true;
        _requiredWallet = required;
        _pauseReason = reason;
    }

    function _currentGraveOwner() internal view returns (address) {
        if (_st.grave == address(0)) {
            return _st.graveOwner;
        }
        return Grave(payable(_st.grave)).owner();
    }

    function _refreshStatus() internal {
        if (
            _st.strategyScheduled && !_st.strategyExecuted && !_cfg.skipExecute
                && block.timestamp < _st.strategyExecuteAfter
        ) {
            _st.status = "waiting_strategy_delay";
            return;
        }
        if (
            _st.ownershipTransferred && !_st.ownershipAccepted && _st.ownershipRecipient != address(0)
                && !_cfg.skipOwnershipTransfer
        ) {
            _st.status = "waiting_ownership_accept";
            return;
        }
        if (_paused && _requiredWallet != address(0)) {
            _st.status = "waiting_wallet";
            return;
        }
        bool wired = _st.nethDeployed && _st.graveDeployed && _st.reaperDeployed && _st.graveSet && _st.reaperSet
            && _st.adapterDeployed && _st.strategyScheduled;
        bool ownershipDone = _cfg.skipOwnershipTransfer || _st.ownershipRecipient == address(0) || _st.ownershipAccepted;
        bool strategyDone = _cfg.skipExecute || _st.strategyExecuted;
        if (wired && ownershipDone && strategyDone && _st.postChecksPassed) {
            _st.status = "complete";
            return;
        }
        _st.status = "in_progress";
    }

    function _persist() internal {
        _st.updatedAt = block.timestamp;
        if (!_cfg.persist || bytes(_cfg.stateFile).length == 0) {
            return;
        }
        _cfg.persistNonce += 1;
        string memory aaveKey = string.concat("aave-", vm.toString(_cfg.persistNonce));
        string memory contractsKey = string.concat("contracts-", vm.toString(_cfg.persistNonce));
        string memory stepsKey = string.concat("steps-", vm.toString(_cfg.persistNonce));
        string memory strategyKey = string.concat("strategy-", vm.toString(_cfg.persistNonce));
        string memory rootKey = string.concat("root-", vm.toString(_cfg.persistNonce));

        vm.serializeAddress(aaveKey, "weth", _st.weth);
        vm.serializeAddress(aaveKey, "provider", _st.provider);
        vm.serializeAddress(aaveKey, "pool", _st.pool);
        vm.serializeAddress(aaveKey, "aWeth", _st.aWeth);
        string memory aaveJson = vm.serializeAddress(aaveKey, "variableDebtWeth", _st.variableDebtWeth);

        vm.serializeAddress(contractsKey, "neth", _st.neth);
        vm.serializeAddress(contractsKey, "grave", _st.grave);
        vm.serializeAddress(contractsKey, "reaper", _st.reaper);
        string memory contractsJson = vm.serializeAddress(contractsKey, "adapter", _st.adapter);

        vm.serializeBool(stepsKey, "neth", _st.nethDeployed);
        vm.serializeBool(stepsKey, "grave", _st.graveDeployed);
        vm.serializeBool(stepsKey, "reaper", _st.reaperDeployed);
        vm.serializeBool(stepsKey, "setGrave", _st.graveSet);
        vm.serializeBool(stepsKey, "setReaper", _st.reaperSet);
        vm.serializeBool(stepsKey, "adapter", _st.adapterDeployed);
        vm.serializeBool(stepsKey, "scheduleStrategy", _st.strategyScheduled);
        vm.serializeBool(stepsKey, "executeStrategy", _st.strategyExecuted);
        vm.serializeBool(stepsKey, "transferOwnership", _st.ownershipTransferred);
        vm.serializeBool(stepsKey, "acceptOwnership", _st.ownershipAccepted);
        string memory stepsJson = vm.serializeBool(stepsKey, "postChecks", _st.postChecksPassed);

        string memory strategyJson = vm.serializeUint(strategyKey, "executeAfter", _st.strategyExecuteAfter);

        vm.serializeUint(rootKey, "schemaVersion", SCHEMA_VERSION);
        vm.serializeString(rootKey, "network", _st.network);
        vm.serializeUint(rootKey, "chainId", _st.chainId);
        vm.serializeString(rootKey, "status", _st.status);
        vm.serializeAddress(rootKey, "deployer", _st.deployer);
        vm.serializeAddress(rootKey, "graveSetter", _st.graveSetter);
        vm.serializeAddress(rootKey, "graveOwner", _st.graveOwner);
        vm.serializeAddress(rootKey, "ownershipRecipient", _st.ownershipRecipient);
        vm.serializeUint(rootKey, "createdAt", _st.createdAt);
        vm.serializeUint(rootKey, "updatedAt", _st.updatedAt);
        vm.serializeString(rootKey, "aave", aaveJson);
        vm.serializeString(rootKey, "contracts", contractsJson);
        vm.serializeString(rootKey, "steps", stepsJson);
        string memory finalJson = vm.serializeString(rootKey, "strategy", strategyJson);
        vm.writeJson(finalJson, _cfg.stateFile);
    }

    function _printSummary() internal view {
        console2.log("=== Nether protocol deployment ===");
        console2.log(string.concat("Status:              ", _st.status));
        console2.log(string.concat("Network:             ", _st.network));
        console2.log("Chain ID:            ", _st.chainId);
        console2.log("RPC block:           ", block.number);
        console2.log("Timestamp:           ", block.timestamp);
        console2.log("Sender (this run):   ", _cfg.sender);
        console2.log("Deployer:            ", _st.deployer);
        console2.log("Grave setter:        ", _st.graveSetter);
        console2.log("Grave owner:         ", _st.graveOwner);
        if (_st.ownershipRecipient != address(0)) {
            console2.log("Ownership recipient: ", _st.ownershipRecipient);
        }
        console2.log("--- Contracts ---");
        console2.log("NETH:                ", _st.neth);
        console2.log("Grave:               ", _st.grave);
        console2.log("Reaper:              ", _st.reaper);
        console2.log("AaveV3WethAdapter:   ", _st.adapter);
        console2.log("--- Aave ---");
        console2.log("WETH:                ", _st.weth);
        console2.log("PoolAddressesProvider:", _st.provider);
        console2.log("Pool (getPool):      ", _st.pool);
        console2.log("aWETH:               ", _st.aWeth);
        if (_st.variableDebtWeth != address(0)) {
            console2.log("variableDebtWETH:    ", _st.variableDebtWeth);
        }
        console2.log("--- Wiring ---");
        console2.log("setGrave:            ", _st.graveSet);
        console2.log("setReaper:           ", _st.reaperSet);
        console2.log("scheduleStrategy:    ", _st.strategyScheduled);
        console2.log("executeStrategy:     ", _st.strategyExecuted);
        console2.log("transferOwnership:   ", _st.ownershipTransferred);
        console2.log("acceptOwnership:     ", _st.ownershipAccepted);
        console2.log("postChecks:          ", _st.postChecksPassed);
        if (_st.neth != address(0)) {
            NETH neth = NETH(_st.neth);
            console2.log("neth.grave:          ", neth.grave());
            console2.log("neth.graveSetter:    ", neth.graveSetter());
            console2.log("neth.totalSupply:    ", neth.totalSupply());
        }
        if (_st.grave != address(0)) {
            Grave grave = Grave(payable(_st.grave));
            console2.log("grave.reaper:        ", grave.reaper());
            console2.log("grave.owner:         ", grave.owner());
            console2.log("grave.pendingOwner:  ", grave.pendingOwner());
            console2.log("grave.activeStrategy:", grave.activeStrategy());
            (address pending, uint256 executeAfter) = grave.pendingStrategy();
            console2.log("pendingStrategy:     ", pending);
            console2.log("executeAfter:        ", executeAfter);
            console2.log("protectedPrincipal:  ", grave.protectedPrincipal());
            console2.log("currentEra:          ", grave.currentEra());
            console2.log("currentNAV:          ", grave.currentNAV());
        }
        if (_st.reaper != address(0)) {
            Reaper reaper = Reaper(payable(_st.reaper));
            console2.log("availableReaperETH:  ", reaper.availableReaperETH());
            console2.log("auction.active:      ", reaper.activeAuction().active);
        }
        if (_st.adapter != address(0)) {
            AaveV3WethAdapter adapter = AaveV3WethAdapter(payable(_st.adapter));
            console2.log("adapter.underlying:  ", adapter.underlying());
            console2.log("adapter.totalAssets: ", adapter.totalAssetsInETH());
        }
        string memory explorer = _explorerBase();
        if (bytes(explorer).length != 0 && _st.neth != address(0)) {
            console2.log("--- Explorer ---");
            console2.log(string.concat("NETH:    ", explorer, "/address/", vm.toString(_st.neth)));
            console2.log(string.concat("Grave:   ", explorer, "/address/", vm.toString(_st.grave)));
            console2.log(string.concat("Reaper:  ", explorer, "/address/", vm.toString(_st.reaper)));
            if (_st.adapter != address(0)) {
                console2.log(string.concat("Adapter: ", explorer, "/address/", vm.toString(_st.adapter)));
            }
        }
        if (bytes(_cfg.stateFile).length != 0) {
            console2.log(string.concat("State file:          ", _cfg.stateFile));
        }
        if (_paused) {
            console2.log("--- Next ---");
            console2.log(_pauseReason);
            if (_requiredWallet != address(0)) {
                console2.log("Required wallet:     ", _requiredWallet);
            }
        } else if (_eq(_st.status, "waiting_strategy_delay")) {
            console2.log("--- Next ---");
            console2.log("Re-run after executeAfter to activate the Aave adapter.");
        } else if (_eq(_st.status, "waiting_ownership_accept")) {
            console2.log("--- Next ---");
            console2.log("Switch to OWNERSHIP_RECIPIENT and re-run to acceptOwnership.");
        } else if (_eq(_st.status, "complete")) {
            console2.log("--- Next ---");
            console2.log("Family is wired. Strategy is live if executeStrategy is true.");
        }
        if (!_cfg.persist) {
            console2.log("NOTE: state was not written (dry-run or persist disabled).");
        }
    }

    function _explorerBase() internal view returns (string memory) {
        if (_st.chainId == BASE_CHAIN_ID) {
            return "https://basescan.org";
        }
        if (_st.chainId == BASE_SEPOLIA_CHAIN_ID) {
            return "https://sepolia.basescan.org";
        }
        return "";
    }

    function _requireContract(address target, string memory field) internal view {
        if (target == address(0)) {
            revert ZeroAddress(field);
        }
        if (target.code.length == 0) {
            revert MissingCode(target, field);
        }
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
