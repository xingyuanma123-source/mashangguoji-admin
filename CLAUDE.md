# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**马上国际物流管理系统**（Mashangguoji Admin）是一个物流公司内部系统，由两个独立子项目组成：

- **`webpage/webpage/`** — 客服后台管理网页（React + Vite，桌面端优先）
- **`uniapp/uniapp/`** — 司机端微信小程序（Taro + React，目标平台 weapp/H5）

两个项目共用同一个 Supabase 数据库（Project ID: `rwjbladqwubgjotlygyy`）。

---

## 命令

### 客服后台（`webpage/webpage/`）

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run lint         # TypeScript 类型检查（tsgo）
```

> **注意：** `lint` 脚本运行的是 `tsgo -p tsconfig.check.json`，即 TypeScript 原生编译器预览版，不是 ESLint。

### 微信小程序（`uniapp/uniapp/`）

```bash
pnpm install         # 安装依赖
pnpm run lint        # 运行 biome lint + tsgo + 自定义脚本检查
```

> **重要：** `dev` 和 `build` 脚本在当前环境不可用（CI/CD 环境无法运行 Taro 编译）。验证代码正确性请只运行 `lint`。

`lint` 脚本（`scripts/runLint.sh`）依次执行：
1. `biome lint --diagnostic-level=error`
2. `tsgo -p tsconfig.check.json`
3. `scripts/checkNavigation.sh`
4. `scripts/checkIconPath.sh`
5. `scripts/checkAuthProvider.sh`
6. `scripts/testBuild.sh`（仅所有检查通过后执行）

---

## 架构

### 共用 Supabase 数据库

两个项目都直连同一个 Supabase 实例，**凭证硬编码**在代码中（不使用环境变量）：
- Webpage: `src/lib/supabase.ts`
- Uniapp: `src/client/supabase.ts`（使用 `Taro.request` 替代原生 `fetch` 以支持小程序环境）

### 客服后台架构（`webpage/webpage/`）

- **路由**：`src/routes.tsx` 定义所有路由，`App.tsx` 实现 `ProtectedRoute` 守卫（未登录跳转 `/login`）
- **认证**：`src/contexts/AuthContext.tsx` — 登录态存储在 `localStorage` 的 `service_staff` key，类型为 `ServiceStaff`（非 Supabase Auth）
- **数据层**：`src/db/api.ts` — 所有数据库查询的统一封装，内置 30 秒内存缓存（`queryCache` Map）
- **车辆功能**：`src/features/vehicles/` — 车辆模块有独立的 api/components/utils，包含分页查询和多种过滤器
- **数据库类型**：`src/types/database.ts` 和 `src/types/index.ts`
- **状态管理**：TanStack Query（`staleTime: 30_000`）+ React Context，无 Redux/Zustand
- **UI 组件**：shadcn/ui（`src/components/ui/`），基于 Radix UI + Tailwind CSS

### 小程序架构（`uniapp/uniapp/`）

- **页面路由**：`src/app.config.ts` 声明所有页面路径，TabBar 三个入口：报账（submit）、记录（records）、我的（profile）
- **认证**：`src/contexts/AuthContext.tsx` — 登录态存储在小程序本地缓存（Taro.setStorageSync），类型为 `Driver`
- **数据层**：`src/db/api.ts` — Supabase 查询封装；`src/db/types.ts` — 所有 TypeScript 类型
- **状态管理**：Zustand（参见 `src/store/`）

---

## 数据库核心约定（严格遵守）

- 登录字段是 **`username`**，不是 `account`
- 备用金日期字段是 **`fund_date`**，不是 `recharge_date`
- 字典表关联用 **FK + id**，不用文本（如 `operating_company_id` 而非公司名字符串）
- 状态字段使用 CHECK 约束的枚举字符串，不用 boolean 替代多状态
- 所有日期字段统一用 `DATE` 或 `TIMESTAMPTZ`
- 不要在前端代码里硬编码 `service_role` key（anon key 可以）

### 核心业务规则

- **总表** = `expense_records` 中 `status='confirmed'` 的记录
- **加班天数** = `is_overtime=true` 且 `status='confirmed'` 的记录按 `record_date` 去重后的天数（不是记录条数）
- `status` 只有 `pending` 和 `confirmed` 两种，**没有驳回机制**
- `confirmed` 的记录**锁定不可修改**
- `commission`（提成）由客服填写，司机端只读
- **备用金余额** = 充值总额 - 已确认支出总额
- 司机端车牌下拉只显示 `vehicles.is_active=true` 的车

### 关键数据表

| 表名 | 说明 |
|------|------|
| `expense_records` | 报账记录（核心表），包含 17 个 fee_* 费用字段 |
| `expense_other_fees` | 额外费用明细（多对一关联 expense_records） |
| `drivers` | 司机表（约 13 人） |
| `vehicles` | 车头表，含 `vehicle_type`('own'\|'affiliated'\|'rented')、`data_source`('verified'\|'legacy'\|'manual') |
| `vehicles_trailer` | 车挂表 |
| `truck_trailer_assignments` | 车头/车挂动态分配，`is_current=true` 表示当前绑定 |
| `operating_companies` | 营运公司字典 |
| `driver_documents` | 司机证件，`UNIQUE(driver_id, document_type)` |
| `vehicle_documents` | 车辆证件，`UNIQUE(vehicle_kind, vehicle_id, document_type)` |
| `service_staff` | 客服账号，`role`('admin'\|'staff') |
| `advance_fund_records` | 备用金充值记录 |
| `fee_types` | 费用类型配置 |
| `operation_logs` | 操作日志 |
| `vehicle_locations` | GPS 位置记录 |

### 常见查询模式

```ts
// 查车头当前拉的车挂
JOIN truck_trailer_assignments WHERE is_current=true JOIN vehicles_trailer

// 查司机证件
SELECT * FROM driver_documents WHERE driver_id=X

// 查车头详情（含公司名）
JOIN operating_companies ON vehicles.operating_company_id = operating_companies.id
```

---

## 代码约定

### Path Alias
两个项目均用 `@/` 指向 `src/`。

### Biome
两个项目均使用 Biome 做代码检查（`biome.json`），不使用 ESLint。禁止 CommonJS（`noCommonJs: error`）。

### 小程序禁用包
- `echarts-for-taro` — 不存在，禁止使用
- `file-saver` — 在 weapp 构建中报错，改用 `Taro.getFileSystemManager()` 或 `Taro.downloadFile()`

### OCR 代理
客服后台法律咨询模块图片识别通过 `/api/ocr/recognize` 代理转发。开发环境 `vite.config.dev.ts` 中已配置代理到 `http://119.91.129.106`；生产环境需要 Nginx 反代配置。

### JT/T 808 GPS
`jt808-server/` 目录下是独立的 Node.js TCP 服务，用 PM2 管理，负责接收 GPS 终端数据并写入 `vehicle_locations` 表。
