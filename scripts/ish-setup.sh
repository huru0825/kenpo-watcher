#!/bin/sh

echo "🔐 鍵ファイルを配置..."
cp /mnt/Documents/id_rsa ~/.ssh/id_rsa
cp /mnt/Documents/id_rsa.pub ~/.ssh/id_rsa.pub
chmod 600 ~/.ssh/id_rsa

echo "📡 SSH 接続を開始..."
ssh -i ~/.ssh/id_rsa root@38.54.50.200
