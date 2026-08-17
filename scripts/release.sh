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

# Auto-detect a Developer ID certificate in the keychain when none is given.
if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  DEVID=$( (security find-identity -v -p codesigning 2>/dev/null || true) | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"' || true)
  if [ -n "$DEVID" ]; then export APPLE_SIGNING_IDENTITY="$DEVID"; echo "▸ signing with: $DEVID"; fi
fi
# Notarization credentials: either APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID, or a keychain
# profile created once with:  xcrun notarytool store-credentials batch-notary --apple-id you@x --team-id TEAMID
NOTARY_PROFILE="${NOTARY_PROFILE:-batch-notary}"
VERSION=$(node -p "require('./package.json').version")
OUT="dist-mac"
rm -rf "$OUT"; mkdir -p "$OUT"

rustup target add x86_64-apple-darwin aarch64-apple-darwin >/dev/null 2>&1 || true

echo "▸ building universal Batch.app (v$VERSION)…"
bunx tauri build --target universal-apple-darwin --bundles app
APP="src-tauri/target/universal-apple-darwin/release/bundle/macos/Batch.app"
[ -d "$APP" ] || { echo "build failed: $APP not found"; exit 1; }
cp -R "$APP" "$OUT/Batch.app"

# Notarize + staple if we're signed and have credentials (env vars or keychain profile).
HAVE_PROFILE=0
xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 && HAVE_PROFILE=1
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ] && { [ "$HAVE_PROFILE" = 1 ] || { [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; }; }; then
  echo "▸ notarizing…"
  ditto -c -k --keepParent "$OUT/Batch.app" "$OUT/Batch.zip"
  if [ "$HAVE_PROFILE" = 1 ]; then
    xcrun notarytool submit "$OUT/Batch.zip" --keychain-profile "$NOTARY_PROFILE" --wait
  else
    xcrun notarytool submit "$OUT/Batch.zip" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
  fi
  xcrun stapler staple "$OUT/Batch.app"
  rm -f "$OUT/Batch.zip"
else
  echo "▸ not notarized (set APPLE_SIGNING_IDENTITY / APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID to notarize)"
  # Ad-hoc sign the whole bundle with a stable identifier so macOS permission
  # grants (Input Monitoring / Accessibility) survive re-downloads of the same build.
  codesign --force --deep --sign - --identifier dev.tanuja.batch "$OUT/Batch.app"
fi

echo "▸ making dmg…"
DMG="$OUT/Batch-$VERSION-universal.dmg"
# Styled installer window (black background, drag-to-install arrow) via dmgbuild;
# falls back to a plain hdiutil image if it isn't available.
if python3 -c "import dmgbuild" >/dev/null 2>&1 || python3 -m pip install --user --quiet dmgbuild >/dev/null 2>&1; then
  python3 -m dmgbuild -s scripts/dmg-settings.py -D "app=$OUT/Batch.app" "Batch" "$DMG"
else
  STAGE=$(mktemp -d)
  cp -R "$OUT/Batch.app" "$STAGE/Batch.app"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "Batch" -srcfolder "$STAGE" -ov -format UDZO -imagekey zlib-level=9 "$DMG" >/dev/null
  rm -rf "$STAGE"
fi
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
  codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG" || true
  # Notarize the disk image too (the app inside is already stapled) so it mounts without complaint.
  if [ "${HAVE_PROFILE:-0}" = 1 ]; then
    xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait >/dev/null && xcrun stapler staple "$DMG" >/dev/null && echo "▸ dmg notarized + stapled"
  elif [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
    xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait >/dev/null && xcrun stapler staple "$DMG" >/dev/null && echo "▸ dmg notarized + stapled"
  fi
fi
echo "✓ $DMG"
ls -la "$OUT"
