#!/usr/bin/env bash
set -euxo pipefail

echo "[start.sh] Starting virtual display and application..."

# Display 99 が生きてるなら Xvfb を起動しない
if [ ! -e /tmp/.X99-lock ]; then
  Xvfb :99 -screen 0 1024x768x24 &
else
  echo "Xvfb :99 already running, skipping..."
fi

# DISPLAY 環境変数をセット
export DISPLAY=:99

# アプリケーションを起動（package.json の "start"）
exec npm start
