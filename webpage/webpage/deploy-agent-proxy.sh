#!/bin/bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-ubuntu@119.91.129.106}"
SERVER_PATH="${SERVER_PATH:-/root/agent-proxy}"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)/agent-proxy/"
STAGING_PATH="${STAGING_PATH:-/tmp/mashang-agent-proxy}"

echo "[1/5] 上传 agent-proxy 临时目录: ${SERVER_HOST}:${STAGING_PATH}"
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  "$LOCAL_PATH" "${SERVER_HOST}:${STAGING_PATH}/"

echo "[2/5] 同步代码并保留服务器 .env"
ssh "$SERVER_HOST" "sudo test -f '${SERVER_PATH}/.env' && sudo rsync -a --delete --exclude=.env --exclude=node_modules '${STAGING_PATH}/' '${SERVER_PATH}/' && sudo chown -R root:root '${SERVER_PATH}'"

echo "[3/5] 安装依赖并运行测试"
ssh "$SERVER_HOST" "sudo sh -c \"cd '${SERVER_PATH}' && npm install --omit=dev && npm test\""

echo "[4/5] 启动或重载 PM2"
ssh "$SERVER_HOST" "sudo mkdir -p /root/logs && if sudo pm2 describe agent-proxy >/dev/null 2>&1; then sudo pm2 reload agent-proxy --update-env; else sudo sh -c \"cd '${SERVER_PATH}' && pm2 start ecosystem.config.js\"; fi && sudo pm2 save"

echo "[5/5] 健康检查"
curl --fail --silent --show-error "http://119.91.129.106/api/agent/health"
echo
