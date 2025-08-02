#!/bin/sh
set -euxo pipefail

echo "🔐 鍵を配置"
cp /mnt/Documents/id_rsa ~/.ssh/id_rsa && chmod 600 ~/.ssh/id_rsa

echo "🛂 .env を転送"
scp -P "$(grep SSH_PORT .env | cut -d '=' -f2)" -i ~/.ssh/id_rsa \
  /mnt/Documents/kenpo-watcher/.env \
  "$(grep SSH_USER .env | cut -d '=' -f2)"@"$(grep REMOTE_HOST .env | cut -d '=' -f2)":"$(grep REMOTE_DIR .env | cut -d '=' -f2)/.env"

echo "📡 SSH で Git Pull と Docker を一括実行"
ssh -p "$(grep SSH_PORT .env | cut -d '=' -f2)" -i ~/.ssh/id_rsa \
  "$(grep SSH_USER .env | cut -d '=' -f2)"@"$(grep REMOTE_HOST .env | cut -d '=' -f2)" "\
cd ~/kenpo-watcher && \
git pull origin main && \
docker run --rm -it -v \"\$PWD:/app\" -p 10000:10000 --env-file .env kenpo-watcher \
"
