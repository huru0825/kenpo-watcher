#!/bin/sh
set -euxo pipefail

ENV_PATH="/mnt/Documents/.env"

echo "🔐 秘密鍵を配置"
cp /mnt/Documents/id_rsa ~/.ssh/id_rsa && chmod 600 ~/.ssh/id_rsa

# .env から値を事前に抜き出す（何度も grep しない）
SSH_PORT=$(grep SSH_PORT "$ENV_PATH" | cut -d '=' -f2)
SSH_USER=$(grep SSH_USER "$ENV_PATH" | cut -d '=' -f2)
REMOTE_HOST=$(grep REMOTE_HOST "$ENV_PATH" | cut -d '=' -f2)
REMOTE_DIR=$(grep REMOTE_DIR "$ENV_PATH" | cut -d '=' -f2)

echo "🛂 .env を転送"
scp -P "$SSH_PORT" -i ~/.ssh/id_rsa \
  "$ENV_PATH" \
  "$SSH_USER@$REMOTE_HOST:$REMOTE_DIR/.env"

echo "📡 SSH 経由で Git Pull & Docker 起動"
ssh -p "$SSH_PORT" -i ~/.ssh/id_rsa "$SSH_USER@$REMOTE_HOST" "\
  cd $REMOTE_DIR && \
  git pull origin main && \
  docker build -t kenpo-watcher . && \
  docker run --rm -it -p 10000:10000 --env-file .env kenpo-watcher \
"
