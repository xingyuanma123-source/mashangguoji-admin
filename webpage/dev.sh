#!/usr/bin/env bash
#
# 本脚本只起本地 db-proxy + 前端，并要求 db-proxy 连接 staging。
# agent-proxy / ocr-proxy 当前指向 prod，未纳入本脚本；要用法务 Agent / OCR 需另行处理。

set -euo pipefail

STAGING_REF="ovtnnahdqljqqkponvhu"
PROD_REF="rwjbladqwubgjotlygyy"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PROXY_DIR="${ROOT_DIR}/db-proxy"
DB_ENV_FILE="${DB_PROXY_DIR}/.env"
DB_PROXY_PID=""

abort_staging_check() {
  echo "db-proxy/.env 未指向 staging,已中止。检查是否误用了 .env.prod.bak。" >&2
  exit 1
}

cleanup() {
  if [[ -n "${DB_PROXY_PID}" ]] && kill -0 "${DB_PROXY_PID}" 2>/dev/null; then
    echo
    echo "正在关闭 db-proxy..."
    kill "${DB_PROXY_PID}" 2>/dev/null || true
    wait "${DB_PROXY_PID}" 2>/dev/null || true
  fi
}

db_proxy_healthy() {
  local status_line=""

  if ! { exec 3<>/dev/tcp/127.0.0.1/3002; } 2>/dev/null; then
    return 1
  fi

  printf 'GET /api/db/health HTTP/1.1\r\nHost: 127.0.0.1:3002\r\nConnection: close\r\n\r\n' >&3
  if ! IFS= read -r -t 1 status_line <&3; then
    exec 3>&- 3<&-
    return 1
  fi
  exec 3>&- 3<&-

  [[ "${status_line}" == *" 200 "* ]]
}

trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

if [[ ! -f "${DB_ENV_FILE}" ]]; then
  abort_staging_check
fi

SUPABASE_URL="$(
  sed -n -E 's/^[[:space:]]*SUPABASE_URL[[:space:]]*=[[:space:]]*"?([^"#[:space:]]+)"?.*$/\1/p' "${DB_ENV_FILE}" | tail -n 1
)"

if [[ "${SUPABASE_URL}" == *"${PROD_REF}"* ]] || [[ "${SUPABASE_URL}" != *"${STAGING_REF}"* ]]; then
  abort_staging_check
fi

echo "staging 校验通过: db-proxy 指向 ${STAGING_REF}"
echo "启动 db-proxy: http://127.0.0.1:3002"

(
  cd "${DB_PROXY_DIR}"
  node server.js
) &
DB_PROXY_PID=$!

echo "等待 db-proxy 健康检查..."
for _ in {1..30}; do
  if db_proxy_healthy; then
    echo "db-proxy 已就绪。"
    echo "启动前端: http://localhost:5173"
    cd "${ROOT_DIR}"
    npm run dev
    exit $?
  fi

  if ! kill -0 "${DB_PROXY_PID}" 2>/dev/null; then
    echo "db-proxy 启动失败,已中止。" >&2
    exit 1
  fi

  sleep 1
done

echo "等待 db-proxy 启动超时,已中止。" >&2
exit 1
