#!/usr/bin/env bash
set -e

echo "🔍 STEP1: Fetch latest artifact list (first item)"
# ① artifacts[0].id を直接拾う
ARTIFACT_JSON=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/huru0825/kenpo-watcher/actions/artifacts)
echo "📋 Artifact list: $(echo "$ARTIFACT_JSON" | jq '.artifacts | length') items"
ARTIFACT_ID=$(echo "$ARTIFACT_JSON" | jq '.artifacts[0].id')
echo "➡️ Using artifact ID: $ARTIFACT_ID"

echo "⬇️ STEP2: Downloading binary.zip (checking HTTP status)"
HTTP_STATUS=$(curl -w "%{http_code}" -L -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/huru0825/kenpo-watcher/actions/artifacts/${ARTIFACT_ID}/zip" \
  --output binary.zip)
echo "📡 HTTP status: $HTTP_STATUS"
if [ "$HTTP_STATUS" -ne 200 ]; then
  echo "❌ ERROR: artifact download failed"
  exit 1
fi

echo "🔍 STEP2.5: Show head of binary.zip"
head -c 200 binary.zip | sed 's/</\&lt;/g; s/>/\&gt;/g;'
# (上記で HTML かバイナリかを判別)

echo "📦 STEP3: Unzipping binary.zip"
unzip -o binary.zip

echo "📂 STEP3.5: List extracted files"
ls -R .

echo "🔍 STEP4: Locate & rename the binary"
ACTUAL=$(ls | grep '^kenpo-watcher' | head -n1)
if [ -z "$ACTUAL" ]; then
  echo "❌ ERROR: No binary found after unzip"
  exit 1
fi
echo "✅ Found $ACTUAL → renaming to ./kenpo-watcher"
mv "$ACTUAL" ./kenpo-watcher

echo "🔧 STEP5: Make it executable"
chmod +x kenpo-watcher

echo "🚀 Build succeeded"
