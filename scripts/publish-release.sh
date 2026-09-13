#!/usr/bin/env bash
# Build, sign, notarize, and publish a Batch release to GitHub Releases —
# including the updater artifacts so "Check for Updates" in the app can find
# it. Bump the version in package.json / src-tauri/tauri.conf.json /
# src-tauri/Cargo.toml / src-tauri/mcp/Cargo.toml first; this script tags and
# publishes exactly that version.
#
#   scripts/publish-release.sh [release notes]
#
# Requires (one-time setup):
#   - gh, authenticated (`gh auth login`)
#   - a Developer ID Application certificate in the keychain (scripts/make-signing-cert.sh
#     for a local dev cert, or import a real one from developer.apple.com)
#   - notarization credentials: `xcrun notarytool store-credentials batch-notary
#     --apple-id you@example.com --team-id TEAMID` (uses an app-specific password
#     from appleid.apple.com)
#   - the updater signing key: `bunx tauri signer generate -w ~/.tauri/batch-updater.key`
#     (keep this file forever — losing it breaks updates for everyone already
#     on a version signed with it, since a new key can't verify old signatures)
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."

REPO="tanujapaunikar487/batch"
KEY_FILE="${TAURI_UPDATER_KEY_PATH:-$HOME/.tauri/batch-updater.key}"
[ -f "$KEY_FILE" ] || { echo "updater signing key not found at $KEY_FILE — run: bunx tauri signer generate -w $KEY_FILE"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI not found — https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated — run: gh auth login"; exit 1; }

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
NOTES="${1:-Batch $VERSION.}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "tag $TAG already exists — bump the version first (package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, src-tauri/mcp/Cargo.toml)"
  exit 1
fi

echo "▸ building + signing + notarizing v$VERSION (scripts/release.sh)…"
bash scripts/release.sh

APP="dist-mac/Batch.app"
DMG=$(ls dist-mac/Batch-"$VERSION"-universal.dmg 2>/dev/null || true)
[ -d "$APP" ] || { echo "build failed: $APP not found"; exit 1; }
[ -n "$DMG" ] && [ -f "$DMG" ] || { echo "build failed: dmg not found"; exit 1; }

# release.sh's own tauri-build step already produces an updater .tar.gz+.sig,
# but from the bundle BEFORE the layered-icon re-sign — repackage from the
# final dist-mac/Batch.app so the auto-updated copy matches a fresh install.
echo "▸ packaging the updater artifact from the final, icon-applied build…"
UPDATER_TAR="dist-mac/Batch.app.tar.gz"
rm -f "$UPDATER_TAR" "$UPDATER_TAR.sig"
(cd dist-mac && tar czf Batch.app.tar.gz Batch.app)
bunx tauri signer sign "$UPDATER_TAR" --private-key "$TAURI_SIGNING_PRIVATE_KEY" --password "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
SIGNATURE=$(cat "$UPDATER_TAR.sig")

PUB_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
python3 - "$VERSION" "$PUB_DATE" "$SIGNATURE" "$TAG" "$REPO" "$NOTES" <<'PY'
import json, sys
version, pub_date, signature, tag, repo, notes = sys.argv[1:7]
url = f"https://github.com/{repo}/releases/download/{tag}/Batch.app.tar.gz"
manifest = {
    "version": version,
    "notes": notes,
    "pub_date": pub_date,
    "platforms": {
        "darwin-aarch64": {"signature": signature, "url": url},
        "darwin-x86_64": {"signature": signature, "url": url},
    },
}
with open("dist-mac/latest.json", "w") as f:
    json.dump(manifest, f, indent=2)
print(f"▸ wrote dist-mac/latest.json for {version}")
PY

echo "▸ tagging ${TAG}…"
git tag "$TAG"
git push origin "$TAG"

echo "▸ publishing GitHub release…"
gh release create "$TAG" \
  "$DMG" \
  "$UPDATER_TAR" \
  "dist-mac/latest.json" \
  --repo "$REPO" \
  --title "Batch $VERSION" \
  --notes "$NOTES"

echo "✓ published $TAG — Batch's in-app updater (Settings → General → Check for Updates) will find it"
