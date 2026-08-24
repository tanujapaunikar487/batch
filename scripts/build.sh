#!/usr/bin/env bash
# Build Batch.app; sign with the stable "Batch Dev" identity when it exists
# (see scripts/make-signing-cert.sh), otherwise ad-hoc.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
if [ -z "${APPLE_SIGNING_IDENTITY:-}" ] && security find-identity -v -p codesigning 2>/dev/null | grep -q '"Batch Dev"'; then
  export APPLE_SIGNING_IDENTITY="Batch Dev"
  echo "signing with: Batch Dev"
fi
bash "$(dirname "$0")/build-sidecar.sh"
bunx tauri build "$@"
APP="src-tauri/target/release/bundle/macos/Batch.app"
[ -d "$APP" ] && bash scripts/apply-icon.sh "$APP" "${APPLE_SIGNING_IDENTITY:-}" || true
