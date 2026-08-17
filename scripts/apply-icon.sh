#!/usr/bin/env bash
# Give Batch.app a macOS 26 layered icon (assets/AppIcon.icon) so it stays a white
# tile with the black mark in light AND dark mode, then re-sign the bundle.
# Usage: bash scripts/apply-icon.sh path/to/Batch.app [signing-identity]
set -euo pipefail
APP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; IDENTITY="${2:-${APPLE_SIGNING_IDENTITY:-}}"
cd "$(dirname "$0")/.."
ICON="$PWD/assets/AppIcon.icon"
if ! xcrun --find actool >/dev/null 2>&1; then echo "actool not found (needs Xcode); skipping icon"; exit 0; fi
TMP=$(mktemp -d)
xcrun actool --app-icon AppIcon --include-all-app-icons --output-format human-readable-text \
  --platform macosx --minimum-deployment-target 12.0 \
  --output-partial-info-plist "$TMP/partial.plist" --compile "$TMP" "$ICON" >/dev/null
cp "$TMP/Assets.car" "$APP/Contents/Resources/Assets.car"
cp "$TMP/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
PLIST="$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconName AppIcon" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleIconName string AppIcon" "$PLIST"
rm -rf "$TMP"
# The bundle changed → re-sign (hardened runtime, timestamp) or ad-hoc.
if [ -n "$IDENTITY" ]; then
  codesign --force --deep --timestamp --options runtime --sign "$IDENTITY" "$APP"
else
  codesign --force --deep --sign - --identifier dev.tanuja.batch "$APP"
fi
echo "✓ layered icon applied to $APP"
