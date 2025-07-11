#!/usr/bin/env bash
set -e

echo "🔍 STEP1: Fetch latest artifact list"
ARTIFACT_JSON=$(
  curl -s -H "Authorization: token $GITHUB_TOKEN" \
    https://api.github.com/repos/huru0825/kenpo-watcher/actions/artifacts
)
COUNT=$(echo "$ARTIFACT_JSON" | jq '.artifacts | length')
echo "📋 Artifact count: $COUNT"
if [ "$COUNT" -eq 0 ]; then
  echo "❌ Error: No artifacts found"
  exit 1
fi

ARTIFACT_ID=$(echo "$ARTIFACT_JSON" | jq '.artifacts[0].id')
echo "➡️ Using artifact ID: $ARTIFACT_ID"

echo "⬇️ STEP2: Downloading binary.zip"
HTTP=$(curl -w "%{http_code}" -L -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/huru0825/kenpo-watcher/actions/artifacts/${ARTIFACT_ID}/zip" \
  --output binary.zip)
echo "📡 HTTP status: $HTTP"
if [ "$HTTP" -ne 200 ]; then
  echo "❌ Error: Failed to download artifact"
  exit 1
fi

echo "📦 STEP3: Unzipping binary.zip"
unzip -o binary.zip

echo "📂 STEP4: Locate & rename the binary"
BIN=$(ls | grep '^kenpo-watcher' | head -n1)
if [ -z "$BIN" ]; then
  echo "❌ Error: No binary file found"
  exit 1
fi
echo "✅ Found $BIN → renaming to ./kenpo-watcher"
mv "$BIN" ./kenpo-watcher

echo "🔧 STEP5: Make executable"
chmod +x kenpo-watcher

echo "🚀 Build succeeded"
