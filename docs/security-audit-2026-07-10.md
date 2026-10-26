# 马上国际内部系统安全审计（网站 + 小程序）

审计日期：2026-07-10

审计对象：当前工作区中的 `webpage/`、`miniapp/`、`supabase/`、`db-proxy`、`agent-proxy`、`ocr-proxy`、`jt808-server` 及部署文档。

## 结论

本系统按“单公司内部使用”评估，不把多租户隔离列为当前缺陷，也不建议为了内部使用额外引入 `tenant_id`。后台登录和代理白名单已经有基础防护，但仍存在两个应立即处理的高危授权问题：匿名角色可能读取/篡改司机和车辆证件；任意已登录司机可以要求服务端为任意收据路径签发下载链接。只要 Supabase、OCR 或 JT808 入口仍可从公网访问，这些风险不会因为业务只供内部员工使用而自动消失。

本次是源码、配置、锁文件和本地构建的只读审计，没有向 staging/prod 写数据，也没有对线上接口做破坏性验证。数据库 migration 是否已在两个远端环境生效，仍应以 `docs/migrations-ledger.md` 和远端只读查询共同确认。

## 最高优先级

### P0-1 匿名角色对证件存储拥有过宽权限

- 证据：`supabase/migrations/20260621171750_baseline.sql:2678-2685` 为 `anon` 配置了 `driver-documents`、`vehicle-documents` 的读取、写入、更新和删除策略，限制只有桶名和路径前缀，没有绑定用户、司机或车辆。
- 影响：若这些策略已部署且桶权限未被其他层收回，持公开 anon key 的请求可枚举、读取、覆盖或删除证件对象，可能涉及身份证、驾驶证、行驶证等敏感资料。
- 建议：先在 staging migration 中撤销 anon 策略；后台统一经已登录的 `db-proxy`；小程序仅通过服务端签名 URL，并校验对象归属。

### P0-2 收据签名接口存在对象级越权（IDOR）

- 证据：`supabase/functions/driver-api/index.ts:430-456` 接收客户端任意 `paths` 并使用 service role 签名；路由 `:515` 调用时没有传入 `driverId`，也没有查询该路径是否属于当前司机的报账记录。
- 影响：任何拿到有效司机令牌的用户，只要猜到或获得其他收据对象路径，就能生成一小时下载链接。
- 建议：签名前根据 `driver_id` 查询本人 `expense_records.receipt_images`；对象路径使用 `drivers/{driverId}/...` 前缀；拒绝旧完整 URL 和越界路径。

## P1 高风险

### P1-1 匿名用户可向车辆定位表写入数据

- 证据：`supabase/migrations/20260621171750_baseline.sql:1855` 使用 `WITH CHECK (true)`，`:2760-2761` 又向 `anon` 授予插入表和使用序列的权限。
- 影响：公开 anon key 可被用于伪造 GPS 记录、污染轨迹和在线状态。
- 建议：撤销 anon 插入；只允许受控的 JT808 服务账户写入，并在数据库层校验车辆、终端和坐标范围。

### P1-2 JT808 服务没有终端认证和连接资源限制

- 证据：`webpage/jt808-server/index.js:209-245` 仅凭报文中的 `terminal_phone` 找车并写位置；`:349-395` 监听 `0.0.0.0`，未实现 0x0102 鉴权、IP/设备白名单、连接数上限、空闲超时或缓存上限。
- 影响：当 8808 端口对公网开放时，攻击者可伪造已知终端号的位置，或通过慢连接/大缓存耗尽进程内存。
- 建议：先核实防火墙暴露面；实现终端注册/鉴权、连接/帧/缓存限制，优先放到 VPN、专线或可信源 IP 后面。

### P1-3 OCR 计费接口缺少登录校验和限流

- 证据：`webpage/ocr-proxy/server.js:38-66` 直接暴露 `/api/ocr/recognize`，只有 CORS 和上传大小限制，没有后台会话校验；部署文档将其直接反代到公网路径。
- 影响：未登录用户可直接调用腾讯云 OCR，消耗额度和费用；20MB 内存上传和多页 PDF 还可能造成资源耗尽。
- 建议：复用后台会话校验；增加每用户/IP 限流、并发上限、日配额、请求超时和审计日志。

### P1-4 司机登录和令牌缺少防爆破与撤销机制

- 证据：`supabase/functions/driver-api/index.ts:13-15` 的令牌有效期为 7 天；`:69-83` 只校验签名和过期时间；`:160-179` 的公开登录接口没有失败次数限制；后续接口没有再次检查司机是否仍为 active。
- 影响：账号可被持续爆破；已泄露令牌即使司机被停用或改密，仍可能继续使用至过期。
- 建议：登录按账号/IP 限流并增加退避；令牌缩短有效期并加入 `session_version`/撤销表；每次关键请求校验司机 active；强制独立 `DRIVER_SESSION_SECRET`。

### P1-5 依赖审计存在可达的高危包

- 网页 `npm audit --omit=dev`：10 个告警（6 high、4 moderate）。当前安装包括 `axios@1.15.0`、`react-router@7.14.0`、`xlsx@0.18.5`。
- `xlsx@0.18.5` 不只是导出使用：`webpage/src/lib/fileParsers.ts:95-100` 会解析用户上传的 Excel，属于不可信输入路径。
- OCR 代理：5 个告警（1 high、4 moderate），涉及 `form-data`、`express/qs`、腾讯云 SDK 依赖。
- 小程序 `pnpm audit --prod`：依赖图报告 1 critical、6 high、10 moderate、5 low；`swiper@11.1.15` 由 `@tarojs/components@4.1.10` 引入，另有 `lodash-es`、`fast-uri`、旧 Vite/Webpack 告警。构建链告警是否进入最终小程序包需要逐项确认。
- 建议：直接依赖优先升级；Excel 解析改为受维护版本/替代库并加文件复杂度限制；Taro 依赖作为一组升级后跑完整 lint/build/真机回归。

## P2 中风险和加固项

### P2-1 派遣 migration 向任意 authenticated 用户开放全量读取

- 证据：`supabase/migrations/20260623165844_dispatch_management.sql:166-185` 对 `customers` 和 `dispatch_records` 的 SELECT 使用 `USING (true)`，`:225-230` 向 `authenticated` 授权。
- 风险：如果项目仍存在可注册或可获得 Supabase Auth 身份的用户，他们可绕过后台 cookie 代理直接读取全部派遣数据。
- 建议：若只走 `db-proxy`，撤销 authenticated 授权；若确需 Supabase Auth，策略必须绑定 staff/tenant，并关闭公开注册。

### P2-2 写入、签名和模型接口缺少统一配额

- `driver-api` 的批量 `records`、收据签名 paths 和签名上传没有数量/频率/日配额限制。
- `agent-proxy` 对单次消息做了长度限制，但没有每用户并发、分钟请求数或模型费用预算。
- 建议：网关层统一实现 body/数组长度、并发、速率、日配额和费用告警。

### P2-3 当前小程序 dist 是旧构建且带源码映射

- 证据：忽略目录 `miniapp/dist/weapp/*.map` 包含完整 `sourcesContent`，其中仍是旧版硬编码 prod Supabase 配置，而当前源码已经改为环境变量。
- 风险：发布包和源码可能不一致；若 source map 随包或 H5 静态资源发布，会泄露完整前端源码和环境标识。
- 建议：发布前清空 dist 后重新构建；生产构建关闭 source map；CI 校验产物来自当前 commit。

### P2-4 HTTPS 和安全响应头需在真实 Nginx 上确认

- 证据：开发 OCR 代理和生产手册仍大量使用 `http://119.91.129.106`；仓库未发现 CSP、HSTS、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy` 的统一配置。
- 风险：合同/OCR 文件可能在明文 HTTP 上传；缺少 CSP 会放大第三方脚本或 XSS 的影响。`webpage/index.html:7` 还直接加载腾讯地图脚本和公开客户端 key。
- 建议：只允许 HTTPS，HTTP 301 跳转；部署 CSP/安全头；腾讯地图 key 配置域名白名单和额度告警。

## 已有的正向控制

- 后台 session cookie 使用 `HttpOnly`、`SameSite=Strict`，HTTPS 下可带 `Secure`。
- `db-proxy` 有表/RPC/存储桶白名单，敏感账号表读取禁止 `password` 字段并清洗响应。
- 后台登录有基于 IP+账号的失败次数限制。
- 小程序报账创建由服务端强制 `driver_id`、`status=pending`、`commission=0`；更新/删除检查本人和 pending 状态。
- `db-proxy` 15 项测试、`agent-proxy` 20 项测试均通过；网页生产构建通过。
- 本次跟踪文件扫描未发现 service role、LLM key、腾讯云 SecretKey 等真实高权限密钥被提交。Supabase anon key 和地图客户端 key 属公开级凭据，但必须配合权限最小化和平台白名单。

## 建议修复顺序

1. 在 staging migration 撤销匿名证件、收据和定位权限，并验证后台/小程序仍可用。
2. 修复 `/storage/sign` 对象归属校验，加入司机路径命名空间。
3. 为 OCR、司机登录、driver-api、Agent 增加鉴权、限流和配额。
4. 加固 JT808 终端认证、网络暴露和资源上限。
5. 升级依赖并替换/隔离 `xlsx` 不可信文件解析路径。
6. 按内部岗位梳理 `admin` / `staff` 最小权限，确认普通员工能否改司机账号、费用、证件和法务数据。
7. 完成 HTTPS、安全响应头、生产 source map、第三方 key 限制和发布产物校验。

## 验证边界

- 没有连接或修改 staging/prod 数据库。
- 没有上传测试文件、伪造 GPS、尝试登录爆破或调用付费 OCR/LLM。
- 本报告按单公司内部系统口径评估，多租户隔离不在当前建设范围。
- `docs/migrations-ledger.md` 当前未记录未跟踪的 `20260630111231_payroll_management.sql`，因此无法从台账确认该结构在 staging/prod 的真实状态。
- 当前工作区原本已有多项未提交改动；本报告没有覆盖或重写这些改动。
