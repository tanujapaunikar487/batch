#!/usr/bin/env bash
# Creates a self-signed *code-signing* certificate named "Batch Dev" in your login
# keychain, so every rebuild of Batch.app has the same identity and macOS keeps
# the Input Monitoring / Accessibility grants across builds.
# Run once (it will ask for your login keychain password to allow codesign to use the key):
#   bash scripts/make-signing-cert.sh
set -euo pipefail
NAME="Batch Dev"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$NAME\""; then
  echo "✓ '$NAME' already exists"; exit 0
fi
TMP=$(mktemp -d)
cat > "$TMP/ext.cnf" <<CNF
[req]
distinguished_name=dn
x509_extensions=v3
prompt=no
[dn]
CN=$NAME
[v3]
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
basicConstraints=critical,CA:false
CNF
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$TMP/ext.cnf" \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" >/dev/null 2>&1
openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -name "$NAME" \
  -out "$TMP/cert.p12" -passout pass:batch >/dev/null 2>&1
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
security import "$TMP/cert.p12" -k "$KEYCHAIN" -P batch -T /usr/bin/codesign -T /usr/bin/security >/dev/null
# Trust it for code signing (may prompt for your password).
security add-trusted-cert -d -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem" 2>/dev/null || \
  echo "  (couldn't mark as trusted automatically — open Keychain Access → 'Batch Dev' → Trust → Code Signing: Always Trust)"
# Let codesign use the key without a prompt on every build (asks for your keychain password once).
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$KEYCHAIN" >/dev/null 2>&1 || \
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s "$KEYCHAIN" || true
rm -rf "$TMP"
echo "✓ Created '$NAME'. Builds via 'bun run app:build' will now sign with it."
