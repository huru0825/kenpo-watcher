#!/usr/bin/env bash
set -euxo pipefail

# 1) Puppeteer の postinstall をスキップして dev 依存ごと一気に入れる
PUPPETEER_SKIP_DOWNLOAD=true npm install --omit=dev --loglevel=verbose

# 2) Chrome をキャッシュ下にダウンロード
mkdir -p .cache/puppeteer
npx puppeteer install chrome --path="$(pwd)/.cache/puppeteer"

# 3) バンドル→バイナリ化
npm run bundle --loglevel=verbose
npm run build-binary --loglevel=verbose

# 4) 実行ファイルに実行権を付与
chmod +x kenpo-watcher
