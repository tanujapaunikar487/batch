#!/usr/bin/env bash
# Build a distributable Batch: universal (Apple Silicon + Intel) Batch.app and a .dmg.
#
#   bun run dist:mac                     # ad-hoc signed (users right-click → Open once)
#   APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
#   APPLE_ID=you@example.com APPLE_PASSWORD=app-specific-pw APPLE_TEAM_ID=TEAMID \
#   bun run dist:mac                     # signed + notarized (no Gatekeeper prompt)
#
# Output: dist-mac/Batch-<version>-universal.dmg  (+ Batch.app next to it)
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
OUT="dist-mac"
rm -rf "$OUT"; mkdir -p "$OUT"

rustup target add x86_64-apple-darwin aarch64-apple-darwin >/dev/null 2>&1 || true

echo "▸ building universal Batch.app (v$VERSION)…"
bunx tauri build --target universal-apple-darwin --bundles app
APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Batch.app"
[ -d "$APP" ] || { echo "build failed: $APP not found"; exit 1; }
cp -R "$APP" "$OUT/Batch.app"

# Notarize + staple if credentials are present (Tauri already signed with APPLE_SIGNING_IDENTITY).
if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ] && [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "▸ notarizing…"
  ditto -c -k --keepParent "$OUT/Batch.app" "$OUT/Batch.zip"
  xcrun notarytool submit "$OUT/Batch.zip" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  xcrun stapler staple "$OUT/Batch.app"
  rm -f "$OUT/Batch.zip"
else
  echo "▸ not notarized (set APPLE_SIGNING_IDENTITY / APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID to notarize)"
  # Ad-hoc sign the whole bundle with a stable identifier so macOS permission
  # grants (Input Monitoring / Accessibility) survive re-downloads of the same build.
  codesign --force --deep --sign - --identifier dev.tanuja.batch "$OUT/Batch.app"
fi

echo "▸ making dmg…"
STAGE=$(mktemp -d)
cp -R "$OUT/Batch.app" "$STAGE/Batch.app"
ln -s /Applications "$STAGE/Applications"
DMG="$OUT/Batch-$VERSION-universal.dmg"
hdiutil create -volname "Batch" -srcfolder "$STAGE" -ov -format UDZO -imagekey zlib-level=9 "$DMG" >/dev/null
rm -rf "$STAGE"
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG" || true; fi
echo "✓ $DMG"
ls -la "$OUT"
