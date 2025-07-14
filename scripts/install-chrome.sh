#!/usr/bin/env bash
set -eux

# ── 依存パッケージを更新／インストール ──
apt-get update
apt-get install -y wget gnupg2

# ── Google Chrome のダウンロード ──
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

# ── インストール（依存エラーがあれば自動解決） ──
dpkg -i google-chrome-stable_current_amd64.deb || apt-get install -f -y

# ── 後片付け ──
rm google-chrome-stable_current_amd64.deb
