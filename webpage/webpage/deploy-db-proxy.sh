#!/bin/bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-ubuntu@119.91.129.106}"
SERVER_PATH="${SERVER_PATH:-/root/db-proxy}"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)/db-proxy/"
STAGING_PATH="${STAGING_PATH:-/tmp/mashang-db-proxy}"

echo "[1/5] 上传 db-proxy 临时目录: ${SERVER_HOST}:${STAGING_PATH}"
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  "$LOCAL_PATH" "${SERVER_HOST}:${STAGING_PATH}/"

echo "[2/5] 同步代码并保留服务器 .env"
ssh "$SERVER_HOST" "sudo test -f '${SERVER_PATH}/.env' && sudo rsync -a --delete --exclude=.env --exclude=node_modules '${STAGING_PATH}/' '${SERVER_PATH}/' && sudo chown -R root:root '${SERVER_PATH}'"

echo "[3/5] 安装依赖并运行测试"
ssh "$SERVER_HOST" "sudo sh -c \"cd '${SERVER_PATH}' && npm install --omit=dev && npm test\""

echo "[4/5] 重启 PM2"
ssh "$SERVER_HOST" "sudo mkdir -p /root/logs && sudo pm2 reload db-proxy --update-env && sudo pm2 save"

echo "[5/5] 健康检查"
curl --fail --silent --show-error "http://119.91.129.106/api/db/health"
echo
