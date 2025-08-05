#!/bin/bash

set -euxo pipefail

echo "[start.sh] Starting virtual display and application..."

# .env ロード（Dockerで渡されないケースに対応）
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# DISPLAY 環境変数
export DISPLAY=:99

# Xvfb 起動
if [ ! -e /tmp/.X99-lock ]; then
  Xvfb :99 -screen 0 1024x768x24 &
else
  echo "Xvfb :99 already running, skipping..."
fi

# スクリーンショット転送有効化時の処理
if [ "${USE_SCREENSHOT_TRANSFER:-false}" = "true" ]; then
  echo "[start.sh] Screenshot transfer enabled"

  (
  while true; do
    if [ -f ~/.ssh/id_rsa ]; then
      scp -i ~/.ssh/id_rsa -q "${SSH_USER}@${REMOTE_HOST}:${REMOTE_DIR}/*.png" "$LOCAL_SCREENSHOT_DIR" 2>/dev/null || true
    fi

    for file in "$LOCAL_SCREENSHOT_DIR"/challenge-debug-*.png; do
      [ -f "$file" ] || continue
      newname="${LOCAL_SCREENSHOT_DIR}/$(basename "$file" .png)_$(date +%Y%m%d_%H%M%S).png"
      mv "$file" "$newname"
      echo "✅ saved: $newname"
    done

    sleep 10
  done
  ) &
else
  echo "[start.sh] Screenshot transfer disabled"
fi

# 必要なら明示的にディレクトリ移動（ホストで実行時）
cd "$(dirname "$0")"

# Node.js アプリケーション起動
exec node server.js
