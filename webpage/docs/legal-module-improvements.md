# 法务模块改进规格书（v1.1 补充）

> 基于 `legal-system-design.md` v1.0 的实现后复盘
> 日期：2026-06-11
> 范围：对照设计文档逐项核查已完成实现，列出功能缺口、体验问题与改进任务

---

## 0. 当前完成度总览

| 设计章节 | 功能点 | 状态 |
|---|---|---|
| §3.1 | 合同录入（手动 + OCR/AI 抽取） | ✅ 已完成 |
| §3.2 | 到期预警（90/60/30 三档 + 标记已处理） | ✅ 已完成 |
| §3.3 | 合同终止 | ✅ 已完成 |
| §3.3 | **合同编辑** | ❌ 缺失 |
| §3.3 | **合同续约流程** | ❌ 缺失 |
| §3.4 | 台账列表（筛选、搜索、详情抽屉） | ✅ 已完成 |
| §4.1-4.2 | 文件库 CRUD + 版本管理 | ✅ 已完成 |
| §4.3 | **服务端 trgm 全文检索** | ❌ 缺失（当前客户端过滤） |
| §4.4 | **文件库详情「向 AI 提问」入口** | ❌ 缺失 |
| §5.1 | 风险扫描 + 报告渲染 | ✅ 已完成 |
| §5.2 | **模板对照（偏离清单）** | ❌ 缺失（后端已支持，UI 未暴露） |
| §5.3 | 文件问答（LegalConsult 选文件库文档） | ✅ 已完成 |
| §6 | 数据库迁移 + 桶 + 视图 | ✅ 已完成 |
| §7 | db-proxy 白名单 + 权限 | ✅ 已完成 |
| §9 | **操作日志写入** | ❌ 缺失 |
| §9 | **i18n 双语文案** | ❌ 台账页 + 文件库页未接入 |
| — | Dashboard 合同到期预警卡片 | ✅ 已完成 |

---

## 1. P0：合同编辑与续约流程

### 1.1 合同编辑（对应 §3.4「详情抽屉 → 编辑」）

**现状**：`ContractsPage.tsx` 只有 `createContract`，详情抽屉仅展示信息 + 风险扫描 + 终止，无编辑能力。

**改动**：

- 详情抽屉新增「编辑」按钮（仅 admin），点击打开编辑对话框（复用新增表单，预填当前值）
- 新增 API `updateContract(id, patch)`，db-proxy 对 contracts 表的 PATCH 已允许 admin
- 保存后刷新列表 + 详情；写入 `operation_logs`（target_type='contract', action='update'）
- 允许编辑的字段：title, contract_no, counterparty, category, amount, currency, sign_date, start_date, end_date, auto_renew, renew_notice_days, owner_staff_id, remark
- 不允许编辑：status（通过续约/终止操作变更）、ocr_text、extracted（只读）

**文件改动**：
```
src/pages/ContractsPage.tsx          — 详情抽屉加编辑按钮 + 编辑对话框
src/db/api.ts                        — updateContract 已存在，确认可用
```

### 1.2 合同续约流程（对应 §3.3）

**现状**：仅有终止按钮，无续约入口。设计要求：弹窗预填原合同 → 创建新合同行（`renewed_from_id` 指向原合同）→ 原合同 `status='renewed'`。

**改动**：

- 详情抽屉新增「续约」按钮（仅 admin，仅 status='active'）
- 点击打开续约对话框：
  - 预填原合同的 title、counterparty、category、amount、currency、auto_renew、renew_notice_days
  - 清空 start_date、end_date（待用户填写新周期）
  - `renewed_from_id` 自动设为原合同 id
- 保存时：
  1. `createContract({ ...newData, renewed_from_id: original.id })`
  2. `updateContract(original.id, { status: 'renewed' })`
  3. 写入两条 operation_logs
- 续约后详情抽屉显示关联关系：「续约自：XXX」/「已续约为：XXX」

**文件改动**：
```
src/pages/ContractsPage.tsx          — 续约按钮 + 续约对话框 + 关联展示
src/db/api.ts                        — 无新增（复用 create + update）
```

---

## 2. P1：功能完善

### 2.1 i18n 补全

**现状**：`ContractsPage.tsx` 和 `LegalLibraryPage.tsx` 全部硬编码中文，未使用 `useTranslation()`。`Legal.tsx`（AI 三件套）已正确接入 i18n。

**改动**：

- 两个页面全量接入 `useTranslation()`
- 在 `zh.json` / `en.json` 的 `legal` 命名空间下新增：
  ```
  legal.contracts.title         合同台账 / Contract Ledger
  legal.contracts.description   合同生命周期、到期预警与 AI 风险扫描 / ...
  legal.contracts.add           新增合同 / Add Contract
  legal.contracts.edit          编辑合同 / Edit Contract
  legal.contracts.renew         续约 / Renew
  legal.contracts.terminate     终止合同 / Terminate
  legal.contracts.searchPlaceholder  搜索标题、对方或编号 / ...
  legal.contracts.allStatus     全部状态 / All Status
  legal.contracts.active        履行中 / Active
  legal.contracts.renewed       已续约 / Renewed
  legal.contracts.terminated    已终止 / Terminated
  legal.contracts.expired       已过期 / Expired
  legal.contracts.alertTitle    合同到期预警 / Expiry Alerts
  legal.contracts.markHandled   标记已处理 / Mark Handled
  legal.contracts.riskScan      风险扫描 / Risk Scan
  legal.contracts.noOcrText     该合同没有可审查的 OCR 正文 / ...
  legal.contracts.fields.*      各表单字段标签
  legal.library.title           法律文件库 / Legal Library
  legal.library.upload          上传文件 / Upload File
  legal.library.newVersion      发布新版本 / Publish New Version
  legal.library.searchPlaceholder  搜索标题或正文 / ...
  legal.library.allTypes        全部分类 / All Types
  legal.library.delete          删除文档 / Delete Document
  ... (完整枚举略)
  ```

**文件改动**：
```
src/pages/ContractsPage.tsx
src/pages/LegalLibraryPage.tsx
src/i18n/locales/zh.json
src/i18n/locales/en.json
```

### 2.2 表单标签中文化

**现状**：新增合同对话框中，`(['title','contract_no',...] as const).map((key) => ...)` 直接拿字段名当 Label 显示。

**改动**：

- 建立字段名 → i18n key 的映射：
  ```ts
  const fieldLabels: Record<string, string> = {
    title: t('legal.contracts.fields.title'),           // 合同标题
    contract_no: t('legal.contracts.fields.contractNo'), // 合同编号
    counterparty: t('legal.contracts.fields.counterparty'), // 对方单位
    amount: t('legal.contracts.fields.amount'),          // 金额
    currency: t('legal.contracts.fields.currency'),      // 币种
    sign_date: t('legal.contracts.fields.signDate'),     // 签署日期
    start_date: t('legal.contracts.fields.startDate'),   // 开始日期
    end_date: t('legal.contracts.fields.endDate'),       // 到期日期
    renew_notice_days: t('legal.contracts.fields.renewNoticeDays'), // 解约通知期(天)
  };
  ```
- 同时修正 category 下拉选项从英文枚举值改为中文标签

### 2.3 服务端全文检索（对应 §4.3）

**现状**：`LegalLibraryPage.tsx` 的搜索走 `useMemo` 在前端 `Array.filter`，未利用数据库 `pg_trgm` GIN 索引。

**改动**：

- `db/api.ts` 新增 `searchLegalDocuments(keyword: string, docType?: string)` → 调用 db-proxy，SQL 使用 `content_text ILIKE '%keyword%'` 或 `title ILIKE '%keyword%'`
- `LegalLibraryPage` 搜索改为 debounce 300ms 后调用服务端接口
- 搜索结果包含匹配摘录（前后各 80 字符），前端高亮关键词
- 空搜索词时退回全量加载（当前逻辑）

**文件改动**：
```
src/db/api.ts                        — 新增 searchLegalDocuments
src/pages/LegalLibraryPage.tsx       — 搜索改为服务端调用 + 高亮
```

### 2.4 模板对照（对应 §5.2）

**现状**：`scanContractRisk(contractText, templateText?)` 已支持传入模板文本，但 UI 上没有选择模板的入口。

**改动**：

- 合同详情抽屉「风险扫描」按钮旁新增「模板对照」按钮
- 点击后弹出文件库中 `doc_type='template'` 的文档列表供选择
- 选择后取模板的 `content_text`，调用 `scanContractRisk(ocr_text, templateText)`
- 结果存入 `contract_reviews`（`review_type='template_diff'`, `template_version_id` 填入）
- 报告渲染区分两种类型：风险扫描显示 findings，模板对照显示偏离条款清单

**文件改动**：
```
src/pages/ContractsPage.tsx          — 模板选择弹窗 + 对照按钮
src/db/api.ts                        — 获取 template 类型文档列表
src/lib/contract-extract.ts          — 无需改动（已支持）
```

---

## 3. P2：体验优化

### 3.1 组件拆分

**现状**：`ContractsPage.tsx` 125 行，包含预警区、列表、新增对话框、详情抽屉、风险扫描全部逻辑。

**目标结构**（对应设计文档 §9）：
```
src/components/contracts/
  ContractAlerts.tsx          — 90/60/30 预警区 + 标记已处理
  ContractTable.tsx           — 列表 + 筛选 + 搜索
  ContractFormDialog.tsx      — 新增/编辑表单（OCR + AI 抽取 + 续约预填）
  ContractDetailSheet.tsx     — 详情抽屉（信息 + 附件 + 报告 + 操作按钮）
  RiskScanReport.tsx          — 审查报告渲染（findings 卡片 + severity badge）
```

- `ContractsPage.tsx` 简化为状态管理 + 子组件组合
- 每个子组件接收 props，不直接调用 API（由页面统一管理数据流）

### 3.2 操作日志（对应 §9）

**现状**：`operation_logs` 的 `target_type` CHECK 约束已扩展（含 `contract` / `legal_document`），但前端合同和文档的增删改操作均未写入日志。

**改动**：

- 在以下操作成功后调用 `createOperationLog()`：
  | 操作 | target_type | action | detail |
  |---|---|---|---|
  | 新增合同 | contract | create | 合同标题 + 对方 |
  | 编辑合同 | contract | update | 变更字段摘要 |
  | 续约合同 | contract | renew | 新合同 id + 原合同 id |
  | 终止合同 | contract | terminate | 合同标题 |
  | 上传文档 | legal_document | create | 文档标题 + 分类 |
  | 发布新版本 | legal_document | update | 版本号 |
  | 删除文档 | legal_document | delete | 文档标题 |

### 3.3 文件库详情「向 AI 提问」入口（对应 §4.4）

**现状**：设计要求文件库详情抽屉有「向 AI 提问」按钮，自动将当前文档传入 LegalConsult 作为上下文。目前缺失。

**改动**：

- 文件库详情抽屉新增「向 AI 提问」按钮
- 点击后导航至 `/legal`，query 参数带 `docId=xxx`
- `LegalConsult` 组件读取 query 参数，自动选中该文档到 `selectedDocumentIds`
- 备选方案：不跳转，在详情抽屉内嵌一个简化版问答（仅输入框 + 回答区），注入当前文档的 `content_text`

### 3.4 空状态与加载态

**现状**：合同台账和文件库首次加载时无任何反馈，列表区为空白。

**改动**：

- 加载中：在 Table 区域显示 Skeleton 骨架屏（3-5 行）
- 空数据：显示插图 + 文案「暂无合同，点击右上角新增」/「暂无文件，点击上传」
- 加载失败：显示 Alert + 重试按钮（ContractsPage 已有 toast，但无内联提示）

### 3.5 合同状态「已过期」展示（对应 §3.3）

**现状**：设计要求 `end_date` 已过且 `status='active'` 的合同在 UI 上显示为「已过期」（计算值，不改库），但当前列表的 Badge 仅显示数据库中的 status 值。

**改动**：

- 列表渲染时判断：若 `status === 'active' && end_date && new Date(end_date) < today`，Badge 显示红色「已过期」
- 筛选项新增「已过期」选项（客户端过滤逻辑）

---

## 4. 实施计划

| 序号 | 任务 | 优先级 | 预估工时 | 依赖 |
|---|---|---|---|---|
| 1 | 合同编辑（详情抽屉 + 编辑对话框） | P0 | 2h | — |
| 2 | 合同续约流程（续约对话框 + 状态变更 + 关联展示） | P0 | 2h | #1 |
| 3 | i18n 补全（台账页 + 文件库页 + zh/en 文案） | P1 | 2h | — |
| 4 | 表单标签中文化 + category 翻译 | P1 | 0.5h | #3 |
| 5 | 服务端全文检索（API + debounce + 高亮） | P1 | 2h | — |
| 6 | 模板对照 UI（选择模板 + 对照按钮 + 报告区分） | P1 | 2h | — |
| 7 | 组件拆分（ContractsPage → 5 个子组件） | P2 | 3h | #1 #2 |
| 8 | 操作日志写入（7 个操作点） | P2 | 1h | #1 #2 |
| 9 | 文件库「向 AI 提问」入口 | P2 | 1h | — |
| 10 | 空状态 / 加载态 / 已过期 Badge | P2 | 1h | — |

**建议执行顺序**：1 → 2 → 3+4 → 5+6（并行）→ 7 → 8+9+10

总计约 **16.5h**，按 P0 → P1 → P2 分三批交付。

---

## 5. 风险与注意事项

1. **组件拆分时机**：建议在 P0（编辑/续约）完成后立即做 P2 #7 的拆分，否则 ContractsPage 会膨胀到 300+ 行难以维护。
2. **服务端检索 SQL 注入**：db-proxy 使用 `$1` 参数化查询，前端传关键词时需确认 db-proxy 的 ILIKE 查询走参数绑定。
3. **模板对照上下文长度**：合同文本 + 模板文本各截断 12k 字符（已在 `contract-extract.ts` 实现），但两者拼接后可能接近模型上下文上限，需监控 API 报错并在 UI 提示。
4. **续约的事务性**：创建新合同 + 修改原合同状态应是原子操作；当前 db-proxy 不支持事务，需在前端做补偿（若第二步失败，提示用户手动处理或重试）。
