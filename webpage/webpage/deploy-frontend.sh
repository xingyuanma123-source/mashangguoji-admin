#!/bin/bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-ubuntu@119.91.129.106}"
SITE_NAME="${SITE_NAME:-mashangguoji}"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
STAGING_PATH="${STAGING_PATH:-/tmp/mashang-frontend-dist}"

echo "[1/4] 构建前端"
cd "$LOCAL_ROOT"
pnpm run build

echo "[2/4] 从 Nginx 配置解析 ${SITE_NAME} web 根目录"
REMOTE_ROOT="$(
  ssh "$SERVER_HOST" "if sudo test -f '/etc/nginx/sites-enabled/${SITE_NAME}'; then sudo awk '\$1 == \"root\" { value=\$2; sub(/;$/, \"\", value); print value; exit }' '/etc/nginx/sites-enabled/${SITE_NAME}'; else sudo nginx -T 2>/dev/null; fi" |
  awk -v site="$SITE_NAME" '
    /^\/[^[:space:]]+$/ { print; exit }
    /server[[:space:]]*\{/ && !in_server { in_server=1; depth=0; matched=0; root="" }
    in_server {
      opens=gsub(/\{/, "{")
      closes=gsub(/\}/, "}")
      depth += opens - closes
    }
    in_server && /server_name/ && index($0, site) { matched=1 }
    in_server && /^[[:space:]]*root[[:space:]]+/ {
      value=$0
      sub(/^[[:space:]]*root[[:space:]]+/, "", value)
      sub(/;.*/, "", value)
      root=value
    }
    in_server && depth == 0 {
      if (matched && root != "") { print root; exit }
      in_server=0
    }
  '
)"

if [[ -z "$REMOTE_ROOT" ]]; then
  echo "未找到 server_name 包含 ${SITE_NAME} 的 Nginx root 指令" >&2
  exit 1
fi
echo "目标目录: ${REMOTE_ROOT}"

echo "[3/4] 上传并同步 dist/"
rsync -avz --delete "$LOCAL_ROOT/dist/" "${SERVER_HOST}:${STAGING_PATH}/"
ssh "$SERVER_HOST" "sudo mkdir -p '${REMOTE_ROOT}' && sudo rsync -a --delete '${STAGING_PATH}/' '${REMOTE_ROOT}/' && sudo chown -R www-data:www-data '${REMOTE_ROOT}'"

echo "[4/4] 校验 Nginx 与站点"
ssh "$SERVER_HOST" "sudo nginx -t"
curl --fail --silent --show-error --head "http://119.91.129.106/" | head -n 1
