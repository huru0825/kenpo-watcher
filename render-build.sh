#!/usr/bin/env bash
set -e

# STEP1: 最新アーティファクト ID を取得
echo "🔍 STEP1: Fetch latest binary artifact ID"
ARTIFACT_ID=$(
  curl -s -H "Authorization: token $GITHUB_TOKEN" \
    https://api.github.com/repos/huru0825/kenpo-watcher/actions/artifacts \
  | jq '.artifacts[] | select(.name=="kenpo-watcher-binary") | .id'
)

# STEP2: ZIP をダウンロード
echo "⬇️ STEP2: Downloading binary.zip"
curl -L -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/huru0825/kenpo-watcher/actions/artifacts/${ARTIFACT_ID}/zip \
  --output binary.zip

# STEP3: ZIP を解凍
echo "📦 STEP3: Unzipping binary.zip"
unzip -o binary.zip

# STEP3.5: 展開結果を確認
echo "📂 STEP3.5: List all files"
ls -R .

# STEP4: 展開されたバイナリを自動で探してリネーム
echo "🔍 STEP4: Locate & rename the binary"
ACTUAL=$(ls | grep '^kenpo-watcher' | head -n1)
if [ -z "$ACTUAL" ]; then
  echo "❌ ERROR: No binary found"
  exit 1
fi
echo "Found: $ACTUAL → renaming to ./kenpo-watcher"
mv "$ACTUAL" ./kenpo-watcher

# STEP5: 実行権限を付与
echo "🔧 STEP5: Make it executable"
chmod +x kenpo-watcher

echo "🚀 Build succeeded"
