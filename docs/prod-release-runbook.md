# Prod 上线手册

> 本手册用于马上国际客服后台生产环境上线。涉及服务器、数据库、CI、prod 的动作必须先确认方案再执行。
> 默认生产服务器: `ubuntu@119.91.129.106`。已核对四个部署脚本均使用该登录用户;需要提权的服务器命令通过 `sudo` 执行。
> 数据库结构变更先看 `docs/migrations-ledger.md`。

## 适用范围

本手册覆盖四个部署脚本:

| 模块 | 脚本 | 默认远端目录 | 默认临时目录 | 对外健康检查 |
|---|---|---|---|---|
| 前端静态站点 | `webpage/deploy-frontend.sh` | 从 Nginx `SITE_NAME` 的 `root` 自动解析 | `/tmp/mashang-frontend-dist` | `HEAD http://119.91.129.106/` |
| db-proxy | `webpage/deploy-db-proxy.sh` | `/root/db-proxy` | `/tmp/mashang-db-proxy` | `GET /api/db/health` |
| agent-proxy | `webpage/deploy-agent-proxy.sh` | `/root/agent-proxy` | `/tmp/mashang-agent-proxy` | `GET /api/agent/health` |
| ocr-proxy | `webpage/ocr-proxy/deploy.sh` | `/root/ocr-proxy` | `/tmp/mashang-ocr-proxy` | `GET /api/ocr/health` |

不在本手册范围: `webpage/deploy.sh` 是旧的 JT808 服务部署脚本,不要当作客服后台前端/proxy 上线脚本使用。

## 上线前确认

1. 确认本地分支、提交和工作区:

```bash
git status --short --branch
git log -1 --oneline --decorate
```

2. 确认本次是否包含数据库变更。
   - 如果包含,先看 `docs/migrations-ledger.md`。
   - 任何 migration 必须先 apply staging 验证,再 apply prod。
   - 未经确认不要对 prod 执行 `supabase db push`。

3. 确认服务器关键文件存在且密钥只在服务器 `.env`:

```bash
ssh ubuntu@119.91.129.106 "sudo test -f /root/db-proxy/.env && sudo test -f /root/agent-proxy/.env && sudo test -f /root/ocr-proxy/.env"
```

4. 确认 PM2 和 Nginx 当前状态:

```bash
ssh ubuntu@119.91.129.106 "sudo pm2 status && sudo nginx -t"
```

5. 查出并记录前端实际 Nginx root,用于上线备份和回滚。该命令复用 `deploy-frontend.sh` 的解析逻辑;输出的 `PROD_WEB_ROOT` 必须记录到本次上线记录里。

```bash
SITE_NAME="${SITE_NAME:-mashangguoji}"
PROD_WEB_ROOT="$(
  ssh ubuntu@119.91.129.106 "if sudo test -f '/etc/nginx/sites-enabled/${SITE_NAME}'; then sudo awk '\$1 == \"root\" { value=\$2; sub(/;$/, \"\", value); print value; exit }' '/etc/nginx/sites-enabled/${SITE_NAME}'; else sudo nginx -T 2>/dev/null; fi" |
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
test -n "$PROD_WEB_ROOT"
printf 'PROD_WEB_ROOT=%s\n' "$PROD_WEB_ROOT"
```

6. 上线前基线健康检查:

```bash
curl --fail --silent --show-error http://119.91.129.106/api/db/health && echo
curl --fail --silent --show-error http://119.91.129.106/api/agent/health && echo
curl --fail --silent --show-error http://119.91.129.106/api/ocr/health && echo
curl --fail --silent --show-error --head http://119.91.129.106/ | head -n 1
```

## 环境与密钥

### 前端

前端 bundle 默认不携带环境切换。运行时请求同源相对路径:

- `/api/db`
- `/api/agent`
- `/api/ocr`

prod/staging 切换发生在 Nginx 反向代理层,不是前端构建期 env。

### db-proxy `/root/db-proxy/.env`

必填:

```dotenv
SUPABASE_URL=https://rwjbladqwubgjotlygyy.supabase.co
SUPABASE_SERVICE_KEY=<prod service_role>
SESSION_SECRET=<长随机值,必须与 agent-proxy 一致>
SESSION_TTL_SECONDS=43200
PORT=3002
HOST=127.0.0.1
ALLOWED_ORIGINS=http://119.91.129.106,<生产域名>
```

注意:

- `SESSION_SECRET` 在 `NODE_ENV=production` 下必填。
- `SUPABASE_SERVICE_KEY` 不进 git,不贴到对话里。

### agent-proxy `/root/agent-proxy/.env`

必填:

```dotenv
SUPABASE_URL=https://rwjbladqwubgjotlygyy.supabase.co
SUPABASE_SERVICE_KEY=<prod service_role>
SESSION_SECRET=<必须与 db-proxy 完全一致>
LLM_API_KEY=<MiMo Token Plan key>
AGENT_MODEL=mimo-v2.5-pro
LLM_ENDPOINT=https://token-plan-sgp.xiaomimimo.com/v1/chat/completions
PORT=3003
HOST=127.0.0.1
ALLOWED_ORIGINS=http://119.91.129.106,<生产域名>
```

可选:

```dotenv
LLM_MAX_ATTEMPTS=3
LLM_RETRY_BASE_MS=500
RADAR_SCAN_HOUR=8
```

### ocr-proxy `/root/ocr-proxy/.env`

必填:

```dotenv
TENCENT_SECRET_ID=<腾讯云 SecretId>
TENCENT_SECRET_KEY=<腾讯云 SecretKey>
PORT=3001
HOST=127.0.0.1
OCR_REGION=ap-guangzhou
MAX_FILE_SIZE_MB=20
ALLOWED_ORIGINS=http://119.91.129.106,<生产域名>
```

注意:

- 代码默认 `MAX_FILE_SIZE_MB=20`。
- 部署脚本会尝试把 Nginx `/api/ocr/` block 里的 `client_max_body_size 10M;` 改为 `20M;`。

## Nginx 反向代理要求

这些 `location` 必须放在 `location /` 之前。

```nginx
location /api/db/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50M;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}

location /api/agent/ {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_connect_timeout 10s;
}

location /api/ocr/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin "";
    client_max_body_size 20M;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}
```

修改后必须执行:

```bash
ssh ubuntu@119.91.129.106 "sudo nginx -t && sudo nginx -s reload"
```

## 四个脚本实际做什么

### 前端 `webpage/deploy-frontend.sh`

默认变量:

```bash
SERVER_HOST=ubuntu@119.91.129.106
SITE_NAME=mashangguoji
STAGING_PATH=/tmp/mashang-frontend-dist
```

执行流程:

1. 在 `webpage/` 本地执行 `pnpm run build`。
2. 从远端 Nginx 解析 `SITE_NAME` 对应站点的 `root`:
   - 优先读 `/etc/nginx/sites-enabled/${SITE_NAME}`。
   - 如果文件不存在,回退到 `sudo nginx -T`。
3. `rsync --delete` 上传本地 `webpage/dist/` 到远端临时目录。
4. 远端 `sudo rsync -a --delete` 从临时目录同步到 Nginx root,并 `chown -R www-data:www-data`。
5. 远端 `sudo nginx -t`。
6. 本地 `curl --head http://119.91.129.106/`。

风险点:

- `--delete` 会删除目标目录里本次 dist 没有的文件。执行前必须确认解析出的 Nginx root 正确。
- 脚本不自动备份旧 dist。需要回滚能力时,上线前先备份 Nginx root 或保留上一版构建产物。

执行:

```bash
cd webpage
./deploy-frontend.sh
```

指定 staging 站点时:

```bash
cd webpage
SITE_NAME=mashangguoji-staging ./deploy-frontend.sh
```

### db-proxy `webpage/deploy-db-proxy.sh`

默认变量:

```bash
SERVER_HOST=ubuntu@119.91.129.106
SERVER_PATH=/root/db-proxy
STAGING_PATH=/tmp/mashang-db-proxy
```

执行流程:

1. `rsync --delete` 上传 `webpage/db-proxy/` 到远端临时目录,排除 `node_modules`、`.env`、`*.log`。
2. 远端确认 `${SERVER_PATH}/.env` 存在。
3. 远端从临时目录同步到 `/root/db-proxy`,继续排除 `.env` 和 `node_modules`,并 `chown -R root:root`。
4. 远端执行 `npm install --omit=dev && npm test`。
5. 远端执行 `pm2 reload db-proxy --update-env && pm2 save`。
6. 本地请求 `http://119.91.129.106/api/db/health`。

前置条件:

- `/root/db-proxy/.env` 必须已存在。
- PM2 里应已有名为 `db-proxy` 的进程。该脚本没有缺进程时自动 `pm2 start` 的分支。

执行:

```bash
cd webpage
./deploy-db-proxy.sh
```

### agent-proxy `webpage/deploy-agent-proxy.sh`

默认变量:

```bash
SERVER_HOST=ubuntu@119.91.129.106
SERVER_PATH=/root/agent-proxy
STAGING_PATH=/tmp/mashang-agent-proxy
```

执行流程:

1. `rsync --delete` 上传 `webpage/agent-proxy/` 到远端临时目录,排除 `node_modules`、`.env`、`*.log`。
2. 远端确认 `${SERVER_PATH}/.env` 存在。
3. 远端从临时目录同步到 `/root/agent-proxy`,继续排除 `.env` 和 `node_modules`,并 `chown -R root:root`。
4. 远端执行 `npm install --omit=dev && npm test`。
5. 如果 PM2 已有 `agent-proxy`,执行 `pm2 reload agent-proxy --update-env`。
6. 如果 PM2 没有 `agent-proxy`,在 `/root/agent-proxy` 执行 `pm2 start ecosystem.config.js`。
7. `pm2 save`。
8. 本地请求 `http://119.91.129.106/api/agent/health`。

前置条件:

- `/root/agent-proxy/.env` 必须已存在。
- `SESSION_SECRET` 必须与 db-proxy 一致,否则登录 cookie 无法被 agent-proxy 验证。
- Nginx `/api/agent/` 必须关闭 `proxy_buffering`,否则 SSE 体验会异常。

执行:

```bash
cd webpage
./deploy-agent-proxy.sh
```

### ocr-proxy `webpage/ocr-proxy/deploy.sh`

默认变量:

```bash
SERVER_HOST=ubuntu@119.91.129.106
SERVER_PATH=/root/ocr-proxy
STAGING_PATH=/tmp/mashang-ocr-proxy
NGINX_SITE=/etc/nginx/sites-enabled/mashangguoji
```

执行流程:

1. `rsync --delete` 上传 `webpage/ocr-proxy/` 到远端临时目录,排除 `node_modules`、`.env`、`*.log`。
2. 明确检查 `/root/ocr-proxy/.env` 是否存在;不存在则停止并提示先创建。
3. 远端从临时目录同步到 `/root/ocr-proxy`,继续排除 `.env` 和 `node_modules`,并 `chown -R root:root`。
4. 远端执行 `npm install --omit=dev`。
5. 远端创建 `/root/logs`。
6. 远端在 Nginx site 文件的 `/api/ocr/` block 中把 `client_max_body_size 10M;` 替换成 `20M;`。
7. 远端执行 `nginx -t && nginx -s reload`。
8. 远端执行 `pm2 reload ocr-proxy --update-env && pm2 save`。

前置条件:

- `/root/ocr-proxy/.env` 必须已存在。
- PM2 里应已有名为 `ocr-proxy` 的进程。该脚本没有缺进程时自动 `pm2 start` 的分支。
- 如果 Nginx 配置里不是精确的 `client_max_body_size 10M;`,脚本的 `sed` 可能不会改动该值;执行后需要检查 `nginx -T`。

执行:

```bash
cd webpage/ocr-proxy
./deploy.sh
curl --fail --silent --show-error http://119.91.129.106/api/ocr/health && echo
```

## 推荐上线顺序

如果本次包含数据库变更:

1. 确认 `docs/migrations-ledger.md` 中本次 migration 的 staging 状态。
2. 单独走数据库上线审批。
3. apply 到 prod 后,只读核对 `supabase_migrations.schema_migrations` 和关键表/视图。
4. 更新 `docs/migrations-ledger.md` 的 prod 状态。

如果本次包含服务端和前端改动,推荐顺序:

1. db-proxy
2. agent-proxy
3. ocr-proxy
4. frontend

原因:

- 前端最终切流到新 bundle 前,后端 API 应先可用。
- agent-proxy 依赖与 db-proxy 相同的 `SESSION_SECRET` 和 Supabase 数据。
- OCR 是独立服务,但前端 OCR 上传依赖 `/api/ocr/` Nginx 路由和文件大小设置。

如果是纯前端改动,只执行 frontend 脚本。
如果是纯某个 proxy 改动,只执行对应 proxy 脚本并做健康检查。

## 上线后验证

基础验证:

```bash
curl --fail --silent --show-error http://119.91.129.106/api/db/health && echo
curl --fail --silent --show-error http://119.91.129.106/api/agent/health && echo
curl --fail --silent --show-error http://119.91.129.106/api/ocr/health && echo
curl --fail --silent --show-error --head http://119.91.129.106/ | head -n 1
```

前端真实版本校验。只看 HTTP 200 不够,必须确认生产首页引用的是本次构建生成的新 bundle hash:

```bash
EXPECTED_FRONTEND_ASSET="$(grep -oE '/assets/[^"]+\.js' webpage/dist/index.html | head -n 1)"
test -n "$EXPECTED_FRONTEND_ASSET"
curl --fail --silent --show-error http://119.91.129.106/ | grep -F "$EXPECTED_FRONTEND_ASSET"
curl --fail --silent --show-error "http://119.91.129.106${EXPECTED_FRONTEND_ASSET}" >/dev/null
printf 'verified frontend asset: %s\n' "$EXPECTED_FRONTEND_ASSET"
```

服务器验证:

```bash
ssh ubuntu@119.91.129.106 "sudo pm2 status && sudo nginx -t"
ssh ubuntu@119.91.129.106 "sudo pm2 logs db-proxy --lines 50 --nostream"
ssh ubuntu@119.91.129.106 "sudo pm2 logs agent-proxy --lines 50 --nostream"
ssh ubuntu@119.91.129.106 "sudo pm2 logs ocr-proxy --lines 50 --nostream"
```

业务验证:

1. 打开生产后台首页,确认静态资源加载正常。
2. 登录客服后台,确认 cookie 会话可用。
3. 打开一个需要 Supabase 数据的列表页,确认 `/api/db/` 可用。
4. 打开法务 Agent 页面,发送一条低风险测试问题,确认 SSE 有流式响应。
5. 上传一张小图片到 OCR 流程,确认 `/api/ocr/recognize` 返回识别结果。

## 回滚

### 前端

`deploy-frontend.sh` 不保留旧 dist。推荐在上线前用"上线前确认"里已经查到并记录的 `PROD_WEB_ROOT` 备份远端 Nginx root:

```bash
test -n "$PROD_WEB_ROOT"
PROD_WEB_ROOT_PARENT="$(dirname "$PROD_WEB_ROOT")"
PROD_WEB_ROOT_NAME="$(basename "$PROD_WEB_ROOT")"
FRONTEND_BACKUP="/root/backups/mashangguoji-web-$(date +%Y%m%d%H%M%S).tar.gz"
ssh ubuntu@119.91.129.106 "sudo mkdir -p /root/backups && sudo tar -czf '$FRONTEND_BACKUP' -C '$PROD_WEB_ROOT_PARENT' '$PROD_WEB_ROOT_NAME'"
printf 'FRONTEND_BACKUP=%s\n' "$FRONTEND_BACKUP"
```

回滚时把备份解回 Nginx root,再执行:

```bash
test -n "$PROD_WEB_ROOT"
test -n "$FRONTEND_BACKUP"
PROD_WEB_ROOT_PARENT="$(dirname "$PROD_WEB_ROOT")"
ssh ubuntu@119.91.129.106 "sudo tar -xzf '$FRONTEND_BACKUP' -C '$PROD_WEB_ROOT_PARENT' && sudo chown -R www-data:www-data '$PROD_WEB_ROOT'"
ssh ubuntu@119.91.129.106 "sudo nginx -t && sudo nginx -s reload"
```

也可以本地切回上一版提交后重新执行 `webpage/deploy-frontend.sh`。

### proxy 服务

proxy 脚本也不自动备份 `/root/db-proxy`、`/root/agent-proxy`、`/root/ocr-proxy`。推荐上线前备份对应目录:

```bash
ssh ubuntu@119.91.129.106 "sudo mkdir -p /root/backups && sudo tar --exclude=node_modules -czf /root/backups/db-proxy-$(date +%Y%m%d%H%M%S).tar.gz -C /root db-proxy"
ssh ubuntu@119.91.129.106 "sudo mkdir -p /root/backups && sudo tar --exclude=node_modules -czf /root/backups/agent-proxy-$(date +%Y%m%d%H%M%S).tar.gz -C /root agent-proxy"
ssh ubuntu@119.91.129.106 "sudo mkdir -p /root/backups && sudo tar --exclude=node_modules -czf /root/backups/ocr-proxy-$(date +%Y%m%d%H%M%S).tar.gz -C /root ocr-proxy"
```

回滚后重装依赖并 reload 对应 PM2 进程:

```bash
ssh ubuntu@119.91.129.106 "sudo sh -c 'cd /root/db-proxy && npm install --omit=dev && npm test' && sudo pm2 reload db-proxy --update-env && sudo pm2 save"
ssh ubuntu@119.91.129.106 "sudo sh -c 'cd /root/agent-proxy && npm install --omit=dev && npm test' && sudo pm2 reload agent-proxy --update-env && sudo pm2 save"
ssh ubuntu@119.91.129.106 "sudo sh -c 'cd /root/ocr-proxy && npm install --omit=dev' && sudo pm2 reload ocr-proxy --update-env && sudo pm2 save"
```

## 脚本改进待办

这些不是上线必需,但后续可降低 prod 风险:

1. `deploy-db-proxy.sh` 缺 PM2 进程时自动 `pm2 start ecosystem.config.js`。
2. `webpage/ocr-proxy/deploy.sh` 缺 PM2 进程时自动 `pm2 start ecosystem.config.js`。
3. 四个部署脚本加入 `DRY_RUN=1` 或先打印目标路径确认。
4. 前端脚本在 `rsync --delete` 前自动备份远端 Nginx root。
5. proxy 脚本在覆盖 `/root/*-proxy` 前自动备份不含 `.env` 和 `node_modules` 的代码目录。
