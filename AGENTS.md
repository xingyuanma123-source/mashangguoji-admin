# AGENTS.md

本文件是本仓库给 AI 助手（Codex、Claude Code 等）的长期工作纪律。除非用户明确覆盖，处理本仓库任务时必须遵守。

## 数据库纪律

- 数据库改动一律先写成 migration 文件，不在库里手动建表/改字段。
- 表结构变更顺序：先应用到 staging 库（ovtnnahdqljqqkponvhu）验证，确认没问题后再应用到 prod 库。绝不直接改 prod 库结构。
- prod 库的结构永远来自“已在 staging 验证过的 migration”。
- 每次涉及 migration 时，先读 `docs/migrations-ledger.md` 确认各 migration 在 staging/prod 的应用状态；按其中 SOP 执行（写 → push staging → 验证 → push prod → 回填台账）。台账是 prod/staging 应用状态的唯一事实来源。
- staging 和 prod 保持表结构一致，但数据各自独立——staging 是测试数据，prod 是真实数据，互不同步。

## 环境隔离纪律

- prod（正式）和 staging（测试）是两条独立轨道，从代码到数据库都分开。
- 本地开发默认连 staging 库测试，乱填数据只进 staging，不污染 prod。
- 任何碰服务器/数据库的操作，必须分清是 prod 还是 staging，操作前确认 project ref / IP / 端口，别误碰 prod。
- prod 库 ref：rwjbladqwubgjotlygyy；staging 库 ref：ovtnnahdqljqqkponvhu。

## Staging 测试服务器

- IP：175.178.220.139（腾讯云轻量，Ubuntu 24.04）
- 用途：给别人公网测试 + 上线演练（连 staging 库）
- 登录：SSH 密钥免密，别名 `mashang-staging`（用户 ubuntu，密钥 id_ed25519_mashang_staging）
- 注意：密钥私钥不进 git；服务器密码由本人掌握，不写入任何文件

## 密钥处理纪律

- service_role key 等敏感密钥，默认由我本人填写，AI 不主动写入（除非我明确授权）。
- 含密钥的 .env 文件必须在 .gitignore 里，绝不提交进 git。

## 开发流程纪律

- 改动走 PR 流程，不直接 push main。CI（build+lint+test）是 main 的门禁，所有 PR 必须 CI 通过才能合并。
- 数据库或功能改动的验证顺序：先在本地连 staging 库测试 → 通过 → 再上 prod。prod 只接收已在 staging 验证过的版本。
- 涉及服务器、数据库、CI 的操作，先出计划/方案让用户确认，再动手；用户习惯“先看计划再执行”。碰 prod 的操作尤其要先停下来确认。
- prod 上线（前端/db-proxy/agent-proxy/ocr-proxy 部署）必须照 `docs/prod-release-runbook.md` 执行：按手册的上线顺序、健康检查、回滚步骤操作，不自行发挥。手册未覆盖或与现状不符时，先停下来和用户确认，再决定是否更新手册。

## 项目架构概述

- 本仓库是马上国际物流管理系统，主要包含两个独立子项目：`webpage/` 客服后台管理网页和 `miniapp/` 司机端微信小程序。
- `webpage/` 使用 React + Vite，桌面端优先；路由主要在 `src/routes.tsx`，认证上下文在 `src/contexts/AuthContext.tsx`，数据库访问封装在 `src/db/api.ts`，车辆模块在 `src/features/vehicles/`。
- `miniapp/` 使用 Taro + React + Zustand，目标平台包括微信小程序和 H5；页面路由在 `src/app.config.ts`，认证上下文在 `src/contexts/AuthContext.tsx`，数据访问和类型主要在 `src/db/api.ts`、`src/db/types.ts`。
- 两端使用同一套业务表结构，但必须按上面的环境隔离纪律连接 staging/prod；不要写成单一共享 prod 库，也不要硬编码数据库凭证。

## 数据库字段约定

- 登录字段使用 `username`，不要写成 `account`。
- 备用金日期字段使用 `fund_date`，不要写成 `recharge_date`。
- 字典表关联使用 FK + id，不要用文本名硬关联；例如使用 `operating_company_id`，不要只存公司名字符串。
- 状态字段使用 CHECK 约束下的枚举字符串，不要用 boolean 代替多状态。
- 报账记录 `expense_records.status` 当前只有 `pending` 和 `confirmed` 两种业务状态。
- 日期字段按语义使用 `DATE` 或 `TIMESTAMPTZ`，不要随意混用文本日期。
- 前端代码不要硬编码 `service_role` key；敏感密钥按“密钥处理纪律”处理。

## 核心业务规则

- “总表”统计口径是 `expense_records` 中 `status='confirmed'` 的记录。
- “加班天数”是 `is_overtime=true` 且 `status='confirmed'` 的记录按 `record_date` 去重后的天数，不是记录条数。
- 报账状态没有“驳回”状态；如需修改已确认记录，应由管理员反审核回 `pending`，不是新增驳回态。
- `confirmed` 的报账记录默认锁定，不应由司机端直接修改。
- `commission`（提成）由客服填写，司机端只读展示。
- 备用金余额 = 备用金充值总额（`advance_fund_records`）- 已确认支出总额（`expense_records.status='confirmed'`）。
- 司机端车牌下拉只显示 `vehicles.is_active=true` 的车。
- 查询车头当前绑定车挂时，以 `truck_trailer_assignments.is_current=true` 为当前绑定关系。

## 关键数据表

| 表名 | 说明 |
| --- | --- |
| `expense_records` | 报账记录核心表，包含各类 `fee_*` 费用字段、`status`、`commission`、`is_overtime` 等 |
| `expense_other_fees` | 额外费用明细，多对一关联 `expense_records` |
| `drivers` | 司机表，登录账号字段为 `username` |
| `vehicles` | 车头表，包含 `vehicle_type`、`data_source`、`operating_company_id`、`is_active` 等 |
| `vehicles_trailer` | 车挂表 |
| `truck_trailer_assignments` | 车头/车挂动态分配表，`is_current=true` 表示当前绑定 |
| `operating_companies` | 营运公司字典表 |
| `driver_documents` | 司机证件表，按司机和证件类型约束唯一 |
| `vehicle_documents` | 车辆证件表，按车辆类型、车辆 id 和证件类型约束唯一 |
| `service_staff` | 客服账号表，角色包括 `admin`、`staff` |
| `advance_fund_records` | 备用金充值记录表，日期字段为 `fund_date` |
| `fee_types` | 费用类型配置表 |
| `operation_logs` | 操作日志表 |
| `vehicle_locations` | GPS 位置记录表，由 JT/T 808 服务等写入 |

## 代码约定

- `webpage/` 和 `miniapp/` 都使用 `@/` 作为 `src/` 路径别名。
- 两端使用 Biome 做代码检查，不使用 ESLint；Biome 规则里禁止 CommonJS（`noCommonJs: error`）。
- `webpage/` 的 `npm run lint` 是 `tsgo -p tsconfig.check.json`，不是 ESLint；同时有 `npm run test` 和 `npm run build`。
- `miniapp/` 的 `pnpm lint` 入口是 `scripts/runLint.sh`，会依次跑 Biome、`tsgo`、导航/图标/AuthProvider 自定义检查，并在全部通过后执行 `scripts/testBuild.sh`。
- 小程序侧禁止引入 `echarts-for-taro`；该包不存在。
- 小程序侧不要使用 `file-saver`；在 weapp 构建中会出问题，需要改用 Taro 文件 API，例如 `Taro.getFileSystemManager()` 或 `Taro.downloadFile()`。
- 客服后台法律/合同相关 OCR 通过 `/api/ocr/recognize` 代理转发；开发环境代理配置在 `webpage/vite.config.dev.ts`，生产环境需要由 Nginx 等反代承接。
- `webpage/jt808-server/` 是独立的 JT/T 808 GPS TCP 服务，用于接收终端数据并写入 `vehicle_locations`，部署或改动前必须先确认目标环境和数据库连接。
