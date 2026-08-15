#!/usr/bin/env bash
# Deploy or resume the Nether contract family on Base or Base Sepolia.
set -euo pipefail

usage() {
  cat <<'EOF'
Deploy the Nether contract family (NETH, Grave, Reaper, Aave V3 WETH adapter)
and wire setGrave / setReaper / scheduleStrategy. Progress is stored in a JSON
state file so a run can be resumed after an RPC failure, a wallet switch, or
the 14-day strategy delay.

Usage:
  ./script/deploy.sh --network <base|base-sepolia> [options]

Network / RPC
  --network NAME          base | base-sepolia | 8453 | 84532
  --rpc-url URL_OR_ALIAS  HTTPS URL, or Foundry alias (base, base_sepolia)
  --slow                  Send transactions sequentially

Wallets (pick one per run; re-run to switch)
  --account NAME          Foundry keystore account (password prompted)
  --sender ADDRESS        Sender address (hardware wallets, or with --account)
  --ledger                Sign with Ledger
  --trezor                Sign with Trezor
  --mnemonic-index N      HD index for hardware wallets (default 0)
  --interactive           Prompt for a keystore account
  DEPLOYER_PRIVATE_KEY    Hex key in the environment (not written to JSON)

Aave pins (optional; defaults per network)
  --aave-config FILE      JSON with weth, provider, pool, aWeth, variableDebtWeth
  WETH / AAVE_POOL_ADDRESSES_PROVIDER / AAVE_POOL / AAVE_AWETH
  AAVE_VARIABLE_DEBT_WETH

Roles (optional; default to the current sender)
  GRAVE_SETTER            NETH.setGrave caller
  GRAVE_OWNER             Grave constructor owner
  OWNERSHIP_RECIPIENT     Ownable2Step recipient (required on mainnet unless skipped)

Resume / redeploy
  --resume                Continue from the state file (default if the file exists)
  --redeploy              Archive Sepolia state and start a new family
  --state-file PATH       Override deployments/<network>.json
  --status                Print on-chain + JSON summary, send no transactions
  --skip-execute-strategy Stop after scheduleStrategy (do not wait on the 14-day delay)
  --skip-ownership        Do not transferOwnership
  --dry-run               Simulate against the RPC; do not persist state

Mainnet
  --confirm-mainnet       Required to broadcast on Base mainnet (8453)
  ETH_USD_PRICE           Integer USD per ETH; required for the $15 budget abort
  MAX_DEPLOY_USD          Default 15

Verification (passed through to forge)
  --verify                Verify on Basescan (needs ETHERSCAN_API_KEY)

Any extra forge flags can be placed after -- .
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

NETWORK=""
RPC_URL="${RPC_URL:-}"
STATE_FILE=""
AAVE_CONFIG=""
ACCOUNT=""
SENDER="${DEPLOY_SENDER:-}"
LEDGER=0
TREZOR=0
MNEMONIC_INDEX=""
INTERACTIVE=0
SLOW=0
RESUME=0
REDEPLOY=0
STATUS_ONLY=0
DRY_RUN=0
VERIFY=0
CONFIRM_MAINNET_ENV="${CONFIRM_MAINNET:-}"
CONFIRM_MAINNET=0
SKIP_EXECUTE=0
SKIP_OWNERSHIP=0
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --network)
      NETWORK="${2:-}"
      shift 2
      ;;
    --rpc-url)
      RPC_URL="${2:-}"
      shift 2
      ;;
    --state-file)
      STATE_FILE="${2:-}"
      shift 2
      ;;
    --aave-config)
      AAVE_CONFIG="${2:-}"
      shift 2
      ;;
    --account)
      ACCOUNT="${2:-}"
      shift 2
      ;;
    --sender)
      SENDER="${2:-}"
      shift 2
      ;;
    --mnemonic-index)
      MNEMONIC_INDEX="${2:-}"
      shift 2
      ;;
    --ledger)
      LEDGER=1
      shift
      ;;
    --trezor)
      TREZOR=1
      shift
      ;;
    --interactive)
      INTERACTIVE=1
      shift
      ;;
    --slow)
      SLOW=1
      shift
      ;;
    --resume)
      RESUME=1
      shift
      ;;
    --redeploy)
      REDEPLOY=1
      shift
      ;;
    --status)
      STATUS_ONLY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --verify)
      VERIFY=1
      shift
      ;;
    --confirm-mainnet)
      CONFIRM_MAINNET=1
      shift
      ;;
    --skip-execute-strategy)
      SKIP_EXECUTE=1
      shift
      ;;
    --skip-ownership)
      SKIP_OWNERSHIP=1
      shift
      ;;
    --)
      shift
      EXTRA+=("$@")
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

normalize_network() {
  case "$1" in
    base|8453) echo base ;;
    base-sepolia|base_sepolia|84532) echo base-sepolia ;;
    *)
      echo "Unsupported network: $1 (use base or base-sepolia)" >&2
      exit 2
      ;;
  esac
}

if [[ -z "$NETWORK" ]]; then
  echo "--network is required" >&2
  usage >&2
  exit 2
fi
NETWORK="$(normalize_network "$NETWORK")"

if [[ "$NETWORK" == "base" ]]; then
  CHAIN_ID=8453
  RPC_ALIAS="base"
  DEFAULT_RPC="${BASE_RPC_URL:-}"
  DEFAULT_STATE="deployments/base.json"
  DEFAULT_AAVE="script/config/aave.base.json"
else
  CHAIN_ID=84532
  RPC_ALIAS="base_sepolia"
  DEFAULT_RPC="${BASE_SEPOLIA_RPC_URL:-}"
  DEFAULT_STATE="deployments/base-sepolia.json"
  DEFAULT_AAVE="script/config/aave.base-sepolia.json"
fi

if [[ -z "$RPC_URL" ]]; then
  RPC_URL="$DEFAULT_RPC"
fi
if [[ -z "$RPC_URL" ]]; then
  RPC_URL="$RPC_ALIAS"
fi
if [[ -z "$STATE_FILE" ]]; then
  STATE_FILE="$DEFAULT_STATE"
fi
if [[ -z "$AAVE_CONFIG" ]]; then
  AAVE_CONFIG="$DEFAULT_AAVE"
fi

mkdir -p "$(dirname "$STATE_FILE")"
mkdir -p deployments

if [[ "$REDEPLOY" -eq 1 ]]; then
  if [[ "$NETWORK" == "base" ]]; then
    echo "Refusing --redeploy on Base mainnet. Monetary contracts are immutable at deploy." >&2
    exit 1
  fi
  if [[ -f "$STATE_FILE" ]]; then
    ARCHIVE="deployments/${NETWORK}.$(date -u +%Y%m%dT%H%M%SZ).json"
    mv "$STATE_FILE" "$ARCHIVE"
    echo "Archived previous state to $ARCHIVE"
  fi
fi

if [[ "$RESUME" -eq 1 && ! -f "$STATE_FILE" ]]; then
  echo "--resume was set but $STATE_FILE does not exist" >&2
  exit 1
fi

echo "Checking RPC chain id..."
LIVE_CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
if [[ "$LIVE_CHAIN_ID" != "$CHAIN_ID" ]]; then
  echo "RPC chain id $LIVE_CHAIN_ID does not match $NETWORK ($CHAIN_ID). Switch --rpc-url." >&2
  exit 1
fi
echo "RPC ok: $RPC_URL  chainId=$LIVE_CHAIN_ID"

pick_keystore_account() {
  if ! command -v cast >/dev/null; then
    echo "cast is required to list keystore accounts" >&2
    exit 1
  fi
  mapfile -t ACCOUNTS < <(cast wallet list 2>/dev/null || true)
  if [[ ${#ACCOUNTS[@]} -eq 0 ]]; then
    echo "No Foundry keystore accounts. Create one with: cast wallet import <name> --interactive" >&2
    exit 1
  fi
  echo "Foundry keystore accounts:" >&2
  local i
  for i in "${!ACCOUNTS[@]}"; do
    echo "  $((i + 1))) ${ACCOUNTS[$i]}" >&2
  done
  local choice
  read -r -p "Select account [1]: " choice
  choice="${choice:-1}"
  ACCOUNT="${ACCOUNTS[$((choice - 1))]}"
}

if [[ "$STATUS_ONLY" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  WALLET_METHODS=0
  [[ -n "$ACCOUNT" ]] && WALLET_METHODS=$((WALLET_METHODS + 1))
  [[ "$LEDGER" -eq 1 ]] && WALLET_METHODS=$((WALLET_METHODS + 1))
  [[ "$TREZOR" -eq 1 ]] && WALLET_METHODS=$((WALLET_METHODS + 1))
  [[ -n "${DEPLOYER_PRIVATE_KEY:-}" || -n "${ETH_PRIVATE_KEY:-}" ]] && WALLET_METHODS=$((WALLET_METHODS + 1))
  if [[ "$INTERACTIVE" -eq 1 ]]; then
    pick_keystore_account
    WALLET_METHODS=1
  fi
  if [[ "$WALLET_METHODS" -eq 0 ]]; then
    if [[ -t 0 ]]; then
      echo "No wallet selected."
      echo "  1) Foundry keystore"
      echo "  2) Ledger"
      echo "  3) Trezor"
      echo "  4) Private key already in DEPLOYER_PRIVATE_KEY / ETH_PRIVATE_KEY"
      read -r -p "Select signing method [1]: " method
      method="${method:-1}"
      case "$method" in
        1) pick_keystore_account ;;
        2) LEDGER=1 ;;
        3) TREZOR=1 ;;
        4)
          if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" && -z "${ETH_PRIVATE_KEY:-}" ]]; then
            echo "Set DEPLOYER_PRIVATE_KEY in this shell (it will not be written to JSON)." >&2
            exit 1
          fi
          ;;
        *)
          echo "Invalid wallet method" >&2
          exit 2
          ;;
      esac
    else
      echo "No wallet. Pass --account, --ledger, --trezor, or set DEPLOYER_PRIVATE_KEY." >&2
      exit 1
    fi
  elif [[ "$WALLET_METHODS" -gt 1 ]]; then
    echo "Choose a single wallet method for this run (re-run to switch)." >&2
    exit 2
  fi
fi

if [[ "${CONFIRM_MAINNET_ENV:-}" == "true" || "${CONFIRM_MAINNET_ENV:-}" == "1" ]]; then
  CONFIRM_MAINNET=1
fi

if [[ "$NETWORK" == "base" && "$STATUS_ONLY" -eq 0 && "$DRY_RUN" -eq 0 && "$CONFIRM_MAINNET" -eq 0 ]]; then
  if [[ -t 0 ]]; then
    read -r -p "Type 'base-mainnet' to broadcast on Base mainnet: " confirm
    if [[ "$confirm" != "base-mainnet" ]]; then
      echo "Aborted." >&2
      exit 1
    fi
    CONFIRM_MAINNET=1
  else
    echo "Base mainnet requires --confirm-mainnet (or CONFIRM_MAINNET=true)." >&2
    exit 1
  fi
fi

export DEPLOY_NETWORK="$NETWORK"
export DEPLOY_STATE_FILE="$STATE_FILE"
export AAVE_CONFIG_FILE="$AAVE_CONFIG"
export DEPLOY_STATUS_ONLY="$([[ "$STATUS_ONLY" -eq 1 ]] && echo true || echo false)"
export SKIP_EXECUTE_STRATEGY="$([[ "$SKIP_EXECUTE" -eq 1 ]] && echo true || echo false)"
export SKIP_OWNERSHIP_TRANSFER="$([[ "$SKIP_OWNERSHIP" -eq 1 ]] && echo true || echo false)"

if [[ "$CONFIRM_MAINNET" -eq 1 ]]; then
  export CONFIRM_MAINNET=true
fi
if [[ "$REDEPLOY" -eq 1 ]]; then
  export DEPLOY_REDEPLOY=true
fi
if [[ -n "$SENDER" ]]; then
  export DEPLOY_SENDER="$SENDER"
fi
if [[ "$DRY_RUN" -eq 1 ]]; then
  export DEPLOY_PERSIST=false
else
  export DEPLOY_PERSIST=true
fi

FORGE_ARGS=(
  script
  script/DeployProtocol.s.sol:DeployProtocol
  --rpc-url "$RPC_URL"
)

if [[ "$STATUS_ONLY" -eq 0 && "$DRY_RUN" -eq 0 ]]; then
  FORGE_ARGS+=(--broadcast)
  export DEPLOY_PERSIST=true
fi
if [[ "$SLOW" -eq 1 ]]; then
  FORGE_ARGS+=(--slow)
fi
if [[ -n "$ACCOUNT" ]]; then
  FORGE_ARGS+=(--account "$ACCOUNT")
fi
if [[ -n "$SENDER" ]]; then
  FORGE_ARGS+=(--sender "$SENDER")
fi
if [[ "$LEDGER" -eq 1 ]]; then
  FORGE_ARGS+=(--ledger)
fi
if [[ "$TREZOR" -eq 1 ]]; then
  FORGE_ARGS+=(--trezor)
fi
if [[ -n "$MNEMONIC_INDEX" ]]; then
  FORGE_ARGS+=(--mnemonic-indexes "$MNEMONIC_INDEX")
fi
if [[ -n "${DEPLOYER_PRIVATE_KEY:-}" && -z "${ETH_PRIVATE_KEY:-}" ]]; then
  export ETH_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY"
fi
if [[ "$VERIFY" -eq 1 ]]; then
  FORGE_ARGS+=(--verify --verifier etherscan)
  if [[ "$NETWORK" == "base" ]]; then
    FORGE_ARGS+=(--chain-id 8453)
  else
    FORGE_ARGS+=(--chain-id 84532)
  fi
fi
if [[ ${#EXTRA[@]} -gt 0 ]]; then
  FORGE_ARGS+=("${EXTRA[@]}")
fi

echo "Running: forge ${FORGE_ARGS[*]}"
forge "${FORGE_ARGS[@]}"

if [[ -f "$STATE_FILE" ]] && command -v jq >/dev/null; then
  echo
  echo "=== State file ($STATE_FILE) ==="
  jq . "$STATE_FILE"
fi
