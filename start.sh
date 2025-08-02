#!/bin/bash
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

# SSH 経由でスクリーンショットをローカルに転送するスクリプトをバックグラウンドで起動
echo "[start.sh] Starting screenshot transfer script..."
REMOTE_USER="root"
REMOTE_HOST="your.lightnode.ip"   # ←ここを実環境用に書き換えてね
REMOTE_DIR="/app/tmp"
LOCAL_DIR="/Users/youruser/Documents/screenshots"  # ←iPadファイルアプリからアクセス可能な絶対パスを指定
mkdir -p "$LOCAL_DIR"

(
while true; do
  scp -q ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/*.png "$LOCAL_DIR" 2>/dev/null || true

  for file in "$LOCAL_DIR"/challenge-debug-*.png; do
    [ -f "$file" ] || continue
    newname="${LOCAL_DIR}/$(basename "$file" .png)_$(date +%Y%m%d_%H%M%S).png"
    mv "$file" "$newname"
    echo "✅ saved: $newname"
  done

  sleep 10
done
) &

# Node.js アプリケーションを直接起動
exec node server.js
