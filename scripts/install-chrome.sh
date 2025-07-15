#!/usr/bin/env bash
set -euxo pipefail

echo "[install-chrome.sh] start"

# 1. .deb をダウンロード（すでにあればスキップ）
if [ ! -f google-chrome-stable_current_amd64.deb ]; then
  curl -SL -o google-chrome-stable_current_amd64.deb \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
fi

# 2. 展開先ディレクトリを作成
mkdir -p chrome/opt/google/chrome

# 3. dpkg-deb で展開（詳細ログが出る）
dpkg-deb -x google-chrome-stable_current_amd64.deb chrome/opt/google/chrome

echo "[install-chrome.sh] end"
