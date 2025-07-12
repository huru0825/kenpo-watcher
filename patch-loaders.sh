#!/usr/bin/env bash
set -e

# cosmiconfig の空文字 require/import をすべて無効化
FILE="node_modules/cosmiconfig/dist/loaders.js"

if [ -f "$FILE" ]; then
  # require('')
  sed -i 's/require(["'\'']\s*["'\''])/undefined/g' "$FILE"
  # import('')
  sed -i 's/import(["'\'']\s*["'\''])/Promise.resolve({})/g' "$FILE"
else
  echo "⚠️ Warning: $FILE not found, skipping patch"
fi
