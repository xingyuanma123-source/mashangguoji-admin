# 报账 · 备用金 · 工资模块 — 执行规格（codex 用）

> 2026-09-06 暂停说明：用户决定先做调度，报账、备用金、工资与权限需求暂存，不据此启动实施或导入。本文原有内容保留；下方历史“需求闭环、待执行”状态不代表当前授权。最新对话确认及未决问题见 [报账工资需求暂存-2026-09-06.md](报账工资需求暂存-2026-09-06.md)，恢复时需对照确认差异。

状态：需求已与业务主讨论闭环，待 codex 执行。
日期：2026-06-30
分支建议：从 `main` 切新分支 `feature/payroll-management`（不要混进 `feature/dispatch-management`）。

---

## 0. 背景与范围

### 0.1 一句话
本模块把三条已存在/将新建的数据链打通，最终产出**工资单**：

```
报账明细(expense_records) ──支出合计──┐
                                      ├─► 备用余额 = 充值 − 支出 ──► 工资单"备用金"三列 ──► 多退少补
充值流水(advance_fund_records) ─充值─┘                                  (月底快照冻结)

司机提成明细(财务填) ──加权池子平均──► 工资单"个人提成"列
跟单趟数(本期=文员手填) ──阶梯累加──► 跟单提成 ──► 调度/财务/会计分成
```

### 0.2 复用 vs 新建
- **复用现有表**：`expense_records`（报账明细）、`advance_fund_records`（备用金充值）、`drivers`、`service_staff`。（跟单趟数本期文员手填，**不依赖** `dispatch_records`。）
- **新建**：工资单表、司机提成输入表、跟单分成结算、若干聚合视图、`drivers.monthly_advance_default` 列。
- **本 spec 不含**：
  - 「北投开票表」——下一阶段，单独 spec（见 §7 占位）。
  - 三类角色权限（经理/调度/财务会计）——独立子任务（见 §6），不要和工资搅在一个 PR。

### 0.3 数据访问铁律（沿用派遣模块结论）
所有前端读写继续走 `@/lib/supabase`（db-proxy + cookie session），**不要新增直连 Supabase**。参见 `docs/dispatch-status-and-plan.md` 第 1 节。

---

## 1. 数据模型

### 1.1 复用现有表（确认列已够用）
- `expense_records`：报账明细，列已覆盖（过磅/提柜/.../高速/盖章/`note_amount`/`note_detail`/`fee_location_detail`/`total_expense`/`commission`/`status`）。**不动结构**。
- `advance_fund_records`：`driver_id, amount, fund_date, month, note`。备用金充值流水。**不动结构**。
- （跟单趟数本期由文员手填，不接 `dispatch_records`；待派遣模块稳定二期再考虑。）

### 1.2 新增列
```sql
-- 司机月初标准充值额（默认 1000，陆师傅设 2000，避免写死人名）
ALTER TABLE public.drivers
  ADD COLUMN monthly_advance_default numeric(10,2) NOT NULL DEFAULT 1000;
-- 数据初始化：陆贻祥 = 2000
```

### 1.3 新建表

#### (a) `salary_records` 工资单（司机 + 办公室统一）
```sql
CREATE TABLE public.salary_records (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period          text   NOT NULL,                 -- 'YYYY-MM'
  person_type     text   NOT NULL,                 -- 'driver' | 'office' | 'parttime'（见 §2.9 身份分类）
  person_id       bigint NOT NULL,                 -- driver_id 或 service_staff_id
  person_name     text   NOT NULL,                 -- 快照，防员工改名
  payee_name      text,                            -- 代收人（如"严娟代收仇兆春工资"；为空=本人领）
  job_title       text,                            -- 职务快照（司机/文员/出纳/调度/财务/会计/经理/兼职…）
  is_fixed_salary boolean NOT NULL DEFAULT false,  -- 仅用于经理(office)：只发底薪，不算满勤/提成/加班/考勤扣款（社保个税照常）。兼职(parttime)不用此标记，走 §2.9 兼职分支

  base_salary       numeric(10,2) NOT NULL DEFAULT 0,  -- 底薪 / 固定工资
  personal_commission numeric(10,2) NOT NULL DEFAULT 0, -- 个人提成（司机=加权实发提成；跟单参与者(调度/财务/会计)=跟单分成；其他办公室=手填；固定工资/兼职=0）
  attendance_bonus  numeric(10,2) NOT NULL DEFAULT 0,  -- 满勤奖（已含少休补偿，由§2.5算出或手填；固定工资/兼职=0）
  overtime          numeric(10,2) NOT NULL DEFAULT 0,  -- 加班费（司机：加班天数×30，由§2.10自动算）

  -- 办公室专用补贴（司机为 0）
  post_allowance      numeric(10,2) NOT NULL DEFAULT 0, -- 岗位津贴
  phone_allowance     numeric(10,2) NOT NULL DEFAULT 0, -- 话补
  transport_allowance numeric(10,2) NOT NULL DEFAULT 0, -- 交通补贴

  -- 考勤输入（财务每月填，驱动 §2.5 满勤 / §2.6 扣底薪 自动计算）
  month_days       integer       NOT NULL DEFAULT 30,  -- 🔴 扣底薪分母=该月真实天数(1月31/2月28或29/4月30…)。草稿生成必须按 period 实算填入，DEFAULT 30 仅占位、严禁直接用
  leave_days       numeric(4,1)  NOT NULL DEFAULT 0,   -- 请假天数（可 0.5）
  rest_days        numeric(4,1)  NOT NULL DEFAULT 0,   -- 客服当月实际休息天数（司机不用）
  has_statutory_holiday boolean  NOT NULL DEFAULT false,-- 当月是否有法定节假日（休假额度+1，封顶+1）
  used_substitute  boolean       NOT NULL DEFAULT false,-- 司机请假是否请代驾（影响 1 天请假是否扣底薪）

  -- 备用金三列（司机专用；月底结算时从视图快照写入，发后冻结）
  advance_issued   numeric(10,2) NOT NULL DEFAULT 0,    -- 备用金发放（当月充值合计）
  advance_spent    numeric(10,2) NOT NULL DEFAULT 0,    -- 备用金支出（当月已确认报账合计）
  advance_balance  numeric(10,2) GENERATED ALWAYS AS (advance_issued - advance_spent) STORED, -- 备用余额

  -- 扣款拆两源，便于审计（codex 建议）
  base_salary_deduction numeric(10,2) NOT NULL DEFAULT 0, -- 扣底薪（§2.6 自动算）
  manual_deduction      numeric(10,2) NOT NULL DEFAULT 0, -- 手填其他扣款（事故赔偿/手续费等）
  adjustment       numeric(10,2) NOT NULL DEFAULT 0,    -- 本月对往月的补/扣净额（见 §2.8，明细在 salary_adjustments）

  -- 应发工资：内联展开（Postgres 生成列不能引用其它生成列）
  gross_salary numeric(10,2) GENERATED ALWAYS AS (
     base_salary + personal_commission + attendance_bonus + overtime
   + post_allowance + phone_allowance + transport_allowance
   - (advance_issued - advance_spent) - base_salary_deduction - manual_deduction + adjustment
  ) STORED,                                            -- 应发工资

  tax              numeric(10,2) NOT NULL DEFAULT 0,    -- 代扣个税
  social_insurance numeric(10,2) NOT NULL DEFAULT 0,    -- 代扣社保
  -- 实发工资：同样内联展开（不能引用 gross_salary 生成列）
  net_salary numeric(10,2) GENERATED ALWAYS AS (
     base_salary + personal_commission + attendance_bonus + overtime
   + post_allowance + phone_allowance + transport_allowance
   - (advance_issued - advance_spent) - base_salary_deduction - manual_deduction + adjustment
   - tax - social_insurance
  ) STORED,                                            -- 实发工资

  note    text,
  status  text NOT NULL DEFAULT 'draft',               -- 'draft' | 'finalized'
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, person_type, person_id),
  CONSTRAINT salary_person_type_chk CHECK (person_type IN ('driver','office','parttime')),
  CONSTRAINT salary_status_chk      CHECK (status IN ('draft','finalized')),
  CONSTRAINT salary_period_chk      CHECK (period ~ '^\d{4}-\d{2}$'),
  CONSTRAINT salary_month_days_chk  CHECK (month_days BETWEEN 28 AND 31),
  CONSTRAINT salary_attend_chk      CHECK (leave_days >= 0 AND rest_days >= 0)
);
```
> `attendance_bonus`：草稿生成时由 §2.5 自动算入，财务可手动覆盖。若需审计自动值 vs 覆盖值差异，可加 `attendance_bonus_auto` 留底（建议项，非阻塞）。
> 备注：`gross_salary` 公式已用 5 月工资表反推验证（陆贻祥：底薪6500+提成3369.18+满勤300+加班90 −备用余额(−507.6) −扣款750 = 10016.78 ✓）。codex 复算办公室行马鑫鑫亦匹配（4520 → 实发 4084.98）。

#### (b) `driver_commission_inputs` 司机提成输入（财务每月填）
```sql
CREATE TABLE public.driver_commission_inputs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period        text   NOT NULL,            -- 'YYYY-MM'
  driver_id     bigint NOT NULL REFERENCES public.drivers(id),
  raw_commission   numeric(10,2) NOT NULL DEFAULT 0, -- 个人提成（按出车目的地越南/爱店加成，财务填）
  transport_fee    numeric(10,2) NOT NULL DEFAULT 0, -- 交通费
  attendance_days  numeric(5,1)  NOT NULL DEFAULT 0, -- 出勤天数（可 0.5）
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, driver_id)
);
```
结算时由 §2.3 公式算出每人「实发提成」→ 写入 `salary_records.personal_commission`。

#### (c) `commission_pool_settlements` 跟单提成结算（调度，月度）
```sql
CREATE TABLE public.commission_pool_settlements (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period        text   NOT NULL UNIQUE,     -- 'YYYY-MM'
  trip_count    integer NOT NULL,           -- 当月跟单趟数（本期=文员手填，不接 dispatch_records；前端文本输入入库前转整数）
  pool_total    numeric(10,2) NOT NULL,     -- 阶梯累加算出的总额（见 §2.4）
  divisor       integer NOT NULL,           -- 除数 = 当月参与的"调度"人数
  per_share     numeric(10,2) NOT NULL,     -- pool_total / divisor
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pool_trip_count_chk CHECK (trip_count >= 0),
  CONSTRAINT pool_divisor_chk    CHECK (divisor > 0)
);

CREATE TABLE public.commission_pool_participants (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settlement_id bigint NOT NULL REFERENCES public.commission_pool_settlements(id) ON DELETE CASCADE,
  staff_id      bigint NOT NULL REFERENCES public.service_staff(id),
  staff_name    text   NOT NULL,            -- 快照
  is_divisor    boolean NOT NULL,           -- true=调度(进除数)，false=财务/会计(只领份)
  share_amount  numeric(10,2) NOT NULL,     -- 实发 = per_share
  UNIQUE (settlement_id, staff_id)
);
```
> 参与者**按月手动勾选**（业务主明确：某月某调度去干别的就不勾，不进除数）。`is_divisor=true` 的计入 `divisor`；财务/会计 `is_divisor=false` 只领 `per_share`。

#### (d) `salary_adjustments` 补发/少发留痕（见 §2.8）
```sql
CREATE TABLE public.salary_adjustments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  apply_period  text   NOT NULL,            -- 在哪个月工资里补/扣 'YYYY-MM'
  target_period text   NOT NULL,            -- 针对哪个月的错误 'YYYY-MM'
  person_type   text   NOT NULL,
  person_id     bigint NOT NULL,
  amount        numeric(10,2) NOT NULL,     -- +补发 / −补扣
  reason        text   NOT NULL,
  created_by    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
`salary_records.adjustment` = 同 (apply_period, person) 下 `salary_adjustments.amount` 之和。

### 1.4 聚合视图

#### (a) `driver_advance_balance` 备用金实时余额
```sql
CREATE VIEW public.driver_advance_balance
WITH (security_invoker = true) AS
WITH months AS (
  SELECT DISTINCT month AS period
  FROM public.advance_fund_records
  WHERE month ~ '^\d{4}-\d{2}$'
  UNION
  SELECT DISTINCT to_char(record_date, 'YYYY-MM') AS period
  FROM public.expense_records
),
funds AS (
  SELECT driver_id, month AS period, sum(amount)::numeric(10,2) AS issued
  FROM public.advance_fund_records
  GROUP BY driver_id, month
),
expenses AS (
  SELECT driver_id, to_char(record_date, 'YYYY-MM') AS period,
         sum(total_expense)::numeric(10,2) AS spent
  FROM public.expense_records
  WHERE status = 'confirmed'
  GROUP BY driver_id, to_char(record_date, 'YYYY-MM')
)
SELECT d.id AS driver_id, d.name AS driver_name, m.period,
       COALESCE(f.issued, 0)::numeric(10,2) AS advance_issued,
       COALESCE(e.spent, 0)::numeric(10,2)  AS advance_spent,
       (COALESCE(f.issued, 0) - COALESCE(e.spent, 0))::numeric(10,2) AS balance
FROM public.drivers d
CROSS JOIN months m
LEFT JOIN funds f    ON f.driver_id = d.id AND f.period = m.period
LEFT JOIN expenses e ON e.driver_id = d.id AND e.period = m.period;
```
用途：备用金页面实时余额、`<200` 预警、月底结算快照来源。
> ⚠️ 该视图只会出现「已有交易的月份」。若工资页要对一个**全新月份**先展示所有司机（无任何交易），需在页面侧按选中月份补齐空行（前端 left-join 司机列表），不必为此建 `salary_periods` 表。

#### (b) 备注明细自动生成（见 §2.1）——**仅前端渲染，不做第二个视图**（codex 建议：避免重复生成逻辑）。

### 1.5 访问权限落地（🔴 codex 抓到的阻塞项）
新表/视图必须补 Supabase 权限，**对齐现有 `20260623100443_dispatch_management.sql` 的写法**（该 migration 已有 RLS + `GRANT ... TO authenticated/service_role` + sequence grant）。本模块按当前 db-proxy / service_role 路线，至少要：
- 4 张新表 + sequence（IDENTITY 隐式 sequence）`GRANT` 给 `service_role`（与现有模块一致）。
- 视图 `driver_advance_balance` 已用 `security_invoker = true`，授权对象与底表一致即可，不要授权给比底表更宽的角色。
- 若任何表要暴露给 `authenticated`，必须同时写 RLS policy；否则保持仅 service_role（前端经 db-proxy 访问）。
> 具体 GRANT/RLS 语句由 codex 比照 dispatch migration 生成，确保与仓库现状一致。

---

## 2. 业务规则与公式

### 2.1 备注明细自动生成（rule①）—— 小程序已实现，财务侧复用
**关键：生成逻辑已存在于小程序录入端**（`miniapp/src/pages/submit/index.tsx:314-364`），后端/财务侧**不要重造**，对齐复用即可。现有产出：
- **有对应费用列**（打车/高速/过磅… 有独立列的）→ 金额进对应费用列；若填了地点备注 → 拼进 `fee_location_detail`，格式 `项目名(地点):金额`，多条用 `; ` 连接（例 `打车(北投-友谊关):30`）。
- **无对应费用列**（杂项 other）→ `note_amount` = 金额合计，`note_detail` = `项目名:金额`（多条 `; ` 连接）。

**两个地点字段**（业务主明确：小程序一条报账有两个地点，均选填）：
- `route`（大车路线，选填，例 `316—越南—北投`）。
- `fee_location_detail`（每条费用的地点，选填，格式见上）。

**财务侧只做两件事**：① 工资/报账页**渲染** `route` + `fee_location_detail` + `note_detail`；② 导入脚本（§4）**复刻**同一拼接格式。无需新建生成函数或视图列。

### 2.2 备用金
- **余额**：`充值合计 − 已确认报账支出合计`（见视图 2.4a）。
- **<200 预警**：备用金页/仪表盘标红提示。阈值先写常量 `ADVANCE_WARN_THRESHOLD = 200`。
- **月初一键充值**（手动按钮）：对所有在职司机各插一条 `advance_fund_records`，金额取 `drivers.monthly_advance_default`（默认 1000，陆师傅 2000）。fund_date=当天，month=当月，note='月初充值'。
  **幂等（数据库级，codex 建议）**：建 partial unique index 防双击/并发重复：
  ```sql
  CREATE UNIQUE INDEX advance_monthly_topup_uniq
    ON public.advance_fund_records (driver_id, month)
    WHERE note = '月初充值';
  ```
  🔴 **实现硬约束（codex 新问题3）**：月初一键充值**必须**走 SQL/RPC 的 `ON CONFLICT (driver_id, month) WHERE note='月初充值' DO NOTHING`，或显式捕获唯一冲突后视为"已充值、跳过"。**不要**沿用现有前端 `createAdvanceFundRecord()` 的普通 `.insert()`——它不带 ON CONFLICT，并发/双击仍会撞唯一索引报错而非静默跳过。临时补录用别的 note，不受此约束。
- **临时补录**：财务发现某人 <200 且公司有钱时，手动加一条充值（沿用现有 `createAdvanceFundRecord`）。
- **月底结算 + 清零结转**（手动按钮）：把视图算出的当月 `advance_issued/spent/balance` **快照写入** `salary_records` 对应三列，写入后状态置 `finalized` 即冻结；下月余额自然从 0 重新累计（清零=按月隔离，已天然成立）。

### 2.3 司机个人提成（加权池子平均）
输入（`driver_commission_inputs`，财务填）：`raw_commission, transport_fee, attendance_days`。
```
实提成_i  = raw_commission_i − transport_fee_i
出工单价   = Σ实提成_i ÷ Σattendance_days_i      （全员池子，每出勤日单价）
提成数_i  = 出工单价 × attendance_days_i
实发提成_i = 提成数_i + transport_fee_i          → 写入 salary_records.personal_commission
```
> 已用 5 月数据验证：陆贻祥实发提成 3369.18 = 工资表个人提成 3369.18 ✓。
> 边界：Σattendance_days = 0 时出工单价取 0（防除零）。
> 🔴 **舍入（codex 数据复算抓到）**：出工单价是无限小数（如 106.1027190332），逐人乘出勤后必须 **round 到 2 位小数**再写库，否则会出现 0.01 级对账噪声（codex 复算李鉴钊/莫继凡/严星星各差 0.01，即此原因）。统一在"实发提成"最终值 round(2)。
> ⚠️ **命名（codex 抓到）**：`personal_commission` 存的是**池子分摊后的"实发提成"**，不是原始 `raw_commission`。UI/列名要让财务清楚这点，别误填成原始个人提成。
> 说明：输入 `transport_fee`/`attendance_days` 来自 `司机提成平均明细.xlsx`（列：个人提成/出勤/交通费/实提成/出工单价/提成数/实发提成）。codex 已用该文件逐人复算 11 人实发提成与工资表对账（8 人完全相等，3 人差 0.01=舍入）。

### 2.4 跟单提成（调度，阶梯累加）
> 🔴 **业务定（2026-06-30）：本期趟数不自动统计**。因涉及代驾等只有调度清楚的口径，`trip_count` **暂为文员手填的文本/数字输入**，不接 `dispatch_records`。待派遣模块稳定后二期再考虑自动取数。`commission_pool_settlements.trip_count` 按手填值走。

**趟数**（本期=文员手填）。**阶梯累加**（非一口价）：

| 趟数区间 | 单价(元/车) |
|---|---|
| 0–250 | 0 |
| 250–300 | 10 |
| 300–450 | 20 |
| 450 以上 | 40 |

```
pool_total = 0
+ clamp(趟数,250,300) 段内趟数 × 10
+ clamp(趟数,300,450) 段内趟数 × 20
+ max(趟数−450,0)     × 40
```
示例：400 趟 → 50×10 + 100×20 = 2500。
- `per_share = pool_total ÷ 当月调度人数(divisor)`（divisor=0 时报错/拦截，不结算）
- 领取人 = 当月手动勾选的参与者：调度（is_divisor=true，进除数）+ 财务 + 会计（is_divisor=false，只领份），每人得 `per_share` → 写入各自 `salary_records.personal_commission`。
> 已确认：**财务/会计无固定底提成**，其 `personal_commission` = 跟单分成那一份（per_share），不另加。其余办公室人员（文员/统计/出纳等）的 `personal_commission` 由财务手填。

### 2.5 满勤奖
基数 **300**。

**办公室**（业务主明确：调度=客服=文员=出纳=统计，**同一类不同叫法**，统一这套规则；`person_type='office'` 且 `is_fixed_salary=false`）。有 4 天法定休假额度；当月有法定节假日则 +1，封顶 +1，中秋国庆同月也只 +1：
| 当月实际休息 | 满勤奖 | 少休补偿 |
|---|---|---|
| 正好休满额度 | 300 | 0 |
| 少休（少休 1/2/3/4 天）| 300 | +100 / +200 / +400 / +800（**查表取值**：少休 N 天直接取该档，非累加。少休 4 天 = 800，不是 1500）|
| 超额休 = 请假（半天/1天/≥2天）| 见下扣减 | 0 |

> **少休小数天（codex 新问题2）**：少休补偿按**整数天向下取整**查表——`少休天数 = floor(额度 − rest_days)`，小数部分不补（少休 0.5 天→0；少休 1.5 天→按 1 天=100）。理由：少休补偿是"整天没休"的补偿。此口径业务已确认（§9-9："最好休完"，少休按整数）。请假侧（rest_days > 额度）的小数天仍按比例扣，不受此影响。

请假扣满勤（含半天，客服为主，司机理论也可）：半天 −75、1 天 −150、≥2 天 → 0。
少休补偿并入 `attendance_bonus` 一并体现。
> **输入权责（消除 leave_days/rest_days 冲突）**：
> - **客服/办公室**：财务只填 `rest_days` + `has_statutory_holiday`。额度 = 4 + (有法定节假?1:0)。`rest_days < 额度` → 少休补偿；`rest_days > 额度` → 超出部分系统**派生**写入 `leave_days`（只读，不手填）走请假扣减。
> - **司机**：无休假额度，财务直接填 `leave_days`，`rest_days` 不用。
> - 系统据此算出 `attendance_bonus` 填入草稿，财务可覆盖。
> 即：客服侧 `rest_days` 为准、`leave_days` 派生；司机侧 `leave_days` 为准。两者不会同时手填。

**司机**（**无**休假额度、**无**少休补偿、**无半天**——业务主明确司机不休半天）：
- 不请假 → 满勤 300
- 请假 1 天 → 满勤 150
- 请假 ≥2 天 → 满勤 0

### 2.6 扣底薪
统一日单价 = `底薪 ÷ month_days`。
🔴 **`month_days` = 该工资月的真实天数，按日期算，绝不写死 30**：1/3/5/7/8/10/12 月=31，4/6/9/11 月=30，2 月=28 或 29。业务主明确"要按日期来"，且 5 月工资表备注自证用的是 **6500÷31**（5 月 31 天）。草稿生成时由 `period` 算出真实天数填 `month_days`，**不扣休假天数**（分母是整月天数，不是"整月−休假"）。
算出的"扣底薪"写入 `base_salary_deduction`；事故赔偿/手续费等写入 `manual_deduction`，两者在 gross 公式里都减掉。
- **客服/办公室**：扣底薪 = 日单价 × `leave_days`（请假天数 = 超出休假额度的部分，可 0.5）。
- **司机**（无半天）：
  - 请假 1 天（`leave_days=1`）→ **`used_substitute=true` 才扣 1 整天底薪**，false 不扣。
  - 请假 ≥2 天 → 每天都扣（日单价 × `leave_days`）。**已确认：从第一天起每天都扣，不再看代驾。**
  - 半天扣底薪仅适用**客服/办公室**（见上），司机不涉及。
- `used_substitute` 本期**由财务手填**（代驾与否财务清楚）；待派遣模块稳定后可用 `dispatch_records.is_substitute_driver` 辅助，但本模块不硬依赖它。

### 2.7 应发 / 实发
见 §1.3(a) 的 `gross_salary` / `net_salary` 生成列公式。
> 蓝惠轮（业务主已澄清）：她是**经理级、固定工资 10000**（`person_type='office'`, `is_fixed_salary=true`），**社保照常从工资扣**，走标准 `net = 应发 − 个税 − 社保`，**不是特例**，之前"社保公司承担"的猜测作废。固定工资人只发底薪、不算满勤/提成/加班/考勤扣款（见 §2.9）。

### 2.8 补发/少发（不改历史快照，下月调整 + 留痕）
工资发出即冻结。事后发现往月错了 → 在**本月**建一条 `salary_adjustments`（amount ±、target_period、reason），其和进本月 `salary_records.adjustment`。
示例：7 月发现 5 月备用金多发 10 → 在 apply_period=2026-07、target_period=2026-05、amount=−10、reason='5月备用金多发补扣'。
> codex 数据印证：5 月工资表备注大量"请假 X 天未扣款，在 6 月份工资扣 6500/31×N=…"——这正是本机制的真实用例（apply_period=次月、target_period=本月）。导入历史工资时，这类递延备注应转成 `salary_adjustments` 记录。
> **历史导入注意**：5 月工资表只有单一「扣款」列，无法拆 `base_salary_deduction`/`manual_deduction`；历史导入整体进 `manual_deduction` 即可（新数据才按 §2.6 自动拆）。电话/身份证**不进** `salary_records`（引用 `drivers`/`service_staff`；`service_staff` 缺 id_card，银行发放表需要时二期补）。

### 2.9 身份分类（业务主 2026-06-30 定）
`person_type` + `is_fixed_salary` 决定走哪套工资规则：

| 身份 | person_type | is_fixed_salary | 规则 |
|---|---|---|---|
| 司机 | driver | false | §2.3 提成 + §2.5/2.6 司机考勤 + §2.10 加班 + 备用金三列 |
| 办公室（调度=客服=文员=出纳=统计，同一类不同叫法）| office | false | §2.4 跟单分成（仅参与者）+ §2.5/2.6 办公室考勤 + 岗位/话补/交通津贴 |
| 经理（如蓝惠轮，固定工资 10000）| office | **true** | **只发底薪，不算满勤/提成/加班/考勤扣款**；社保、个税照常扣 |
| 兼职（廖丽春、做饭阿姨）| parttime | false（不用此标记）| **固定工资，无社保/满勤/津贴/提成**；但**允许 `manual_deduction`**（见下）。独立分支，不套用经理的"跳过一切扣款" |

**实现分支（避免一刀切）**：
- `is_fixed_salary=true` 仅经理用 → 跳过满勤/提成/加班/考勤扣款，**且无 manual_deduction**。
- `person_type='parttime'` → 走兼职分支：无社保/满勤/津贴/提成，**但保留 manual_deduction**（做饭阿姨多休扣款）。两者不可混用同一段逻辑。

**兼职细则**：
- 廖丽春：纯固定工资，无任何扣款。
- 做饭阿姨：固定工资 = **做饭 1500 + 打扫卫生 600**（记 `base_salary=2100`，拆分写 note）；**每月 2 天休假，多休 1 天扣 1 天工资**（日单价 = 2100 ÷ month_days，扣进 `manual_deduction`，财务手填）。这是兼职里唯一的考勤扣款。

> **挂靠/私账（业务主说明，明确排除）**：「挂靠司机」= 公司帮忙交社保的人，「8875 发放」= 不交社保、走私账的人；陆师傅额外 2000 算提成但**不走公账**。这些**私账/挂靠部分不纳入本工资系统**，系统只管正式在册员工工资。`挂靠司机运费`/`8875发放工资` 两个 sheet 不导入。
> 🔴 **历史不作为校验基准（codex B3/C1）**：蓝惠轮、做饭阿姨的 5 月工资行是**旧口径**——蓝惠轮 5 月实发 9902.2（等于没扣社保），做饭阿姨 5 月扣款 145（与"2100÷31×多休天数"对不上）。当前规则（蓝惠轮社保照常扣→9467.18；做饭阿姨多休按日单价扣）**与这两行历史值不一致是预期的**。校验工资公式时**只用司机段 + 普通办公室行**对平，这两行不纳入对平基准，差异若要平账走 §2.8 adjustment。

### 2.10 加班费（业务主 2026-06-30 定）
小程序司机点「加班」即记 `expense_records.is_overtime=true`。**一天加班 = 30 元**。
```
overtime_i = (当月该司机 is_overtime=true 的去重日期数) × 30
```
**可从报账数据自动算**（复用 `getDriverMonthStats` 已有的 `overtimeDates: Set`），写入 `salary_records.overtime`，财务可覆盖。
> 验证：5 月谭德光 270=9天×30、徐良斌 210=7天×30、严星星 180=6天×30，与工资表一致 ✓。仅司机有加班费。

---

## 3. 页面 / 交互

1. **报账页（复用 `ExpensesPage`）**：备注明细按 §2.1 自动展示；一天两次过磅 = 允许同司机同日多行，二次确认由财务手动逐条确认（不做特殊 schema）。
2. **备用金页（复用 `AdvanceFundsPage`）**：加 `<200` 预警标红、「月初一键充值」按钮、「月底结算」按钮。
3. **工资页（新建 `SalaryPage`）**：
   - 月份选择；**司机 / 办公室 / 兼职 三个分组表格**（按 `person_type`，列按 §1.3）。兼职组列精简（无社保/满勤/津贴/提成）。
   - 「生成草稿」：拉报账/备用金/提成输入/跟单结算，按 §2.9 身份分支算各列填草稿（经理 `is_fixed_salary` 跳过满勤/提成/加班/考勤扣；兼职走兼职规则）。
   - 财务可改手填项（请假、休息天数、扣款、个税、社保、办公室补贴；加班默认自动 §2.10 可覆盖）。
   - 「结算并发放」：快照冻结备用金三列、置 `finalized`。
   - 调整项录入入口（§2.8）。
4. **跟单结算页/弹窗**：选月份 → **文员手填趟数**（文本输入，入库转整数）→ 自动算 pool_total → 勾选参与者(标调度/财务/会计) → 生成 per_share。
5. **司机提成输入页/弹窗**：财务按月填 raw_commission/transport_fee/attendance_days，预览出工单价与实发提成。

---

## 4. 导入压测计划（staging）

数据源：`2026年6月司机备用金.xlsx`（11 个司机 sheet）。
- **每个 sheet 上半部分（明细行）** → `expense_records`。列映射：
  `日期→record_date, 车牌→plate_number, 司机→(driver_id by name), 路线→route, 过磅费→fee_weighing, 提柜费→fee_container, 过夜费→fee_overnight, 越南超时费→fee_vn_overtime, 越南收钥匙→fee_vn_key, 停车费→fee_parking, 新岗→fee_newpost, 打车→fee_taxi, 淋水→fee_water, 解篷布→fee_tarpaulin, 高速费→fee_highway, 盖章→fee_stamp, 支出费用→total_expense, 提成→commission`。
  备注列处理：Excel「备注」(col17，多为金额) → `note_amount`（数值则填，非数值进 `note_detail`）；「备注明细」(col18，已是文本串如"打车30（北投-友谊关）") → 直接原样进 `note_detail`，导入阶段**保留原文**不重新拼接（§2.1 的生成只对新录入生效）。
  🔴 **加班列（codex 抓到，原映射漏了）**：真实列里 **V 列=加班标记**（大量"加班"，如秦林勇 12 条），→ `expense_records.is_overtime=true`。W 列=日期/客户。
  日期是 Excel 序列号（如 46174=2026-06-01）需转真实日期；**合并单元格空日期行必须 forward-fill 沿用上一条日期**（codex 实测陆贻祥 74 行、吴子新 57 行空日期），不能要求每行都有日期。图片列 U(DISPIMG/`_xlfn.DISPIMG`) 是公式，跳过。
- **每个 sheet 底部充值流水**（如 `6/1备用金 1000`…）→ `advance_fund_records`（driver_id, amount, fund_date, month='2026-06'）。
  🔴 **充值识别铁律（codex 抓到）**：充值**只从底部充值流水区取**，绝不靠关键词或标题。① sheet 标题里的"备用金XXXX"**不可信**（吴子新标题 6000 实际底部 6300、谭德光 4000/4300、莫继凡 5000/5500）；② 明细行里含"备用金"字样的不是充值（如莫继凡 R42"越南钱…等于人民币390元"是支出 522）。
- ✅ **仇兆春 / 严娟（业务主已澄清）**：**严娟代收仇兆春工资**——仇兆春是真实员工（有提成、driver_id），严娟只是代领人。导入按 driver_id=仇兆春，`payee_name='严娟'`。即提成明细的"仇兆春"=工资表的领款行，不是两个人、不是花名册错。导入仍**按 driver_id 匹配不按姓名串**，遇代收关系填 `payee_name`。
- 🔴 **关键（codex 抓到）**：导入的历史报账必须写 `status='confirmed'`。`expense_records` 默认 `status='pending'`，而余额视图只汇总 confirmed；不设状态会让徐良斌算成 `5000−0=5000` 而非 `586`。
- **金额统一 round(2)**：导入与一切汇总在金额层 round 到 2 位，避免浮点/缓存舍入噪声。
- 先导入 **staging 表**（业务主确认 staging 存在），跑通校验：余额视图算出的「余」要等于 sheet 底部的「余」（如徐良斌 5000−4414=586）。codex 已离线复算 11 人余额全部对平。校验通过再考虑进正式库。
- 压测：11 人整月数据，验证视图聚合、工资草稿生成性能与数值正确性。
- 🔴 **导入 sheet 白名单（codex C4）**：脚本**只读** 6 月备用金的 11 个司机 sheet、`司机提成平均明细.xlsx`、5 月工资表的 `工资明细` sheet；**绝不扫** `挂靠司机运费`/`8875发放工资`/`WpsReserved_CellImgList` 等私账/系统 sheet。

---

## 5. 执行顺序建议（给 codex）

1. migration：新增列 + 4 张新表 + **1 个视图**（`driver_advance_balance`；备注明细仅前端渲染，不做视图）+ 月初充值幂等索引 + RLS/GRANT（§1.5）。一个新时间戳 migration 文件，**从 main 切 `feature/payroll-management`**，不改 baseline / dispatch 两个已有 migration。
2. 导入脚本 + staging 校验（§4），先把数值对平再继续。
3. 数据层 api（备用金视图读取、月初充值、月底结算快照、提成结算、跟单结算、工资草稿生成）。
4. 页面：备用金页增强 → 工资页新建 → 跟单/提成结算弹窗。
5. 纯逻辑单测：阶梯累加、加权提成、满勤/扣底薪边界、备用余额、调整项。

---

## 6. 遗留项 —— 已全部敲定（2026-06-30）
- ✅ §2.1 备注地点：用现有 `route`(大车路线，选填) + `fee_location_detail`(费用地点，选填)，生成逻辑小程序已实现，财务侧仅渲染、导入复刻。
- ✅ §2.4 财务/会计**无固定底提成**，个人提成 = 跟单分成那一份。
- ✅ §2.6 司机请假 ≥2 天**从第一天起每天都扣**，不看代驾。
- ✅ 社保/个税：本期**汇总两列手填**（个税、社保）；养老/失业/工伤/医疗分项二期再做。

→ 软性遗留项已清空，spec 可交付 codex 执行。

---

## 7. 角色权限（独立子任务，单独 PR）
现状：`service_staff.role` 仅 `admin|staff`，前端只有 `isAdmin`（`webpage/src/contexts/AuthContext.tsx`）。
目标三类：
| 角色 | 权限 |
|---|---|
| 经理 | 全部（= 现 admin）|
| 调度 | 派遣、报账录入、跟单提成 |
| 财务会计 | 报账审核、备用金充值、工资结算/发放 |
改动：扩 `role` 约束、加角色判断 hook、各页面按角色控权。**不要并入工资 PR。**

---

## 8. 北投开票表（下一阶段占位）
原始需求的第二块，尚未讨论。全仓库无任何「北投/开票/invoice」相关表或代码，从零设计。**本模块完成后单独开 spec。**

---

## 9. 业务确认记录（全部已答 2026-06-30）
原"待确认清单"已逐条答完并回填到对应章节，留档如下：

1. **蓝惠轮 / 社保** → 经理级、固定工资 10000，**社保照常扣**，走标准公式，非特例。回填 §2.7 / §2.9。
2. **办公室考勤口径** → 调度=客服=文员=出纳=统计，**同一类不同叫法**，统一 §2.5/2.6 办公室规则。回填 §2.5 / §2.9。
3. **加班费** → 小程序点加班，**一天加班 = 30 元**，按 `is_overtime` 去重日期数 ×30 **自动算**。回填 §2.10。
4. **跟单趟数** → 本期**不自动统计**，文员手填文本/数字（涉代驾口径，等派遣稳定再二期）。回填 §2.4。
5. **司机提成 raw 加成表** → 现按财务**手填** `raw_commission`，将来要自动算才需要加成表。维持手填。
6. **挂靠 / 8875 / 私账** → 挂靠=帮交社保者，8875=不交社保走私账者，陆 2000 额外提成不走公。**均不纳入本工资系统**。回填 §2.9。
7. **个税/社保系统算** → 本期手填；**二期**系统算个税（起征点/专项扣除）+ 社保分项（养老/失业/工伤/医疗，单位+个人）。
8. **司机请假 ≥2 天** → **每天都扣，请几天扣几天底薪**，不看代驾。回填 §2.6。
9. **少休小数天** → 要求"最好休完"，少休补偿按整数天查表（小数不补）。维持 §2.5 口径。
10. **仇兆春 / 严娟** → **严娟代收仇兆春工资**，同一员工 + 代收人，非两人。回填 §1.3(payee_name) / §4。
11. **特殊身份** → 经理(蓝惠轮)=固定工资office；兼职(廖丽春纯固定、做饭阿姨 1500+600 且 2 天假多休扣)。回填 §2.9。

→ 业务侧已闭环，spec 可定稿。
