#!/bin/sh
# Сборка WASM-движка (physics-wasm → frontend/src/physics/wasm-pkg).
#
# Почему не просто `pnpm build:wasm`: на этой машине ДВА rustc —
# Homebrew (по умолчанию, без std для wasm32) и rustup (~/.rustup, со std,
# но со сломанным rust-lld: отсутствует libLLVM.dylib). Рабочая комбинация:
# rustc/rustup-тулчейн + линкер wasm-ld из Homebrew (пакет lld).
#
# Детали и история: docs/troubleshooting-wasm.md

set -e
cd "$(dirname "$0")/.."

TOOLCHAIN_BIN="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin"
if [ ! -x "$TOOLCHAIN_BIN/rustc" ]; then
  echo "rustup-тулчейн не найден: $TOOLCHAIN_BIN" >&2
  echo "установи: rustup toolchain install stable && rustup target add wasm32-unknown-unknown" >&2
  exit 1
fi
if [ ! -x /opt/homebrew/bin/wasm-ld ]; then
  echo "wasm-ld не найден: brew install lld" >&2
  exit 1
fi

export PATH="$TOOLCHAIN_BIN:$PATH"
export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER=/opt/homebrew/bin/wasm-ld
exec wasm-pack build --release --target web physics-wasm --out-dir ../frontend/src/physics/wasm-pkg "$@"
