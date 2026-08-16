#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

FOUNDRY_VERSION="v1.7.1"
export PATH="$HOME/.foundry/bin:$PATH"

if ! command -v forge >/dev/null 2>&1 || ! forge --version 2>/dev/null | grep -q "1.7.1"; then
    if ! command -v foundryup >/dev/null 2>&1; then
        curl -L https://foundry.paradigm.xyz | bash
    fi
    "$HOME/.foundry/bin/foundryup" --install "$FOUNDRY_VERSION"
fi

git submodule update --init --recursive

(cd contracts && forge build)

(cd apps/web && npm ci)

(cd apps/keeper && npm ci && npm run build)
