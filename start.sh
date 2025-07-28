#!/usr/bin/env bash
set -euxo pipefail

echo "[start.sh] Starting virtual display and application..."

# 仮想ディスプレイ起動
Xvfb :99 -screen 0 1024x768x24 &

# DISPLAY 環境変数設定
export DISPLAY=:99

# アプリケーション起動（package.json の "start" を実行）
exec "$@"
