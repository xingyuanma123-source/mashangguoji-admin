#!/bin/bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-ubuntu@119.91.129.106}"
SERVER_PATH="${SERVER_PATH:-/root/ocr-proxy}"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)/"
STAGING_PATH="${STAGING_PATH:-/tmp/mashang-ocr-proxy}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/mashangguoji}"

echo "[1/5] 上传代码到临时目录: ${SERVER_HOST}:${STAGING_PATH}"
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  "$LOCAL_PATH" "${SERVER_HOST}:${STAGING_PATH}/"

echo "[2/5] 检查 .env 并同步代码"
if ! ssh "$SERVER_HOST" "sudo test -f ${SERVER_PATH}/.env"; then
  echo "⚠️  服务器上没有 .env 文件！"
  echo "请先运行：ssh ${SERVER_HOST}"
  echo "  cp ${SERVER_PATH}/.env.example ${SERVER_PATH}/.env"
  echo "  vim ${SERVER_PATH}/.env  # 填入腾讯云 SecretId/SecretKey"
  exit 1
fi
ssh "$SERVER_HOST" "sudo rsync -a --delete --exclude=.env --exclude=node_modules '${STAGING_PATH}/' '${SERVER_PATH}/' && sudo chown -R root:root '${SERVER_PATH}'"

echo "[3/5] 安装依赖"
ssh "$SERVER_HOST" "sudo sh -c \"cd '${SERVER_PATH}' && npm install --omit=dev\""

echo "[4/5] 创建日志目录"
ssh "$SERVER_HOST" "sudo mkdir -p /root/logs"

echo "[5/5] 启动 / 重启 PM2"
ssh "$SERVER_HOST" "sudo sed -i \"/location \\/api\\/ocr\\//,/^[[:space:]]*}/ s/client_max_body_size 10M;/client_max_body_size 20M;/\" '${NGINX_SITE}' && sudo nginx -t && sudo nginx -s reload && sudo pm2 reload ocr-proxy --update-env"
ssh "$SERVER_HOST" "sudo pm2 save"

echo ""
echo "✅ 部署完成！测试一下："
echo "  curl http://119.91.129.106/api/ocr/health"
