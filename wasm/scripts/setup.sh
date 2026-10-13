#!/usr/bin/env bash
# Install the GHC WebAssembly toolchain and fetch the hledger sources.
# Idempotent: re-running skips anything that is already in place.
set -euo pipefail

WASM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.ghc-wasm}"
HLEDGER_TAG="${HLEDGER_TAG:-1.52.1}"
VENDOR="$WASM_DIR/vendor/hledger"

# --- GHC wasm toolchain ------------------------------------------------------
# ghc-wasm-meta's setup.sh starts with `rm -rf $PREFIX`, so it is not
# incremental. Only run it when the toolchain is not already usable.
if [ -x "$PREFIX/wasm32-wasi-ghc/bin/wasm32-wasi-ghc" ]; then
  echo "toolchain: already present at $PREFIX, skipping bootstrap"
else
  echo "toolchain: bootstrapping into $PREFIX (multi-GB download, 15-30 min)"
  bootstrap_dir="$(mktemp -d)"
  trap 'rm -rf "$bootstrap_dir"' EXIT
  curl -f -L --retry 5 \
    https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta/-/archive/master/ghc-wasm-meta-master.tar.gz \
    | tar xz --strip-components=1 -C "$bootstrap_dir"

  # The current metadata points at a broken GitHub asset. Nix supplies the
  # native utilities used by setup; keep only the SDK/GHC bindists here.
  sed -i \
    's|https://github.com/haskell-wasm/ghc-wasm-bindists/releases/download/20251219T213239/wasi-sdk.tar.gz|https://github.com/haskell-wasm/ghc-wasm-bindists/releases/download/20260215T021831/wasi-sdk-debug.tar.gz|' \
    "$bootstrap_dir/autogen.json"
  PREFIX="$PREFIX" "$bootstrap_dir/setup.sh"
fi

# shellcheck disable=SC1091
. "$PREFIX/env"

echo "toolchain: wasm32-wasi-ghc   $(wasm32-wasi-ghc --numeric-version)"
echo "toolchain: wasm32-wasi-cabal $(wasm32-wasi-cabal --numeric-version)"
echo "toolchain: wasm-opt          $(wasm-opt --version)"
echo "toolchain: wasmtime          $(wasmtime --version)"

# The toolchain ships its own binaryen, wasmtime and nodejs, so nothing needs to
# be installed system-wide. Per-package size attribution uses wasm-ld's linker
# map rather than wabt's wasm-objdump, which keeps this script free of sudo.

# --- hledger sources ---------------------------------------------------------
if [ -d "$VENDOR/.git" ]; then
  echo "vendor: hledger already cloned at $VENDOR"
else
  echo "vendor: cloning hledger $HLEDGER_TAG"
  mkdir -p "$(dirname "$VENDOR")"
  git clone --depth 1 --branch "$HLEDGER_TAG" \
    https://github.com/simonmichael/hledger.git "$VENDOR"
fi
echo "vendor: hledger at $(git -C "$VENDOR" describe --tags --always)"

echo
echo "Setup complete. Run '. $PREFIX/env' before building."
