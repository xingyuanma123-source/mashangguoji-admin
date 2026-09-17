# Supabase 到腾讯云迁移盘点报告

生成日期: 2026-07-09

## 1. 结论

本项目不能只做数据库连接串替换。当前系统实际使用了 Supabase 的四层能力:

- PostgreSQL 数据库
- PostgREST Data API (`/rest/v1`)
- Storage (`/storage/v1`)
- Edge Function (`/functions/v1/driver-api`)

如果目标是全部迁入腾讯云生态, 推荐目标架构为:

| 层 | staging 目标 | prod 目标 | 说明 |
|---|---|---|---|
| 数据库 | TencentDB for PostgreSQL staging | TencentDB for PostgreSQL prod | 两套独立实例或至少独立 database/user; 不共库 |
| 文件 | COS staging bucket | COS prod bucket | 迁移 Supabase Storage 全部对象 |
| 后台数据服务 | staging `db-proxy` 直连 TencentDB | prod `db-proxy` 直连 TencentDB | 替代 Supabase REST 代理 |
| 法务 Agent | staging `agent-proxy` 直连 TencentDB | prod `agent-proxy` 直连 TencentDB | 替代 `webpage/agent-proxy/supabase.js` |
| 小程序司机 API | staging `driver-api` Node/Express 服务 | prod `driver-api` Node/Express 服务 | 替代 Supabase Edge Function |
| GPS 服务 | staging/prod JT808 服务直连 TencentDB | staging/prod JT808 服务直连 TencentDB | 替代 `@supabase/supabase-js` 写入 |

由于当前还没正式上线、停机不敏感, 迁移策略应采用 **全量导出 -> 全量导入 -> 校验 -> 切换**。不需要先做 DTS 增量迁移。

## 2. 盘点边界

本次已做:

- 只读读取仓库文件、migration、runbook、配置模板。
- 使用本地已有 Supabase URL/key 做只读 REST/Storage 计数; 未打印任何 key 或连接串。
- 没有执行 DDL/DML, 没有改 Supabase 数据库, 没有 SSH 服务器。

本次未做:

- 未导出完整 SQL dump。
- 未下载 Supabase Storage 对象。
- 未创建腾讯云资源。
- 未改代码。

## 3. 当前环境矩阵

| 环境 | Supabase ref | 本地配置来源 | 现状 |
|---|---|---|---|
| staging | `ovtnnahdqljqqkponvhu` | `webpage/db-proxy/.env`, `miniapp/.env.staging` | 测试数据少; 已有派遣/薪资结构 |
| prod | `rwjbladqwubgjotlygyy` | `webpage/agent-proxy/.env`, `webpage/.env`, `miniapp/.env.production` | 有真实业务数据和 Storage 文件; 缺派遣/薪资新结构 |

仓库纪律仍适用: 数据库结构变更必须先 staging 后 prod, 见 `AGENTS.md` 和 `docs/migrations-ledger.md`。

## 4. Schema 与 migration 现状

仓库当前有 3 个 migration 文件:

| version | 文件 | 台账状态 | 本次观察 |
|---|---|---|---|
| `20260621171750` | `baseline.sql` | staging ✅ / prod ✅ | 基线结构, 台账称 29 表 / 3 视图 |
| `20260623165844` | `dispatch_management.sql` | staging ✅ / prod ❌ | prod REST 计数返回相关表不存在 |
| `20260630111231` | `payroll_management.sql` | 未入台账 | 文件存在且 staging 可计数; prod 返回相关表不存在 |

由 migration 静态解析得到:

- public 表: 37 个
- public 视图: 4 个
- public 函数: 6 个
- extension: `pg_cron`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `supabase_vault`, `uuid-ossp`

迁移到 TencentDB 前必须逐项确认 extension 支持情况。尤其:

- `supabase_vault` 是 Supabase 专属能力, 迁入 TencentDB 时大概率要移除或改造。
- `pg_cron` 是否启用取决于 TencentDB 实例能力和权限; 当前代码没有看到强依赖 cron 执行业务任务, 可先降级为应用层定时任务。
- `auth.jwt()` 相关函数在 `dispatch_management.sql` 中出现; 迁出 Supabase 后不应继续依赖 Supabase JWT, 应改成服务端鉴权上下文或废弃 RLS 路径。

## 5. 当前数据规模

统计方式: 对每个环境的 Supabase REST 表执行 `select=*&limit=0` + `Prefer: count=exact`; 仅取行数。

### 5.1 staging 行数

staging 目前是轻量测试数据。非零表:

| 表 | 行数 |
|---|---:|
| `customers` | 1 |
| `deadline_rules` | 5 |
| `dispatch_operation_logs` | 1 |
| `dispatch_records` | 1 |
| `drivers` | 13 |
| `fee_types` | 13 |
| `operating_companies` | 21 |
| `operation_logs` | 1 |
| `playbook_rules` | 8 |
| `service_staff` | 2 |
| `vehicles` | 1 |

Storage bucket 均存在, 但对象数均为 0。

### 5.2 prod 行数

prod 有真实业务数据。非零表:

| 表 | 行数 |
|---|---:|
| `advance_fund_records` | 38 |
| `agent_runs` | 6 |
| `deadline_rules` | 5 |
| `driver_documents` | 55 |
| `drivers` | 14 |
| `expense_other_fees` | 3 |
| `expense_records` | 1942 |
| `fee_types` | 13 |
| `legal_reviews` | 9 |
| `legal_tasks` | 1 |
| `matters` | 1 |
| `operating_companies` | 21 |
| `operation_logs` | 104 |
| `playbook_rules` | 8 |
| `service_staff` | 6 |
| `vehicle_documents` | 162 |
| `vehicles` | 63 |
| `vehicles_trailer` | 26 |

prod 中本次按仓库 migration 清单查询但不存在的表/视图:

| 对象 | 来源 | 影响 |
|---|---|---|
| `customers` | dispatch migration | 派遣模块 prod 不可用 |
| `dispatch_records` | dispatch migration | 派遣模块 prod 不可用 |
| `dispatch_operation_logs` | dispatch migration | 派遣模块 prod 不可用 |
| `salary_records` | payroll migration | 薪资模块 prod 不可用 |
| `driver_commission_inputs` | payroll migration | 薪资模块 prod 不可用 |
| `commission_pool_settlements` | payroll migration | 薪资模块 prod 不可用 |
| `commission_pool_participants` | payroll migration | 薪资模块 prod 不可用 |
| `salary_adjustments` | payroll migration | 薪资模块 prod 不可用 |
| `driver_advance_balance` | payroll view | 薪资/备用金视图 prod 不可用 |

迁移决策点: prod 是 **原样迁移当前 prod** 还是 **先把 dispatch/payroll 结构补到 prod 再迁**。如果目标是迁移后立刻继续开发新模块, 建议先在 Supabase staging 验证 -> apply prod -> 更新台账 -> 再做 prod 全量迁移。

## 6. Storage 规模

统计方式: 使用 Supabase Storage API 只读列 bucket 和对象列表, 汇总对象数与 `metadata.size`。

### 6.1 staging

| bucket | public | 对象数 | 字节 |
|---|---:|---:|---:|
| `vehicle-documents` | false | 0 | 0 |
| `driver-documents` | false | 0 | 0 |
| `app-a2kae62wkbnl_receipt_images` | false | 0 | 0 |
| `receipt-images` | false | 0 | 0 |
| `contracts` | false | 0 | 0 |
| `legal-library` | false | 0 | 0 |

### 6.2 prod

| bucket | public | 对象数 | 字节 |
|---|---:|---:|---:|
| `vehicle-documents` | false | 163 | 27,621,776 |
| `driver-documents` | false | 55 | 5,766,834 |
| `app-a2kae62wkbnl_receipt_images` | false | 50 | 7,597,670 |
| `receipt-images` | false | 18 | 2,072,224 |
| `contracts` | false | 0 | 0 |
| `legal-library` | false | 0 | 0 |
| **合计** |  | **286** | **43,058,504** |

迁移策略:

- COS 保持 staging/prod 分桶。
- 数据库继续保存相对对象路径, 不写完整 COS URL。
- 下载/预览统一由服务端生成 COS 临时签名 URL。
- 旧收据桶 `app-a2kae62wkbnl_receipt_images` 需要兼容迁移; 不要只迁 `receipt-images`。

## 7. 代码依赖面

### 7.1 后台 `db-proxy`

当前 `webpage/db-proxy/server.js` 读取 `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`, 构造 `${SUPABASE_URL}/rest/v1`, 并代理 `/api/db/supabase` 到 Supabase REST/Storage。

替换目标:

- 新增 `DATABASE_URL` 直连 TencentDB。
- 将 `authorize.js` 的表/RPC/Storage 白名单保留为自有 API 授权层。
- 将 REST 风格通用代理逐步收敛为服务端 API 或受控 query adapter。
- 将 Storage 路径授权从 Supabase Storage 改成 COS 签名接口。

注意: `authorize.js` 允许 `expense_fee_details`, 但该表不在当前 migration 表清单内。迁移前需确认这是旧代码残留、视图、还是缺失 migration。

### 7.2 `agent-proxy`

当前 `webpage/agent-proxy/supabase.js` 是轻量 Supabase REST 封装, 提供 `sbSelect`, `sbInsert`, `sbUpdate`, `sbRpc`。

替换目标:

- 改成 `pg`/连接池查询。
- RPC `renew_contract`, `search_legal_documents` 可以保留为 PostgreSQL 函数, 但通过 SQL 调用, 不再走 `/rest/v1/rpc/*`。
- Agent 写入表继续走服务端, 不开放给前端直写。

### 7.3 小程序 `driver-api`

当前 `supabase/functions/driver-api/index.ts` 是 Supabase Edge Function:

- 用 service role 调 `/rest/v1`
- 自签 HMAC driver token
- 提供司机登录、车辆列表、报账 CRUD、统计、备用金、Storage 签名上传/下载

替换目标:

- 迁为 Node/Express 服务, 部署到现有服务器 PM2。
- API 路径建议 `/api/driver/*`。
- 小程序 `miniapp/src/db/edge.ts` 中 `${SUPABASE_URL}/functions/v1/driver-api` 改为自有 API base。
- 小程序 `miniapp/src/utils/upload.ts` 中直传 Supabase Storage 的逻辑改为“请求服务端签名 -> 直传 COS -> 保存对象 key”。

### 7.4 小程序 Supabase 客户端残留

`miniapp/src/client/supabase.ts` 仍创建 Supabase client 并读取 `TARO_APP_SUPABASE_URL` / `TARO_APP_SUPABASE_ANON_KEY`。此外 `miniapp/src/contexts/AuthContext.tsx` 中仍有 `supabase.auth` 和 `supabase.functions.invoke('wechat_miniapp_login')` 残留。

替换目标:

- 明确小程序只走 `driver-api` 自有登录。
- 删除或隔离 Supabase Auth 依赖。
- `.env.staging` / `.env.production` 改为 `TARO_APP_API_BASE` 等自有变量。

### 7.5 JT808 GPS 服务

`webpage/jt808-server/index.js` 使用 `@supabase/supabase-js` 查询 `vehicles` 并写入 `vehicle_locations`。

替换目标:

- 改为 `pg` 直连 TencentDB。
- 生产部署前确认环境、数据库连接和端口。

## 8. 迁移前必须处理的兼容问题

| 问题 | 位置 | 处理建议 |
|---|---|---|
| Supabase REST 通用代理将消失 | `webpage/db-proxy/server.js` | 建自有 API/query adapter |
| Supabase Storage 将消失 | 后台法务/车辆、小程序上传 | 改 COS SDK/签名 URL |
| Supabase Edge Function 将消失 | `supabase/functions/driver-api` | 迁成 Node/Express PM2 服务 |
| Supabase Auth 残留 | `miniapp/src/contexts/AuthContext.tsx` | 删除或改自有登录 |
| `auth.jwt()` 依赖 | `dispatch_management.sql` | 改服务端鉴权, 不依赖 Supabase JWT |
| `supabase_vault` extension | `baseline.sql` | 移除或替换为腾讯云密钥管理/CAM/.env |
| prod 缺 dispatch/payroll 表 | live count | 决定先补 prod 结构还是原样迁 |
| `expense_fee_details` / `profiles` 引用不在 migration 表清单 | 前端代码引用 | 迁移前确认是否废弃或补 migration |

## 9. 建议实施顺序

### 阶段 0: 冻结方案

1. 决定 prod 是否先补齐 dispatch/payroll 结构。
2. 决定 TencentDB 规格、地域、VPC、安全组。
3. 决定 COS bucket 命名、地域、CAM 子账号权限。
4. 确定小程序新 API 域名和 HTTPS 证书。

### 阶段 1: staging 先迁

1. 创建 TencentDB staging 和 COS staging。
2. 从 Supabase staging 全量导出 schema/data。
3. 导入 TencentDB staging。
4. 迁移 staging Storage 对象到 COS staging。
5. 改代码只连 TencentDB/COS staging。
6. 跑 staging 验收。

### 阶段 2: 应用改造

1. `db-proxy`: Supabase REST -> TencentDB query layer。
2. `agent-proxy`: Supabase REST helper -> `pg` helper。
3. `driver-api`: Supabase Edge Function -> Node/Express。
4. `miniapp`: Supabase URL/key -> 自有 API base。
5. `jt808-server`: Supabase client -> `pg`。
6. 文件上传下载: Supabase Storage -> COS 签名 URL。

### 阶段 3: prod 全量迁移

1. 冻结 prod 写入。
2. 从 Supabase prod 导出 schema/data。
3. 导入 TencentDB prod。
4. 下载 Supabase Storage prod 对象并上传 COS prod。
5. 执行行数、对象数、金额汇总、关键业务抽样校验。
6. 更新 prod `.env` 到 TencentDB/COS。
7. 部署服务。
8. 保留 Supabase prod 只读 1-2 周作为回滚源。

## 10. 验收清单

数据库:

- public 表数量与目标 migration 一致。
- 每个表行数与源环境一致。
- `expense_records` 总数与金额汇总一致。
- `advance_fund_records` 总额一致。
- `vehicles` / `vehicles_trailer` / `driver_documents` / `vehicle_documents` 行数一致。
- 视图 `vehicles_sorted`, `trailers_sorted`, `contracts_expiring`, `driver_advance_balance` 可查询。
- 函数 `renew_contract`, `search_legal_documents` 可执行。

文件:

- COS 对象数与 Supabase Storage 对象数一致。
- COS 对象总字节数一致或抽样哈希一致。
- 司机收据图片可上传、可预览。
- 车辆/司机证件可上传、可预览。
- 合同/法务文件可上传、可下载。

后台:

- 管理员登录。
- 司机/车辆 CRUD。
- 报账确认/反确认。
- 总表统计。
- 备用金余额。
- 法务合同和法务库。
- 薪资模块。
- 派遣模块。

小程序:

- staging 包连 staging API。
- production 包连 prod API。
- 司机登录。
- 提交报账。
- 编辑 pending 报账。
- 查看图片。
- confirmed 记录锁定。

服务器:

- `db-proxy` health。
- `agent-proxy` health。
- `driver-api` health。
- `ocr-proxy` health。
- `jt808-server` 写入 `vehicle_locations`。

## 11. 建议输出物

迁移实施前建议补齐以下文件:

| 文件 | 用途 |
|---|---|
| `docs/tencent-cloud-migration-runbook.md` | 可执行迁移手册 |
| `scripts/audit-supabase-inventory.mjs` | 只读导出表/桶清单 |
| `scripts/migrate-supabase-storage-to-cos.mjs` | Storage -> COS 迁移脚本 |
| `scripts/verify-tencentdb-migration.mjs` | 迁移后行数/金额/对象校验 |
| `webpage/driver-api/` | 从 Supabase Edge Function 迁出的司机 API 服务 |

## 12. 官方参考

- Supabase CLI `db dump` / migration / storage 命令: https://supabase.com/docs/reference/cli/introduction
- Supabase Storage 概念: https://supabase.com/docs/guides/storage
- TencentDB for PostgreSQL 导入数据: https://www.tencentcloud.com/document/product/409/7552
- 腾讯云 COS 预签名 URL: https://www.tencentcloud.com/document/product/436/45243
