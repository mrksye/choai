#!/usr/bin/env bash
# Build both sites that get published.
#
# They are two names and two deployments, not one site with a corner cut out of
# it: the app is a service worker, a WebAssembly module and a cache to match,
# and the page that explains it is static files that should not carry any of
# that. Each ends up in its own directory, and each directory is what its host
# serves at the root of its name.
#
#   scripts/build-site.sh
#     apps/web/dist   -> std.choai.dev
#     lp/dist         -> choai.dev
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bun --cwd=apps/web run build
bun --cwd=lp run build

echo
echo "apps/web/dist   -> std.choai.dev"
echo "lp/dist         -> choai.dev"
