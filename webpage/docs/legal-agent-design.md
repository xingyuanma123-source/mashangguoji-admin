# 马上国际法务 Agent 设计书（v2.0）

> 日期：2026-06-11
> 定位：跨境物流（中国—越南/东南亚）公司的**法务智能体**，替代 v1.0 的"工具箱"形态
> 本文档是产品 + 技术双重设计：形态、场景工作流、Agent 架构、数据模型、Playbook、实施路线图

---

## 0. 为什么 v1.0 不是一个 Agent

v1.0（合同台账 + 文件库 + AI 三件套）本质是**工具集合**：用户找工具 → 填表单 → 点按钮 → 看一次性 AI 输出。问题在于：

| v1.0 工具箱 | 真正的法务 Agent |
|---|---|
| 以**文档**为中心（合同表、文件表） | 以**事项（Matter）**为中心（一单货损索赔、一次合同谈判、一笔欠款追收） |
| 用户驱动：人找功能 | 任务驱动：人说目标，agent 拆解执行 |
| 一次性调用：上传→输出→结束 | 多步执行：检索→分析→起草→等审批→跟进，有状态有记忆 |
| 被动：人不打开页面就什么都不发生 | 主动：监控到期、时效、义务，主动找人 |
| AI 无公司立场 | 有 **Playbook**：知道公司的标准条款立场、风险红线、谈判底线 |
| 各功能孤岛（审查不知道台账，咨询不知道历史） | 统一上下文：一个事项下的合同、证据、往来函件、AI 分析全部关联 |

业界同样在做这个转变：Harvey 已从 chat 助手转向 Workflow Agents（平台上运行超 2.5 万个自定义 agent）；Spellbook Associate 可以从一句指令执行多文档工作流；GC AI 的核心是 Projects（事项记忆）+ Playbooks（审查标准）；2026 年 CLM 行业共识是 agent 贯通「合同接入 → 谈判 → 签署 → 签后义务跟踪」全生命周期。物流领域，AI 索赔平台已把平均 120 天的货损索赔周期压缩到一周内。

---

## 1. 产品形态总览

### 1.1 一句话定义

> **一个懂跨境物流的 AI 法务专员**：你把货损照片、合同扫描件、客户的索赔邮件丢给它，它告诉你"该向谁追偿、能要多少、证据缺什么、函件我已经写好了"，并且自己盯着时效和截止日。

### 1.2 三层形态

```
┌─────────────────────────────────────────────────────┐
│  ① 对话工作台（Agent Console）— 唯一主入口            │
│     自然语言下达任务，agent 多步执行，过程可见可干预      │
├─────────────────────────────────────────────────────┤
│  ② 事项中心（Matters）— 工作的组织单元                 │
│     索赔案、合同审查、欠款追收…每个事项聚合全部上下文      │
├─────────────────────────────────────────────────────┤
│  ③ 雷达（Radar）— 主动监控层                          │
│     到期/时效/义务/异常的自动扫描，生成待办推给责任人      │
└─────────────────────────────────────────────────────┘
```

现有页面的去向：
- 合同台账 → 降级为事项中心的一个视图（合同型事项列表），保留但不再是主入口
- 文件库 → 降级为 agent 的知识库后端 + 一个管理页面
- AI 三件套 → 取消独立 tab，能力并入对话工作台

### 1.3 主界面布局（Agent Console）

```
┌────────────┬──────────────────────────────┬────────────────┐
│  事项列表    │       对话 + 执行流            │   上下文面板     │
│            │                              │                │
│ 🔴 越A货损   │  用户: 客户索赔 8 万，这单     │  当前事项:       │
│   索赔中     │  是宏远承运的，帮我处理        │  越A货损索赔     │
│ 🟡 宏远合同  │                              │                │
│   待续约     │  Agent:                      │  关联合同 (1)   │
│ 🟢 XX欠款   │  ✓ 已找到与宏远的分包协议       │  证据文件 (4)   │
│   已发函     │  ✓ 第二条约定赔偿不以运费为限   │  往来函件 (2)   │
│            │  ✓ 证据检查: 缺交接单签收照片    │  待办 (3)      │
│ + 新事项    │  ⚠ 追偿时效: 还剩 247 天       │                │
│            │  📄 已起草《索赔函》待你确认 →   │  时间线 ▾      │
└────────────┴──────────────────────────────┴────────────────┘
```

关键交互原则：
1. **Agent 的每一步执行都可见**（调了什么工具、查了什么数据），可随时打断
2. **写操作必须人工确认**：发函、改状态、对外文书定稿，agent 只能"起草待批"
3. **引用可溯源**：所有结论必须标注依据（合同第几条 / 文件库哪份文件 / 哪条法规）

---

## 2. 五大核心场景工作流（物流特化）

### W1 货损/货差索赔 Agent ⭐ 核心场景

跨境物流最高频、最痛的法务场景。全球供应链每年货损超 500 亿美元，传统索赔平均 120 天。

**触发方式**：
- 用户在对话框描述（"XX 单货在越南段淋雨了，客户索赔 8 万"）
- 转发客户索赔邮件/截图（OCR 解析）
- 司机端小程序上报异常（与现有 miniapp 司机端打通，Phase 3）

**Agent 执行流（自动，每步可见）**：

```
1. 立案     → 创建索赔事项，抽取：运单号、区段、货物、金额、责任方
2. 关联检索 → 自动找出与责任方(分包商)的合同，定位赔偿/追偿/证据条款
3. 责任分析 → 基于合同条款 + 事故事实，输出责任认定意见:
              · 我方对客户的赔付义务与上限
              · 可向分包商追偿的金额与依据条款
              · 时效: 国内运输 1 年 / CMR 类跨境公约期限，倒计时
4. 证据清单 → 按"证据包"标准生成 checklist:
              运单、交接单、签收单、现场照片/视频、异常说明、
              货值证明(发票)、维修/残值评估、客户索赔函
              → 标注已有/缺失，缺失项生成待办派给跟单员
5. 文书起草 → 索赔函/催告函/赔偿确认书（用文件库模板 + 事实自动填充）
              → 人工审批后定稿，记录发出时间
6. 跟进监控 → 函件发出 5 个工作日未回复自动提醒升级;
              时效剩 90/30 天主动告警"该起诉了"
7. 结案归档 → 赔付/追偿到账后结案，沉淀为案例进知识库
```

**价值**：把"翻合同找条款、想证据要什么、写函"的 2-3 天工作压缩到 10 分钟 + 不漏时效。

### W2 合同审查 Agent（Playbook 驱动）

升级现有的"上传→输出报告"为**基于公司立场的审查**。

- **Playbook = 马上国际的标准立场库**（详见 §5），按合同类型（运输/分包/仓储/租赁/劳动）定义每个关键条款的：理想立场 / 可接受底线 / 红线
- 审查输出不是泛泛的"风险提示"，而是**三栏对照**：对方条款 → 偏离我方立场的点 → 建议改法（可直接复制的替换文本）
- 红线条款（如"赔偿以运费为限"、"不可抗力包含拥堵清关"）自动标 🔴 并给出谈判话术
- 审查完可一键转为合同事项入台账，预警义务自动注册

### W3 合同全生命周期（台账 → 义务跟踪）

现有台账只盯 end_date。升级为**义务级跟踪**：

- 录入/审查合同时，agent 自动抽取**所有带时间的义务**：付款节点、对账周期、保证金退还、续约通知期、保险续保、资质年检
- 每条义务进入雷达监控，到期前推待办给 owner
- 续约决策辅助：到期前 90 天，agent 自动汇总该合同的履约情况（关联的索赔事项、异常记录）生成《续约评估摘要》

### W4 法律咨询（RAG 知识库 + 物流专精）

升级现有 LegalConsult：

- 知识库分层：① 公司文件库（合同模板、制度）② 物流法规库（《民法典》合同编运输章、《公路货运规则》、CMR/汉堡规则要点、中越货运协定、海关与检疫规则）③ 案例库（结案事项沉淀）
- 回答必须引用出处（文件名 + 条款号），无依据时明确说"建议咨询外部律师"
- 支持从咨询一键升级为事项（"这个问题帮我立案跟进"）

### W5 应收账款 / 法律函件 Agent

物流公司的第二痛点：运费拖欠。

- 输入欠款方 + 金额 + 账期，agent 检索合同付款条款 → 生成催款函（一催/二催/律师函口径递进）
- 跟踪函件节奏：发出 → 7 天未回 → 升级语气 → 30 天未回 → 提示诉讼评估
- 诉讼评估：自动汇总证据完备度（合同、对账单、签收记录）+ 时效 + 管辖法院

---

## 3. 技术架构

### 3.1 总体架构

```
┌──────────── 前端 (React) ────────────┐
│  Agent Console / Matters / Radar     │
│  SSE 流式渲染 agent 执行过程           │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  agent-proxy (新增 Node 服务)          │   ← 核心新增
│  · Agent Loop: LLM tool-calling 循环  │
│  · 工具执行器(白名单) + 审批拦截         │
│  · 运行记录 agent_runs 持久化           │
│  · SSE 推送执行步骤                    │
├──────────────────────────────────────┤
│  复用: db-proxy (数据) / ocr-proxy(识别)│
│  LLM: MiMo Token Plan（服务端统一网关） │
│       迁到服务端, 支持 function calling)│
└──────────────────────────────────────┘
```

**为什么必须有 agent-proxy**：所有 LLM 调用统一在服务端完成。Agent 需要"LLM 决定调工具 → 服务端执行 → 结果回喂 LLM → 循环直到完成"，这个循环必须在服务端：① API key 不能暴露 ② 工具执行要走权限校验 ③ 运行状态要持久化（用户关页面不中断）④ 长任务要后台跑。

### 3.2 Agent Loop 设计

```js
// agent-proxy/agent.js 伪代码
async function runAgent(matterId, userMessage, session) {
  const run = await createRun(matterId, userMessage);
  const context = await buildContext(matterId);   // 事项内合同/文件/历史
  let messages = [systemPrompt(playbook, context), ...history, userMessage];

  for (let step = 0; step < MAX_STEPS; step++) {   // MAX_STEPS = 15
    const response = await llm.chat(messages, { tools: TOOL_SCHEMAS });
    if (response.toolCalls) {
      for (const call of response.toolCalls) {
        if (NEEDS_APPROVAL.has(call.name)) {        // 写操作 → 挂起待审批
          await suspendRun(run, call);
          sse.send({ type: 'approval_required', call });
          return;                                   // 用户批准后 resumeRun
        }
        const result = await executeTool(call, session);  // 权限校验在内
        sse.send({ type: 'tool_result', call, result });
        messages.push(toolResultMessage(call, result));
      }
    } else {
      await completeRun(run, response.text);
      sse.send({ type: 'final', text: response.text });
      return;
    }
  }
}
```

### 3.3 工具清单（Agent Tools）

| 工具 | 说明 | 审批 |
|---|---|---|
| `search_contracts(query, filters)` | trgm 检索合同（标题/对方/正文） | 免 |
| `get_contract(id)` | 取合同详情 + OCR 全文 + 条款定位 | 免 |
| `search_knowledge(query, scope)` | 检索文件库/法规库/案例库 | 免 |
| `get_matter(id)` / `list_matter_items(id)` | 取事项全量上下文 | 免 |
| `extract_fields(text, schema)` | 结构化抽取（复用现有 contract-extract） | 免 |
| `analyze_liability(matter_id)` | 责任分析子流程（内部多轮） | 免 |
| `check_evidence(matter_id, claim_type)` | 对照证据包标准出缺失清单 | 免 |
| `compute_deadline(type, base_date)` | 时效/期限计算（规则表，非 LLM 算） | 免 |
| `draft_document(template_key, facts)` | 起草函件/确认书（模板 + 事实填充） | 免（草稿） |
| `create_matter(type, payload)` | 立案 | ✅ |
| `create_task(matter_id, assignee, due)` | 派待办 | ✅ |
| `update_matter_status(id, status)` | 状态流转 | ✅ |
| `finalize_document(draft_id)` | 文书定稿（之后才可下载/发出） | ✅ |
| `register_obligation(contract_id, items)` | 注册义务到雷达 | ✅ |

> 时效等期限计算用**规则表**而不是让 LLM 算：`deadline_rules` 表存「国内公路货损索赔 → 自交付/应交付之日起 1 年」等规则，工具查表计算，LLM 只负责判断适用哪条规则并引用。

### 3.4 雷达（主动监控）

不依赖用户打开页面。`agent-proxy` 内置每日定时扫描（node-cron，或 Supabase pg_cron + Edge Function）：

```
每日 08:00 扫描:
  contracts_expiring 视图        → 合同到期/续约通知期
  obligations WHERE due <= 30d  → 履约义务
  matters WHERE 时效剩 ≤90/30d   → 索赔时效告警
  documents WHERE 发出未回复 >5d  → 函件跟进
产出 → tasks 表（待办）→ 前端铃铛 + Dashboard 雷达卡片
     → (Phase 3) 企业微信/邮件推送
```

### 3.5 数据模型（新增迁移 00007）

```sql
-- 事项：agent 工作的组织单元
CREATE TABLE matters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('claim','contract_review','collection','consult','dispute','other')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  counterparty TEXT,
  amount NUMERIC(14,2),                -- 争议/索赔/欠款金额
  statute_deadline DATE,               -- 时效截止日（雷达监控）
  owner_staff_id BIGINT REFERENCES service_staff(id),
  summary TEXT,                        -- agent 维护的事项摘要（每轮更新）
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 事项关联（合同/文件/函件/证据 全部挂到事项下）
CREATE TABLE matter_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('contract','legal_document','file','draft')),
  target_id BIGINT NOT NULL,
  relation TEXT,                       -- 'evidence' / 'basis_contract' / 'outgoing_letter' ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- agent 运行记录（执行过程可回放、可审计）
CREATE TABLE agent_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT REFERENCES matters(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','suspended','completed','failed','cancelled')),
  user_message TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',   -- [{tool, args, result_digest, ts}]
  pending_approval JSONB,              -- 挂起待批的工具调用
  final_text TEXT,
  model TEXT, token_usage JSONB,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 文书草稿与定稿
CREATE TABLE legal_drafts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  doc_kind TEXT NOT NULL,              -- 'claim_letter' / 'demand_letter' / 'confirmation' ...
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','void')),
  approved_by BIGINT REFERENCES service_staff(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 履约义务（雷达数据源）
CREATE TABLE obligations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id BIGINT REFERENCES contracts(id) ON DELETE CASCADE,
  matter_id BIGINT REFERENCES matters(id),
  description TEXT NOT NULL,
  due_date DATE NOT NULL,
  recurrence TEXT,                     -- null / 'monthly' / 'yearly'
  owner_staff_id BIGINT REFERENCES service_staff(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','overdue','waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 待办（雷达产出 + agent 派发）
CREATE TABLE tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT REFERENCES matters(id),
  title TEXT NOT NULL,
  detail TEXT,
  assignee_staff_id BIGINT REFERENCES service_staff(id),
  due_date DATE,
  source TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent','radar','manual')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Playbook 规则（合同审查立场库）
CREATE TABLE playbook_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_category TEXT NOT NULL,     -- 复用 contracts.category 枚举
  clause_topic TEXT NOT NULL,          -- 'liability' / 'force_majeure' / 'evidence' ...
  ideal_position TEXT NOT NULL,        -- 理想立场
  fallback_position TEXT,              -- 可接受底线
  red_line TEXT,                       -- 红线（出现即🔴）
  suggested_language TEXT,             -- 建议条款文本
  negotiation_tip TEXT,                -- 谈判话术
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 期限规则表（时效计算，不靠 LLM）
CREATE TABLE deadline_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,       -- 'domestic_cargo_claim' / 'intl_road_claim' ...
  description TEXT NOT NULL,
  base_event TEXT NOT NULL,            -- '货物交付之日' ...
  duration_days INT NOT NULL,
  legal_basis TEXT NOT NULL            -- 法条引用
);
```

（均沿用 00005 锁定策略：开 RLS + REVOKE，仅 db-proxy service_role 访问；db-proxy `ALLOWED_TABLES` 追加上述表。）

### 3.6 LLM 与上下文策略

- **模型**：合同抽取、风险扫描和 Agent 主循环统一使用 MiMo Token Plan；浏览器不持有模型密钥。
- **上下文组装**（每次 run 开始时 `buildContext`）：事项摘要（agent 维护的 summary，控制在 1k 字内）+ 关联合同的关键条款（不塞全文，用检索按需取）+ 最近 10 轮对话。全文检索按需通过 `search_*` 工具拉取，避免上下文爆炸
- **摘要维护**：每次 run 结束，agent 用一次轻量调用更新 `matters.summary`（事实、进展、待决事项），这是"事项记忆"的实现
- **数据外发管控**：沿用 v1.0 风险条目，新增 `contracts.confidential` 标记，标记后该合同全文不送 LLM，agent 提示用户人工处理

---

## 4. 前端结构

```
src/pages/
  AgentConsolePage.tsx        # 主工作台（三栏：事项列表/对话执行流/上下文面板）
  MattersPage.tsx             # 事项列表（按类型/状态/优先级/时效筛选）
  MatterDetailPage.tsx        # 事项详情（时间线 + 关联 + 草稿 + 待办）
  RadarPage.tsx               # 雷达（义务/时效/到期/跟进 四类告警）
  ContractsPage.tsx           # 保留，简化为合同库视图
  LegalLibraryPage.tsx        # 保留，知识库管理
src/components/agent/
  RunStream.tsx               # SSE 执行流渲染（工具调用步骤卡片）
  ApprovalCard.tsx            # 审批拦截卡（批准/拒绝/修改后批准）
  DraftEditor.tsx             # 文书草稿编辑器（agent 起草 + 人工修改 + 定稿）
  EvidenceChecklist.tsx       # 证据包清单（已有/缺失/派任务）
  DeadlineBadge.tsx           # 时效倒计时徽标
  PlaybookDiff.tsx            # 三栏审查对照（对方条款/偏离/建议改法）
```

Dashboard 改造：合同到期卡片 → **法务雷达卡片**（四类告警计数 + 最紧急 5 条）。

---

## 5. Playbook 初始内容（运输/分包合同）

从现有 4 个模板（`ContractTemplates.tsx`）提炼公司立场，作为 `playbook_rules` 种子数据：

| 条款主题 | 理想立场 | 红线 |
|---|---|---|
| 赔偿范围 | 分包商赔偿不以运费为限，覆盖货值+客户索赔+重运+仓储+律师费 | "赔偿以运费 X 倍为限" |
| 分包 | 禁止再分包；经同意分包的承担连带责任 | 允许自由分包 |
| 不可抗力 | 限缩定义；拥堵/清关延迟/调度异常/油价不构成不可抗力 | 宽泛不可抗力（含拥堵清关） |
| 证据义务 | 事故 24h 内书面通知+照片视频；逾期举证不利由对方承担 | 无证据条款 |
| 签收效力 | 签收不当然免责；隐蔽货损可在约定期限内异议 | "签收即视为无异议" |
| 索赔程序 | 先行赔付后追偿；5 个工作日内支付 | 追偿需以诉讼判决为前提 |
| 管辖 | 我方所在地法院 | 对方所在地/不利仲裁机构 |
| 付款 | 月结对账+发票开具时限+逾期违约金 | 背靠背付款（客户付了才付） |

Playbook 由 admin 在界面维护（Phase 2 做管理页，Phase 1 先 SQL 种子）。

---

## 6. 权限与安全

| 操作 | staff | admin |
|---|---|---|
| 创建事项 / 与 agent 对话 / 查看 | ✅ | ✅ |
| 批准 agent 写操作（任务/状态/义务） | ✅（本人事项） | ✅ |
| 文书定稿、对外发出确认 | ❌ | ✅ |
| Playbook / 期限规则维护 | ❌ | ✅ |
| 删除事项、查看全部 agent_runs 审计 | ❌ | ✅ |

安全要点：
1. agent-proxy 的工具执行复用 db-proxy 的 session 校验，工具白名单 + 参数 schema 校验，LLM 输出永不直接拼 SQL
2. `agent_runs.steps` 全程留痕，满足"AI 结论可审计"
3. 免责声明：所有 AI 法律分析标注"仅供内部参考，重大事项请咨询执业律师"

---

## 7. 实施路线图

| Phase | 内容 | 交付价值 | 预估 |
|---|---|---|---|
| **P1 Agent 骨架** | agent-proxy（loop + SSE + 5 个只读工具）+ matters/agent_runs 表 + Agent Console 三栏界面 + 现有咨询能力迁入 | 能对话、能查合同和知识库、过程可见 | 1.5-2 周 |
| **P2 索赔工作流** | W1 全流程：立案/责任分析/证据清单/文书起草/审批；legal_drafts、tasks 表；deadline_rules + 时效计算 | 核心场景闭环，最大业务价值 | 2 周 |
| **P3 雷达 + Playbook** | 每日扫描 + 待办推送 + Dashboard 雷达卡；playbook_rules + W2 三栏审查；obligations 义务抽取注册 | 由被动转主动；审查有公司立场 | 1.5 周 |
| **P4 催收 + 沉淀** | W5 催收工作流；结案案例入知识库；企业微信/邮件推送；司机端异常上报对接 | 全场景覆盖 | 1.5 周 |

总计约 6-7 周。v1.0 已有的台账/文件库/OCR/抽取全部复用，不浪费。

---

## 8. 风险与决策点

1. **模型 function calling 稳定性**：MiMo Token Plan 已完成工具调用、多轮回喂和流式输出冒烟，仍需持续监控上游稳定性。
2. **责任分析的法律准确性**：agent 的责任认定只是"内部参考意见"，UI 上强制展示依据条款原文，重大金额（建议 ≥5 万）强制提示外部律师复核
3. **越南/东南亚法律**：知识库初期只覆盖中国法 + 国际公约要点；越南段法律问题 agent 应明确说"超出知识范围"而不是编造
4. **时效规则的维护责任**：deadline_rules 是硬规则，错了会误导，需法务负责人审核种子数据并对修改留痕
5. **范围控制**：P1 不要做文书在线编辑器的协同/版本功能，用最简 textarea + 定稿快照即可

---

## 附：对标参考

- Harvey：Workflow Agents、Vault 多文档尽调、事项记忆 — 形态参考
- Spellbook Associate：一句指令执行多文档工作流 — 交互参考
- GC AI：Projects（事项记忆）+ Playbooks（审查标准）— in-house 法务最佳实践
- FreightClaims / iNymbus / Datamatics：货损索赔自动化（OCR 证据包 + 邮件分流 + 120 天→当周）— W1 工作流参考
- Voyager Portal：滞期费管理分级处理（25% 案件可自动通过）— 分级审批思路参考
