#!/usr/bin/env bash
set -eux

# Chrome DEB をローカルに取得
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

# 作業ディレクトリを作成して展開
mkdir -p chrome
dpkg-deb -x google-chrome-stable_current_amd64.deb chrome/

# 実行パスを通す
export PUPPETEER_EXECUTABLE_PATH="$(pwd)/chrome/opt/google/chrome/google-chrome"
