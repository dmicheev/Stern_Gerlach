#!/bin/sh
# Portable WASM build (physics-wasm -> frontend/src/physics/wasm-pkg).
#
# Requires: rustup with the wasm32-unknown-unknown target + wasm-pack.
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-pack
#
# Works on Linux, macOS (incl. Apple Silicon) and Windows (MSYS/Git Bash).
# On the author's broken dual-rustc MacBook use build-wasm-macos-arm64.sh
# instead (it pins the rustup toolchain and the Homebrew wasm-ld linker).

set -e
cd "$(dirname "$0")/.."
exec wasm-pack build --release --target web physics-wasm --out-dir ../frontend/src/physics/wasm-pkg "$@"
