#!/bin/sh
set -eux

mkdir -p /mnt/Documents/screenshots

scp -P 22 -i ~/.ssh/id_rsa \
  root@38.54.50.200:/home/screenshots/*.png \
  /mnt/Documents/screenshots/

echo "✅ スクショ取得完了（ファイルアプリで見れる）"
