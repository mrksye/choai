{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    bun
    nodejs
    git
    curl
    jq
    unzip
    zstd
    binaryen
    wasmtime
    pkgsCross.wasi32.stdenv.cc
  ];

  shellHook = ''
    if [ -f "$HOME/.ghc-wasm/env" ]; then
      # ghc-wasm-meta is installed by wasm/scripts/setup.sh rather than Nix.
      . "$HOME/.ghc-wasm/env"
      echo "wasm: $(wasm32-wasi-ghc --numeric-version)"
    else
      echo "wasm: toolchain not installed; run ./wasm/scripts/setup.sh"
    fi

    echo "choai development shell"
    echo "Run: cd apps/web && bun install && bun run dev"
  '';
}
