#!/bin/sh

echo "🔐 鍵ファイルを配置..."
cp /mnt/Documents/id_rsa ~/.ssh/id_rsa
cp /mnt/Documents/id_rsa.pub ~/.ssh/id_rsa.pub
chmod 600 ~/.ssh/id_rsa

echo "🛂 .env をリモートに転送..."
scp -i ~/.ssh/id_rsa /mnt/Documents/kenpo-watcher/.env root@38.54.50.200:/root/kenpo-watcher/.env

echo "📡 SSH 接続とリモート処理を開始..."
ssh -i ~/.ssh/id_rsa root@38.54.50.200 <<'EOF'
  echo "📦 Git Pull 開始..."
  cd ~/kenpo-watcher
  git pull origin main

  echo "🚀 Docker 起動..."
  docker run --rm -it -v "$PWD:/app" -p 10000:10000 --env-file .env kenpo-watcher
EOF
