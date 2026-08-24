#!/usr/bin/env bash
# Build the batch-mcp sidecar as a universal binary and drop it where Tauri's
# externalBin expects it (src-tauri/binaries/batch-mcp-<triple>).
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/../src-tauri"
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null 2>&1 || true
mkdir -p binaries
# Placeholders so the crate's tauri-build (externalBin check) passes while we
# compile the sidecar itself (which recompiles this same crate).
for t in universal-apple-darwin aarch64-apple-darwin x86_64-apple-darwin; do
  [ -s "binaries/batch-mcp-$t" ] || : > "binaries/batch-mcp-$t"
done
echo "▸ building batch-mcp (arm64 + x86_64)…"
cargo build --release --bin batch-mcp --target aarch64-apple-darwin
cargo build --release --bin batch-mcp --target x86_64-apple-darwin
lipo -create \
  target/aarch64-apple-darwin/release/batch-mcp \
  target/x86_64-apple-darwin/release/batch-mcp \
  -output binaries/batch-mcp-universal-apple-darwin
cp -f binaries/batch-mcp-universal-apple-darwin binaries/batch-mcp-aarch64-apple-darwin
cp -f binaries/batch-mcp-universal-apple-darwin binaries/batch-mcp-x86_64-apple-darwin
echo "✓ sidecar → src-tauri/binaries/  ($(lipo -archs binaries/batch-mcp-universal-apple-darwin))"
