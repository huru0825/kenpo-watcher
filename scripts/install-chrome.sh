#!/usr/bin/env bash
set -euxo pipefail

echo "[install-chrome.sh] start"

# ここで xauth を入れる（ビルド時なら通る）
apt-get update && apt-get install -y xauth

CACHE_DIR="$(pwd)/.cache/puppeteer"
TARGET_DEB="google-chrome-stable_current_amd64.deb"

rm -rf "$CACHE_DIR"
mkdir -p "$CACHE_DIR"

if [ ! -f "$TARGET_DEB" ]; then
  curl -SL -o "$TARGET_DEB" \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
fi
dpkg-deb -x "$TARGET_DEB" "$CACHE_DIR"

echo "[install-chrome.sh] end (extracted to $CACHE_DIR)"
