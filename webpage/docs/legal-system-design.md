# 法务系统设计规格书（供 Codex 实现）

> 版本 v1.0 · 2026-06-11
> 范围：模块 1「合同台账与到期/续约提醒」、模块 2「法律文件库」，以及配套 AI 能力（风险扫描、模板对照、问答）。
> 本文档是实现规格：表结构、接口改动、文件清单、任务拆分均可直接执行。实现时如与现有代码冲突，以现有代码约定为准并在 PR 中注明。

---

## 1. 现状与可复用设施

| 设施 | 位置 | 说明 |
|---|---|---|
| 数据访问 | `db-proxy/`（service_role + 白名单） | 前端不直连 Supabase；新表/新桶必须加入 `db-proxy/authorize.js` 的 `ALLOWED_TABLES` / `ALLOWED_BUCKETS` |
| RLS | `supabase/migrations/20260621171750_baseline.sql` | anon/authenticated 已全量 REVOKE，新表默认即安全，无需写策略 |
| 角色 | `service_staff.role`：`admin` / `staff` | db-proxy session 携带 role；复用，不新增角色 |
| OCR | `ocr-proxy/`（腾讯云 GeneralAccurateOCR）+ `src/lib/ocr.ts` | 当前仅支持图片（jpeg/png/webp ≤10MB），需扩展 PDF |
| AI | `agent-proxy /api/agent/chat`（MiMo Token Plan） | 服务端统一调用，浏览器不持有模型密钥 |
| 已有法务页 | `/legal`：`ContractReview` / `LegalConsult` / `ContractTemplates` | AI 审查历史已落库 `legal_reviews`（保留不动） |
| 上传 | `src/hooks/use-supabase-upload.ts` + `src/components/dropzone.tsx` | 复用 |
| 路由 | `src/routes.tsx`（`RouteConfig`，支持 `adminOnly`） | 复用 |
| i18n | `src/i18n/locales/zh.json` / `en.json` | 所有新文案必须双语 |

## 2. 总体结构

导航（`MainLayout.tsx` 的 `navGroups`）：在「运营」组的 `/legal` 之外，新增独立「法务」组：

- `/legal/contracts` 合同台账（含到期预警）— 新页面 `ContractsPage`
- `/legal/library` 法律文件库 — 新页面 `LegalLibraryPage`
- `/legal` 法务专家（现有 AI 三件套，保留）

权限：所有 staff 可读可新增；**修改/删除/续约/终止合同、删除文件、发布新版本仅 admin**。前端用 `AuthContext` 的 `isAdmin` 控制按钮，db-proxy 侧在 `authorize.js` 中对 DELETE 方法限制 admin（见 §7）。

## 3. 模块 1：合同台账与到期/续约提醒

### 3.1 录入流程（OCR + AI 抽取，人工确认）

1. 上传合同扫描件（图片或 PDF，支持多文件）→ 存入 `contracts` 桶。
2. 逐文件调用 OCR（PDF 逐页，见 §8），合并全文存 `contracts.ocr_text`。
3. 调用 AI 抽取要素：prompt 要求**仅输出 JSON**（`title, contract_no, counterparty, category, amount, currency, sign_date, start_date, end_date, auto_renew, renew_notice_days`），原始结果存 `contracts.extracted`。
4. 抽取结果预填表单，**人工核对修改后保存**（AI 结果不可直接入库）。
5. 保存后可一键触发风险扫描（§5.1）。

兜底：OCR 或 AI 失败时降级为纯手动表单录入；同时支持不传文件直接手录。

### 3.2 提醒机制（系统内，90/60/30 递进）

- 不引入 cron。预警实时计算：视图 `contracts_expiring`（§6）按 `end_date - current_date` 算出 `days_left` 与 `alert_level (90/60/30)`。
- 展示位：
  - 合同台账页顶部预警区：红（≤30 天）/ 橙（≤60）/ 黄（≤90）三档列表；
  - `DashboardPage` 新增「合同到期预警」卡片（数量 + 最近 5 条，点击跳转台账）；
  - 「法务」导航项显示未处理预警数 badge（可选，Phase 2）。
- 每档可「标记已处理」：写入 `contract_alert_acks (contract_id, level)`，该档不再提示，进入下一档时重新提示。
- 自动续约合同（`auto_renew=true`）的预警文案改为「续约/解约通知截止日」：以 `end_date - renew_notice_days` 为基准日提醒。

### 3.3 合同生命周期

`status`: `active` → `renewed` / `terminated`；`end_date` 已过且未处理的 active 合同在 UI 上显示为「已过期」（计算值，不改库）。
续约操作：弹窗预填原合同信息 → 创建新合同行并设 `renewed_from_id` → 原合同 `status='renewed'`。

### 3.4 台账页 UI

- 列表：标题/对方/类别/金额/起止日期/负责人/状态/剩余天数（彩色徽标），支持按状态、类别、到期范围筛选 + 关键词搜索（标题/对方/编号 ILIKE）。
- 详情抽屉（Sheet）：基本信息、附件预览/下载（签名 URL）、AI 审查报告历史、操作（编辑/续约/终止，admin）。
- 录入对话框：上传区 + OCR/抽取进度 + 可编辑表单。

## 4. 模块 2：法律文件库

### 4.1 范围与分类

`doc_type`：`template` 合同模板 / `policy` 内部制度 / `regulation` 法律法规 / `litigation` 诉讼文书 / `authorization` 授权委托 / `other`。另有自由 `tags text[]`。

### 4.2 版本管理

文档主表 `legal_documents` + 版本表 `legal_document_versions`（v1, v2…）。上传新版本不覆盖旧版；主表 `current_version_id` 指向最新版。版本列表可下载任意历史版。**删除文档 = `is_active=false`（软删，admin）**。

### 4.3 全文检索

- 每个版本提取纯文本存 `content_text`：txt/md 直读；图片与 PDF 走 OCR；docx 解析留到 Phase 3（先存空并标记 `text_status='pending'`）。
- 检索方案：启用 `pg_trgm`，对 `content_text`、`title` 建 GIN(trgm) 索引，查询用 `ILIKE '%kw%'`。千级文档量足够；中文无需分词器。预留升级 pgroonga 的可能，不在本期。
- 搜索结果高亮：前端对返回文本做关键词截取（前后各 80 字符）。

### 4.4 文件库页 UI

左侧分类树（doc_type + 标签筛选）+ 顶部全文搜索框；列表显示标题/类型/标签/当前版本/更新时间；详情抽屉含版本历史、预览/下载、「向 AI 提问」入口（§5.3）。

## 5. AI 能力（复用服务端 MiMo 网关）

### 5.1 合同风险扫描

输入 `contracts.ocr_text` → prompt 要求输出 JSON：`risk_level (high/medium/low)`、`summary`、`findings[]`（每条含 `clause` 原文摘录、`risk` 风险说明、`suggestion` 修改建议、`severity`）。结果存 `contract_reviews`，详情抽屉内渲染为报告卡片。重点检查项写入 system prompt：缺失违约责任、单方解除权不对等、管辖/仲裁条款不利、自动续约陷阱、付款与发票条款、保密与竞业、不可抗力。

### 5.2 模板对照

在风险扫描时可选择文件库中一份 `template` 文档：将模板 `content_text` 与合同 `ocr_text` 一起送入 prompt，要求列出「偏离标准条款」清单。结果同样存 `contract_reviews`（`template_version_id` 记录所用模板版本）。注意上下文长度：两文各截断至 ~12k 字符，超长时提示用户。

### 5.3 文件问答

复用现有 `LegalConsult` 组件改造：支持从文件库选择 1-3 份文档，将其 `content_text`（截断）注入 system prompt 作为依据，要求回答时引用出处。不新建表，沿用对话即问即答。

## 6. 数据库结构（已并入 `supabase/migrations/20260621171750_baseline.sql`）

```sql
-- 法务结构已并入 20260621171750_baseline.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 合同台账
CREATE TABLE contracts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  contract_no TEXT,
  counterparty TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('transport','lease','labor','purchase','service','other')),
  amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'CNY',
  sign_date DATE,
  start_date DATE,
  end_date DATE,                      -- NULL = 无固定期限，不参与到期预警
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  renew_notice_days INT,              -- 自动续约合同的解约通知期（天）
  owner_staff_id BIGINT REFERENCES service_staff(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','renewed','terminated')),
  renewed_from_id BIGINT REFERENCES contracts(id),
  remark TEXT,
  ocr_text TEXT,
  extracted JSONB,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_end_date ON contracts (end_date) WHERE status = 'active';
CREATE INDEX idx_contracts_trgm ON contracts
  USING gin ((coalesce(title,'') || ' ' || coalesce(counterparty,'') || ' ' || coalesce(contract_no,'')) gin_trgm_ops);

-- 合同附件
CREATE TABLE contract_files (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,         -- 桶固定为 contracts
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI 审查报告（与已有 legal_reviews 互不影响）
CREATE TABLE contract_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL DEFAULT 'risk_scan'
    CHECK (review_type IN ('risk_scan','template_diff')),
  template_version_id BIGINT,         -- FK 在版本表建表后补加
  model TEXT,
  risk_level TEXT CHECK (risk_level IN ('high','medium','low')),
  summary TEXT,
  findings JSONB,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 到期预警确认
CREATE TABLE contract_alert_acks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  level INT NOT NULL CHECK (level IN (90,60,30)),
  acked_by BIGINT REFERENCES service_staff(id),
  acked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  UNIQUE (contract_id, level)
);

-- 文件库
CREATE TABLE legal_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other'
    CHECK (doc_type IN ('template','policy','regulation','litigation','authorization','other')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  current_version_id BIGINT,          -- FK 在版本表建表后补加
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_legal_documents_title_trgm ON legal_documents USING gin (title gin_trgm_ops);

CREATE TABLE legal_document_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  storage_path TEXT NOT NULL,         -- 桶固定为 legal-library
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  content_text TEXT,
  text_status TEXT NOT NULL DEFAULT 'done'
    CHECK (text_status IN ('done','pending','failed')),
  note TEXT,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
CREATE INDEX idx_ldv_content_trgm ON legal_document_versions USING gin (content_text gin_trgm_ops);

ALTER TABLE legal_documents
  ADD CONSTRAINT fk_ld_current_version FOREIGN KEY (current_version_id)
  REFERENCES legal_document_versions(id);
ALTER TABLE contract_reviews
  ADD CONSTRAINT fk_cr_template_version FOREIGN KEY (template_version_id)
  REFERENCES legal_document_versions(id);

-- 到期预警视图
CREATE VIEW contracts_expiring AS
SELECT c.*,
  (c.end_date - CURRENT_DATE) AS days_left,
  CASE WHEN c.auto_renew AND c.renew_notice_days IS NOT NULL
       THEN (c.end_date - c.renew_notice_days - CURRENT_DATE)
       ELSE (c.end_date - CURRENT_DATE) END AS effective_days_left,
  CASE
    WHEN (c.end_date - CURRENT_DATE) <= 30 THEN 30
    WHEN (c.end_date - CURRENT_DATE) <= 60 THEN 60
    WHEN (c.end_date - CURRENT_DATE) <= 90 THEN 90
  END AS alert_level,
  EXISTS (
    SELECT 1 FROM contract_alert_acks a
    WHERE a.contract_id = c.id
      AND a.level = CASE
        WHEN (c.end_date - CURRENT_DATE) <= 30 THEN 30
        WHEN (c.end_date - CURRENT_DATE) <= 60 THEN 60
        ELSE 90 END
  ) AS acked
FROM contracts c
WHERE c.status = 'active'
  AND c.end_date IS NOT NULL
  AND c.end_date - CURRENT_DATE <= 90;

-- 沿用基线中的锁定策略：仅开 RLS，不授权 anon/authenticated（db-proxy 走 service_role 不受影响）
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_alert_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;
```

另需在 Supabase 创建私有桶 `contracts`、`legal-library`（Dashboard 或 SQL `insert into storage.buckets`），不开公开访问，下载一律走签名 URL。

## 7. db-proxy 改动（`db-proxy/authorize.js`）

1. `ALLOWED_TABLES` 追加：`contracts, contract_files, contract_reviews, contract_alert_acks, legal_documents, legal_document_versions, contracts_expiring`。
2. `ALLOWED_BUCKETS` 追加：`contracts, legal-library`。
3. 写权限收紧：`authorizeRest` 中新增规则——对上述法务表，`DELETE` 与 `PATCH`（`legal_documents`、`contracts` 的 status/敏感字段变更）要求 `session.role === 'admin'`；`INSERT` 与 `SELECT` 全员放行。`contract_alert_acks` 的 INSERT 全员放行。
4. 同步更新 `authorize.test.js` 用例。

## 8. ocr-proxy 改动（PDF 支持）

`ocr-proxy/server.js` 新增对 `application/pdf` 的处理：腾讯云 `GeneralAccurateOCR` 支持 `IsPdf=true` + `PdfPageNumber`（单次一页）。流程：收到 PDF → 用 `pdf-lib` 读页数（≤20 页限制，超出报错提示拆分）→ 逐页调用 → 拼接文本返回（响应结构不变，新增 `pageCount` 字段）。前端 `src/lib/ocr.ts` 的 `ACCEPTED_IMAGE_TYPES` 增加 `application/pdf`，大小上限 PDF 放宽至 20MB。

备选方案（如不想动 ocr-proxy）：前端用 pdf.js 渲染逐页转 PNG 再走现有接口。缺点是增加 ~400KB 包体且慢，不推荐。

## 9. 前端文件清单

```
src/routes.tsx                          # +2 路由：/legal/contracts、/legal/library
src/components/layouts/MainLayout.tsx    # navGroups 新增「法务」组
src/pages/ContractsPage.tsx              # 新增
src/pages/LegalLibraryPage.tsx           # 新增
src/components/contracts/
  ContractAlerts.tsx                     # 90/60/30 预警区 + 标记已处理
  ContractTable.tsx                      # 列表 + 筛选
  ContractFormDialog.tsx                 # 上传→OCR→AI抽取→表单
  ContractDetailSheet.tsx                # 详情/附件/审查报告/续约/终止
  RiskScanReport.tsx                     # 审查报告渲染（findings 卡片）
src/components/library/
  LibrarySidebar.tsx                     # 分类树 + 标签
  DocumentTable.tsx                      # 列表 + 全文搜索
  DocumentUploadDialog.tsx               # 新文档/新版本上传 + 文本提取
  DocumentDetailSheet.tsx                # 版本历史/预览/问AI
src/components/dashboard/ContractExpiryCard.tsx   # Dashboard 预警卡片
src/db/api.ts                            # 新增 contracts / library 两段 API（沿用现有缓存模式）
src/lib/contract-extract.ts              # AI 要素抽取 + 风险扫描 prompt 与 JSON 解析（容错：剥离 markdown 围栏）
src/types/legal.ts                       # 类型定义
src/i18n/locales/zh.json, en.json        # legal.contracts.* / legal.library.* 全量文案
```

操作日志：合同与文档的增改删调用现有 `operation_logs` 写入逻辑，`target_type` 沿用文本字段直接写 `'contract'` / `'legal_document'`（注意：基线中该列有 CHECK 约束，需在对应结构中扩展该约束的枚举值）。

## 10. 实施计划（Codex 任务拆分）

| # | 任务 | 验收标准 |
|---|---|---|
| 1 | 基线结构 + 建桶 + db-proxy 白名单/权限 + 测试 | 结构可重复验证；authorize.test.js 全绿；staff 不能 DELETE 法务表 |
| 2 | 合同台账 CRUD（纯手动录入版）+ 路由/导航/i18n | 手动新增、编辑、筛选、详情、附件上传下载可用；中英文案完整 |
| 3 | 到期预警：视图接入 + 台账预警区 + Dashboard 卡片 + 标记已处理 | 构造 end_date 在 25/55/85 天的测试数据，三档颜色与 ack 行为正确；auto_renew 合同按通知期提醒 |
| 4 | OCR 录入链路：ocr-proxy PDF 支持 + 上传→识别→AI 抽取→预填表单 | 上传 3 页 PDF 能识别并预填 ≥6 个字段；失败可降级手录 |
| 5 | 风险扫描 + 报告存储渲染 | 扫描产出结构化 findings 并持久化；JSON 解析对非规范输出有容错 |
| 6 | 文件库：CRUD + 版本管理 + 文本提取 + trgm 全文检索 | 上传 v1/v2 各自可下载；按正文关键词能搜到并显示摘录 |
| 7 | 模板对照 + 文件问答（改造 LegalConsult） | 选模板对照产出偏离清单；选库内文档提问时回答引用文档内容 |
| 8 | 回归：`npm run lint` + `npm run test` + 手工冒烟 | 全部通过 |

阶段划分：任务 1-3 为 Phase 1（最快拿到提醒价值），4-6 为 Phase 2，7 为 Phase 3。

## 11. 风险与待决策点

1. **数据外发**：合同全文会送 MiMo Token Plan 与腾讯 OCR。模型凭证仅保存在 agent-proxy；如有保密等级高的合同，建议后续加「不送 AI」标记。
2. **上下文长度**：长合同 + 模板对照可能超限，已规定 12k 字符截断；后续可换分段审查。
3. **docx 文本提取**：Phase 3 处理（候选：服务端 mammoth）。在此之前 docx 仅可存档与下载，不参与全文检索。
4. **腾讯 OCR PDF 页数限制**：单文档 >20 页需拆分上传；台账场景下罕见，先按报错提示处理。
5. **提醒只在系统内**：用户未登录则看不到。若日后需要邮件/IM 推送，加一个每日 cron（Supabase Edge Function + pg_cron）即可，表结构无需改动。
