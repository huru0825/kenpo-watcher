#!/usr/bin/env bash
set -eux

# 必要パッケージのインストール
apt-get update
apt-get install -y \
  wget \
  apt-transport-https \
  gnupg \
  ca-certificates

# Google の公開鍵を登録
wget -qO- https://dl.google.com/linux/linux_signing_key.pub | apt-key add -

# リポジトリを追加
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" \
  > /etc/apt/sources.list.d/google-chrome.list

# インストール
apt-get update
apt-get install -y google-chrome-stable

# パーミッション調整
chmod +x /usr/bin/google-chrome-stable
