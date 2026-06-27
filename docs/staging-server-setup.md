# Staging 服务器部署方案

本文是 `175.178.220.139` staging 测试服务器的部署方案。只用于 staging 测试环境，不触碰 prod 服务器 `119.91.129.106`。

## 背景与边界

- 服务器：`175.178.220.139`（腾讯云轻量，Ubuntu 24.04）。
- SSH：本机别名 `mashang-staging`，用户 `ubuntu`，密钥免密登录。
- 用途：给别人公网测试后台 + 作为上线演练场；所有后端代理连接 staging 库 `ovtnnahdqljqqkponvhu`。
- 当前摸底结论：
  - Nginx `1.24.0` 已安装并运行，只启用 `default` site，当前 root 是 `/var/www/html`。
  - Node `v22.23.0`、npm `10.9.8`、pm2 装在 `ubuntu` 用户的 nvm 下。
  - SSH 非登录 shell 和 `sudo sh -c` 都找不到 `node/npm/pm2`，存在 PATH 坑。
  - `/root/db-proxy`、`/root/agent-proxy`、`/root/ocr-proxy` 均不存在；没有 staging `.env`。
  - 当前只有 `80` 监听；`443/4002/4003` 未监听；`ufw` inactive。
- 已定架构：
  - proxy 放在 `/home/ubuntu/` 下，用 `ubuntu` 用户运行。
  - 公网用 Nginx Basic Auth 保护。
  - 第一阶段只部署前端 + `db-proxy`，暂不部署 `ocr-proxy`。

## 第一段：基建 —— 做完即可给别人测后台 CRUD

### 1. 解决 nvm PATH

做什么：让部署脚本和 SSH 非登录 shell 能稳定调用 nvm 下的 `node/npm/pm2`。

推荐做法：不要依赖交互式 shell 的 PATH；在 staging 部署脚本中显式加载 nvm，并在远端命令里使用 `bash -lc`。例如：

```bash
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && node -v && npm -v && pm2 -v"'
```

如果脚本中需要多次远端执行，建议抽成变量：

```bash
REMOTE_NVM='source ~/.nvm/nvm.sh'
ssh "$SERVER_HOST" "bash -lc '${REMOTE_NVM} && cd /home/ubuntu/db-proxy && npm install --omit=dev && npm test'"
```

可选做法：直接使用绝对路径 `/home/ubuntu/.nvm/versions/node/v22.23.0/bin/node`、`npm`、`pm2`。这种方式更硬，但 Node 版本升级后要改脚本。

验证什么：

```bash
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && command -v node && node -v && command -v pm2 && pm2 -v"'
```

出问题怎么办：

- 如果 `~/.nvm/nvm.sh` 不存在，先停下来重新确认 Node 安装位置。
- 如果 `bash -lc` 能找到 node，但部署脚本仍找不到，说明脚本里还有裸 `ssh "npm ..."` 或 `sudo sh -c "npm ..."`，需要改成显式 `source ~/.nvm/nvm.sh`。
- 不建议把 proxy 改回 `/root` 或用 root 跑 PM2；会重新踩 `sudo` PATH 坑。

### 2. 准备部署脚本的 staging 适配

做什么：在真正部署前，把 staging 的 host、路径、PM2 进程名和健康检查目标从 prod 逻辑中拆出来。

需要适配的点：

- `SERVER_HOST=ubuntu@175.178.220.139`，或直接使用 SSH 别名 `SERVER_HOST=mashang-staging`。
- `SERVER_PATH=/home/ubuntu/db-proxy`，不是 `/root/db-proxy`。
- `db-proxy` 使用 `ecosystem.staging.config.js`，PM2 进程名是 `db-proxy-staging`，端口 `4002`。
- `agent-proxy` 第二阶段再处理，使用 `/home/ubuntu/agent-proxy`、`agent-proxy-staging`、端口 `4003`。
- 现有 `deploy-frontend.sh`、`deploy-db-proxy.sh`、`deploy-agent-proxy.sh` 的健康检查 URL 仍硬编码到 `119.91.129.106`；staging 方案中必须改成可配置，或部署后手动验 staging。
- 已核对：当前 `deploy-db-proxy.sh` 和 `deploy-agent-proxy.sh` 的健康检查是在本机执行 `curl`，不在 SSH 远端执行。因此如果只是把现有脚本改成 `HEALTH_URL` 变量，`HEALTH_URL` 是公网语义，不能写 `127.0.0.1`；推荐的 staging 适配是把健康检查移到远端 `ssh` 内执行，此时 `HEALTH_URL` 才是服务器本机回环语义。

推荐脚本策略：

```bash
# db-proxy staging 部署时的变量形态
SERVER_HOST="${SERVER_HOST:-mashang-staging}"
SERVER_PATH="${SERVER_PATH:-/home/ubuntu/db-proxy}"
STAGING_PATH="${STAGING_PATH:-/tmp/mashang-db-proxy}"
PM2_APP="${PM2_APP:-db-proxy-staging}"
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-ecosystem.staging.config.js}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:4002/api/db/health}" # 远端 ssh 内执行 curl 的本机回环地址
```

推荐远端启动/重载逻辑：

```bash
ssh "$SERVER_HOST" "bash -lc 'source ~/.nvm/nvm.sh && cd ${SERVER_PATH} && npm install --omit=dev && npm test'"
ssh "$SERVER_HOST" "bash -lc 'source ~/.nvm/nvm.sh && mkdir -p /home/ubuntu/logs && cd ${SERVER_PATH} && if pm2 describe ${PM2_APP} >/dev/null 2>&1; then pm2 reload ${PM2_APP} --update-env; else pm2 start ${ECOSYSTEM_FILE}; fi && pm2 save'"
ssh "$SERVER_HOST" "curl --fail --silent --show-error '${HEALTH_URL}'"
```

验证什么：

```bash
SERVER_HOST=mashang-staging SERVER_PATH=/home/ubuntu/db-proxy HEALTH_URL=http://127.0.0.1:4002/api/db/health ./deploy-db-proxy.sh
```

这条命令是未来执行形态；写脚本阶段先不要执行。这里的 `HEALTH_URL` 是“远端服务器本机回环”语义，前提是脚本已经改成在 `ssh "$SERVER_HOST"` 内执行 `curl`。若仍沿用当前本机 `curl` 写法，只能使用公网地址 `http://175.178.220.139/api/db/health`，并且必须确保 Nginx 的 `/api/` location 已用 `auth_basic off;` 放行。

出问题怎么办：

- 如果脚本仍调用 `sudo pm2` 或 `sudo sh -c "npm ..."`，说明还没完成 staging 适配，应先改脚本。
- 如果健康检查打到 `119.91.129.106`，立即停止使用该脚本，先把健康检查做成可配置，并明确是在本机公网检查还是在远端本机回环检查。
- 如果 PM2 进程名是 `db-proxy` 而不是 `db-proxy-staging`，说明用了 prod ecosystem 文件。

### 3. 在服务器放 db-proxy 的 staging `.env`

做什么：在 `/home/ubuntu/db-proxy/.env` 放 staging 的数据库代理配置。

此步含 staging `service_role` key，用户本人填，AI 不写入、不代填、不贴到对话里。

建议命令：

```bash
ssh mashang-staging 'mkdir -p /home/ubuntu/db-proxy && chmod 700 /home/ubuntu/db-proxy && nano /home/ubuntu/db-proxy/.env'
```

`.env` 模板：

```dotenv
SUPABASE_URL=https://ovtnnahdqljqqkponvhu.supabase.co
SUPABASE_SERVICE_KEY=<用户本人填写 staging service_role key>
SESSION_SECRET=<用户本人生成并填写长随机值；第二阶段 agent-proxy 必须复用同一个值>
SESSION_TTL_SECONDS=43200
PORT=4002
HOST=127.0.0.1
ALLOWED_ORIGINS=http://175.178.220.139
```

写完后设置权限：

```bash
ssh mashang-staging 'chmod 600 /home/ubuntu/db-proxy/.env && ls -la /home/ubuntu/db-proxy/.env'
```

验证什么：

```bash
ssh mashang-staging 'test -f /home/ubuntu/db-proxy/.env && echo db-proxy-env-exists'
```

只验证文件存在和权限，不打印 `.env` 内容。

出问题怎么办：

- 如果目录不存在，先创建 `/home/ubuntu/db-proxy`，不要把 `.env` 放到 `/root`。
- 如果误把 key 贴进终端历史或对话，立即到 Supabase Dashboard 轮换对应 service_role key。
- 如果 `SESSION_SECRET` 后续和 agent-proxy 不一致，法务 AI 登录态会校验失败。

### 4. 部署 db-proxy 到 staging 并验证 4002 健康

做什么：上传 `webpage/db-proxy/` 到 `/home/ubuntu/db-proxy`，保留服务器 `.env`，用 `ubuntu` 的 PM2 启动 `db-proxy-staging`。

部署命令形态：

```bash
cd webpage
SERVER_HOST=mashang-staging \
SERVER_PATH=/home/ubuntu/db-proxy \
PM2_APP=db-proxy-staging \
ECOSYSTEM_FILE=ecosystem.staging.config.js \
HEALTH_URL=http://127.0.0.1:4002/api/db/health \
./deploy-db-proxy.sh
```

注意：上面的 `HEALTH_URL` 应在 staging 适配后的脚本里由远端 `ssh` 内的 `curl` 使用。如果脚本仍保持当前仓库的本机 `curl` 写法，则不能使用 `127.0.0.1`，只能使用公网地址 `http://175.178.220.139/api/db/health`。

如果脚本还没完成 staging 适配，可用手动演练命令替代：

```bash
rsync -avz --delete --exclude=node_modules --exclude=.env --exclude='*.log' webpage/db-proxy/ mashang-staging:/tmp/mashang-db-proxy/
ssh mashang-staging 'rsync -a --delete --exclude=.env --exclude=node_modules /tmp/mashang-db-proxy/ /home/ubuntu/db-proxy/'
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && cd /home/ubuntu/db-proxy && npm install --omit=dev && npm test"'
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && mkdir -p /home/ubuntu/logs && cd /home/ubuntu/db-proxy && pm2 start ecosystem.staging.config.js && pm2 save"'
```

验证什么：

```bash
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && pm2 status db-proxy-staging"'
ssh mashang-staging 'ss -tlnp | grep :4002 || true'
ssh mashang-staging 'curl --fail --silent --show-error http://127.0.0.1:4002/api/db/health'
```

出问题怎么办：

- 如果 `npm install` 找不到 npm，说明 PATH 适配没生效，回到第 1 步。
- 如果 `pm2 start` 失败并提示已有进程，改用 `pm2 reload db-proxy-staging --update-env`。
- 如果本机 `curl http://127.0.0.1:4002/api/db/health` 不通，先查 `pm2 logs db-proxy-staging --lines 80 --nostream`，不要改 prod。

### 5. 配 Nginx staging site 并部署前端

做什么：创建 `mashangguoji-staging` Nginx site，root 指向 staging 前端目录，再用 `SITE_NAME=mashangguoji-staging` 发布前端。

建议 Nginx root：

```text
/var/www/mashangguoji-staging
```

建议 site 文件：

```bash
ssh mashang-staging 'sudo nano /etc/nginx/sites-available/mashangguoji-staging'
```

基础 site 内容：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name _;

    root /var/www/mashangguoji-staging;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用并检查：

```bash
ssh mashang-staging 'sudo ln -sfn /etc/nginx/sites-available/mashangguoji-staging /etc/nginx/sites-enabled/mashangguoji-staging'
ssh mashang-staging 'sudo rm -f /etc/nginx/sites-enabled/default'
ssh mashang-staging 'sudo nginx -t'
```

必须移除默认站点的 `sites-enabled` 软链，否则 `default_server` 会抢占 80 端口，`mashangguoji-staging` site 不生效。这里只删除软链，保留 `/etc/nginx/sites-available/default` 作为备份。

部署前端命令形态：

```bash
cd webpage
SERVER_HOST=mashang-staging SITE_NAME=mashangguoji-staging HEALTH_URL=http://175.178.220.139/ ./deploy-frontend.sh
```

验证什么：

```bash
curl --fail --silent --show-error --head http://175.178.220.139/
ssh mashang-staging 'test -d /var/www/mashangguoji-staging && ls -la /var/www/mashangguoji-staging | head'
```

出问题怎么办：

- 如果 `deploy-frontend.sh` 找不到 `SITE_NAME` 对应 root，先确认 `/etc/nginx/sites-enabled/mashangguoji-staging` 是否存在且有 `root` 指令。
- 如果脚本最后仍请求 `119.91.129.106`，先把健康检查做成 `HEALTH_URL`，或跳过脚本内健康检查后手动验 staging。
- 如果已按步骤删除 `default` 软链但 Nginx 仍展示默认页，检查是否有其它站点占用 `default_server`。

### 6. 配 Nginx Basic Auth，并反代 `/api/db/` 到 4002

做什么：给公网 staging 入口加 Basic Auth，保护后台页面；同时把 `/api/db/` 反代到本机 `4002`。`auth_basic` 写在 `server` 块用于保护后台页面；`/api/` 系列 location 用 `auth_basic off;` 放行，API 由应用登录态（SESSION）保护，因为浏览器 `fetch` 不会自动携带 Basic Auth 凭据。

安装/创建密码文件：

```bash
ssh mashang-staging 'sudo apt-get update && sudo apt-get install -y apache2-utils'
ssh mashang-staging 'sudo htpasswd -c /etc/nginx/.htpasswd-mashang-staging <用户名>'
```

上面 `htpasswd` 会提示输入 Basic Auth 密码；密码由用户本人输入，不写入文件以外的位置，不贴到对话里。

在 `mashangguoji-staging` site 的 `server` 内加入：

```nginx
auth_basic "Mashang Staging";
auth_basic_user_file /etc/nginx/.htpasswd-mashang-staging;

location /api/db/ {
    auth_basic off;
    proxy_pass http://127.0.0.1:4002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50M;
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

验证并 reload：

```bash
ssh mashang-staging 'sudo nginx -t && sudo systemctl reload nginx'
```

验证什么：

```bash
curl --silent --show-error --head http://175.178.220.139/ | head
curl --silent --show-error --head http://175.178.220.139/api/db/health | head
```

预期未带账号密码访问页面时返回 `401 Unauthorized`；`/api/db/health` 不应被 Basic Auth 拦住，应由 `auth_basic off;` 放行。带 Basic Auth 后仍可验证页面和 API：

```bash
curl --user '<用户名>:<密码>' --fail --silent --show-error http://175.178.220.139/api/db/health
```

用户名和密码由用户本人输入，不写入仓库。

出问题怎么办：

- 如果未授权访问不是 `401`，说明 Basic Auth 没套上对应 `server`。
- 如果页面能打开但 `/api/db/health` 失败，先在服务器本机验 `curl http://127.0.0.1:4002/api/db/health`，区分 proxy 进程问题还是 Nginx 反代问题。
- 如果 `nginx -t` 失败，不 reload，按报错行号修 site 文件。

### 7. 验证后台 CRUD 走 staging 库

做什么：确认公网访问受 Basic Auth 保护，登录后台后所有数据写入 staging 库。

验证点：

```bash
curl --silent --show-error --head http://175.178.220.139/
curl --user '<用户名>:<密码>' --fail --silent --show-error --head http://175.178.220.139/
curl --user '<用户名>:<密码>' --fail --silent --show-error http://175.178.220.139/api/db/health
```

人工验证：

1. 浏览器打开 `http://175.178.220.139/`，必须先弹 Basic Auth。
2. 输入 Basic Auth 后进入后台。
3. 用 staging 测试账号登录。
4. 做一条低风险 CRUD 测试数据。
5. 从 staging 库 `ovtnnahdqljqqkponvhu` 核对数据存在；确认 prod 库无变化。

出问题怎么办：

- 如果页面登录后出现 CORS 或 401，检查 `ALLOWED_ORIGINS=http://175.178.220.139` 和 `SESSION_SECRET`。
- 如果写入数据出现在 prod，立即停用 staging 入口并检查 `/home/ubuntu/db-proxy/.env` 的 `SUPABASE_URL`。
- 如果外网打不开但服务器本机 curl 正常，检查腾讯云安全组和 Nginx 监听。

## 第二段：补全 —— 法务 AI + 演练

### 8. 部署 agent-proxy 到 staging

做什么：部署 `/home/ubuntu/agent-proxy`，PM2 进程名 `agent-proxy-staging`，端口 `4003`。

此步 `.env` 含 staging `service_role` key 和 LLM key，用户本人填，AI 不写入、不代填、不贴到对话里。`SESSION_SECRET` 必须和 db-proxy 完全一致。

已核对 `webpage/agent-proxy/server.js`、`webpage/agent-proxy/llm.js` 和 `webpage/agent-proxy/.env.example`：当前 agent-proxy 使用 OpenAI 兼容接口，代码实际读取的必填变量名是 `LLM_API_KEY`、`LLM_ENDPOINT`、`AGENT_MODEL`，没有读取 `VITE_NVIDIA_API_KEY` 等 NVIDIA 专用变量。staging 指定改用官方 DeepSeek API 的 DeepSeek V4 Pro；按 DeepSeek 当前官方 API Reference，Chat Completions 完整 endpoint 是 `https://api.deepseek.com/chat/completions`，模型 id 是 `deepseek-v4-pro`。

建议 `.env`：

```dotenv
SUPABASE_URL=https://ovtnnahdqljqqkponvhu.supabase.co
SUPABASE_SERVICE_KEY=<用户本人填写 staging service_role key>
SESSION_SECRET=<必须与 /home/ubuntu/db-proxy/.env 完全一致>
LLM_API_KEY=<用户本人填写 DeepSeek API key>
AGENT_MODEL=deepseek-v4-pro
LLM_ENDPOINT=https://api.deepseek.com/chat/completions
LLM_MAX_TOKENS=4096
LLM_TIMEOUT_MS=120000
PORT=4003
HOST=127.0.0.1
ALLOWED_ORIGINS=http://175.178.220.139
```

附注：开启 thinking 模式

当前 staging 默认关闭 DeepSeek thinking，走快速模式，优先保证法务问答响应快、成本可控、多轮 tool call 不踩 `reasoning_content` 兼容坑。如果以后法务功能需要深度推理，再配套做这些改动：(a) 请求体改为 `thinking` enabled 并设置 `reasoning_effort`；(b) `sanitizeMessage` 保留 `reasoning_content`，否则多轮 tool call 可能异常；(c) 评估调高 `LLM_MAX_TOKENS`，thinking 输出体量约为非 thinking 的数倍；(d) 相应调大 `LLM_TIMEOUT_MS` 和 Nginx 超时。

部署命令形态：

```bash
cd webpage
SERVER_HOST=mashang-staging \
SERVER_PATH=/home/ubuntu/agent-proxy \
PM2_APP=agent-proxy-staging \
ECOSYSTEM_FILE=ecosystem.staging.config.js \
HEALTH_URL=http://127.0.0.1:4003/api/agent/health \
./deploy-agent-proxy.sh
```

这里的 `HEALTH_URL` 同样是“远端服务器本机回环”语义，必须由 staging 适配后的脚本在 `ssh "$SERVER_HOST"` 内执行 `curl`。若仍沿用当前仓库的本机 `curl` 写法，只能使用公网地址 `http://175.178.220.139/api/agent/health`。

如果脚本还没完成 staging 适配，可用手动演练命令替代：

```bash
rsync -avz --delete --exclude=node_modules --exclude=.env --exclude='*.log' webpage/agent-proxy/ mashang-staging:/tmp/mashang-agent-proxy/
ssh mashang-staging 'mkdir -p /home/ubuntu/agent-proxy && rsync -a --delete --exclude=.env --exclude=node_modules /tmp/mashang-agent-proxy/ /home/ubuntu/agent-proxy/'
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && cd /home/ubuntu/agent-proxy && npm install --omit=dev && npm test"'
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && mkdir -p /home/ubuntu/logs && cd /home/ubuntu/agent-proxy && pm2 start ecosystem.staging.config.js && pm2 save"'
```

验证什么：

```bash
ssh mashang-staging 'bash -lc "source ~/.nvm/nvm.sh && pm2 status agent-proxy-staging"'
ssh mashang-staging 'ss -tlnp | grep :4003 || true'
ssh mashang-staging 'curl --fail --silent --show-error http://127.0.0.1:4003/api/agent/health'
```

出问题怎么办：

- 如果登录态不通，优先核对 `SESSION_SECRET` 是否和 db-proxy 一致。
- 如果 LLM 请求失败，查 `pm2 logs agent-proxy-staging --lines 80 --nostream`，不要把 LLM key 打印到对话里。
- 如果 `pm2 start` 提示进程已存在，改用 `pm2 reload agent-proxy-staging --update-env`。

验证 thinking 模式已关闭（重要）：

DeepSeek V4 默认开启 thinking，响应会在 `message` 里带 `reasoning_content` 字段。agent-proxy 已配置关闭 thinking，部署后需实测确认参数生效。

在服务器本机直接向 DeepSeek 发一个最小请求，绕过应用逻辑，只验证参数。使用 staging 的 LLM 配置；API key 由用户本人在服务器上填入，不写进文档、不贴回对话：

```bash
ssh mashang-staging
# 在服务器上执行；用 agent-proxy .env 里的真实值替换占位符。
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <用户本人填 DeepSeek key>" \
  -d '{
    "model": "deepseek-v4-pro",
    "messages": [{"role":"user","content":"ping"}],
    "thinking": {"type":"disabled"},
    "stream": false
  }'
```

判断：

- 通过：返回的 `choices[0].message` 里没有 `reasoning_content` 字段，说明 thinking 已关闭。
- 未通过：`message` 里仍有 `reasoning_content` 字段，说明参数没生效；停下来排查 `llm.js` 里 `thinking` 字段是否在请求 body 顶层、字段名/结构是否为 `thinking: { type: "disabled" }`。

对照（可选）：把上面 `"thinking"` 那行删掉再发一次；如果这次 `message` 里出现 `reasoning_content`，说明默认确实开启 thinking，反向印证关闭参数是必要的。

出问题怎么办：

- 如果返回 400 且报 `tool_choice` 相关错误，说明 thinking 没关掉；确认 `thinking: { type: "disabled" }` 已发送。
- 如果 key 无效返回 401，检查 `.env` 里 `LLM_API_KEY` 是否填对，不要把 key 贴回对话。

### 9. Nginx 反代 `/api/agent/` 到 4003

做什么：在 staging site 加 `/api/agent/` 反代，并关闭 `proxy_buffering`，保证 SSE 流式输出。

Nginx 片段：

```nginx
location /api/agent/ {
    auth_basic off;
    proxy_pass http://127.0.0.1:4003;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
    proxy_connect_timeout 10s;
}
```

验证并 reload：

```bash
ssh mashang-staging 'sudo nginx -t && sudo systemctl reload nginx'
curl --user '<用户名>:<密码>' --fail --silent --show-error http://175.178.220.139/api/agent/health
```

出问题怎么办：

- 如果法务 AI 有响应但不流式输出，先确认 `proxy_buffering off;` 是否在 `/api/agent/` block 内。
- 如果健康检查 502，先在服务器本机验 `curl http://127.0.0.1:4003/api/agent/health`。
- 如果 Basic Auth 后 API 仍 401，区分 Nginx Basic Auth 和应用登录态，不要直接放开公网保护。

### 10. 确认 staging 库有法务测试数据

做什么：确认 staging 库有法务 AI 所需的测试任务、合同/规则/案例等数据；没有则单独准备 staging-only 测试数据。

验证什么：

方案 A（推荐）：通过 Supabase MCP 的 `execute_sql` 选择 staging 项目 `ovtnnahdqljqqkponvhu` 执行只读 `SELECT`。只查 staging，不查 prod；SQL 只允许 `SELECT`，不执行 DDL/DML。

方案 B：用 `psql` 连接 staging 数据库执行只读 `SELECT`。连接串由用户本人提供，不写入文档、不提交、不贴到对话里。

```bash
psql '<用户本人提供 staging 连接串>' -c '<只读 SELECT 查询>'
```

出问题怎么办：

- 如果缺测试数据，先写 staging-only seed 或手工测试数据方案，确认后再执行。
- 如果涉及结构缺失，必须回到 migration SOP：写 migration -> apply staging -> 验证 -> 再考虑 prod。
- 不要把 prod 数据复制到 staging；staging 使用测试数据。

### 11. 按 prod runbook 做完整上线演练

做什么：把 `docs/prod-release-runbook.md` 的流程在 staging 环境完整演练一遍，验证手册是否准确。

演练原则：

- 只替换目标：`SERVER_HOST=mashang-staging`、路径 `/home/ubuntu/...`、端口 `4002/4003`、site `mashangguoji-staging`。
- 不访问、不部署、不 reload prod `119.91.129.106`。
- 每一步记录实际命令、输出、偏差和需要回填 runbook 的地方。

建议演练记录项：

```text
时间：
代码版本：
前端 root：
db-proxy 进程：
agent-proxy 进程：
Nginx site：
健康检查：
回滚步骤是否可执行：
runbook 发现的问题：
```

出问题怎么办：

- 如果 staging 演练发现 runbook 与现实不符，先更新 runbook，再继续演练。
- 如果回滚步骤缺失，先补 staging 回滚方案，不要把不完整流程带到 prod。
- 如果任何步骤会误触 prod IP 或 prod 库 ref，立即停止并修正脚本/文档。

## 暂未部署：ocr-proxy

`ocr-proxy` 本阶段暂不部署。以后需要图片 OCR 时，再补：

- `/home/ubuntu/ocr-proxy` staging 部署目录。
- staging `.env`，包含腾讯云 OCR 密钥，用户本人填。
- PM2 进程名建议 `ocr-proxy-staging`。
- Nginx `/api/ocr/` 反代和 `client_max_body_size`。
- 对应健康检查和回滚步骤。
