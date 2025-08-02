#!/bin/bash
set -euxo pipefail

echo "[start.sh] Starting virtual display and application..."

# Load .env manually if not already loaded
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# DISPLAY 環境変数をセット
export DISPLAY=:99

# Display 99 が生きてるなら Xvfb を起動しない
if [ ! -e /tmp/.X99-lock ]; then
  Xvfb :99 -screen 0 1024x768x24 &
else
  echo "Xvfb :99 already running, skipping..."
fi

# USE_SCREENSHOT_TRANSFER=true のときだけ転送処理を開始
if [ "${USE_SCREENSHOT_TRANSFER:-false}" = "true" ]; then
  echo "[start.sh] Screenshot transfer enabled"
  mkdir -p "$LOCAL_SCREENSHOT_DIR"

  (
  while true; do
    scp -q ${SSH_USER}@${REMOTE_HOST}:${REMOTE_DIR}/*.png "$LOCAL_SCREENSHOT_DIR" 2>/dev/null || true

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

# Node.js アプリケーションを起動
exec node server.js
