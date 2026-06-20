-- 法务 Agent 核心表（设计见 docs/legal-agent-design.md §3.5）
-- 事项 / 关联 / 运行记录 / 文书草稿 / 履约义务 / 待办 / Playbook / 期限规则

-- 事项：agent 工作的组织单元
CREATE TABLE IF NOT EXISTS matters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('claim','contract_review','collection','consult','dispute','other')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','awaiting','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  counterparty TEXT,
  amount NUMERIC(14,2),
  statute_deadline DATE,
  owner_staff_id BIGINT REFERENCES service_staff(id),
  summary TEXT,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matters_status ON matters (status, statute_deadline);

-- 事项关联：合同/文件/草稿挂到事项下
CREATE TABLE IF NOT EXISTS matter_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('contract','legal_document','file','draft')),
  target_id BIGINT NOT NULL,
  relation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (matter_id, target_type, target_id)
);

-- agent 运行记录（执行过程可回放、可审计；写入仅 agent-proxy service_role）
CREATE TABLE IF NOT EXISTS agent_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT REFERENCES matters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','suspended','completed','failed','cancelled')),
  user_message TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  messages JSONB NOT NULL DEFAULT '[]',
  pending_approval JSONB,
  final_text TEXT,
  model TEXT,
  token_usage JSONB,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_matter ON agent_runs (matter_id, created_at DESC);

-- 文书草稿与定稿
CREATE TABLE IF NOT EXISTS legal_drafts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  doc_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','void')),
  approved_by BIGINT REFERENCES service_staff(id),
  sent_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES service_staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 履约义务（雷达数据源）
CREATE TABLE IF NOT EXISTS obligations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id BIGINT REFERENCES contracts(id) ON DELETE CASCADE,
  matter_id BIGINT REFERENCES matters(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_date DATE NOT NULL,
  recurrence TEXT CHECK (recurrence IN ('monthly','yearly')),
  owner_staff_id BIGINT REFERENCES service_staff(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','overdue','waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_obligations_due ON obligations (status, due_date);

-- 法务待办（agent 派发 / 雷达产出 / 手动）
CREATE TABLE IF NOT EXISTS legal_tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  matter_id BIGINT REFERENCES matters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT,
  assignee_staff_id BIGINT REFERENCES service_staff(id),
  due_date DATE,
  source TEXT NOT NULL DEFAULT 'agent' CHECK (source IN ('agent','radar','manual')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_tasks_open ON legal_tasks (status, due_date);

-- Playbook：合同审查立场库（admin 维护）
CREATE TABLE IF NOT EXISTS playbook_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_category TEXT NOT NULL CHECK (contract_category IN ('transport','lease','labor','purchase','service','other')),
  clause_topic TEXT NOT NULL,
  ideal_position TEXT NOT NULL,
  fallback_position TEXT,
  red_line TEXT,
  suggested_language TEXT,
  negotiation_tip TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 期限规则表（时效计算走查表，不靠 LLM）
CREATE TABLE IF NOT EXISTS deadline_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  base_event TEXT NOT NULL,
  duration_days INT NOT NULL,
  legal_basis TEXT NOT NULL
);

-- 锁定策略沿用 00005：开 RLS + REVOKE，仅 service_role（db-proxy / agent-proxy）可访问
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadline_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON matters, matter_links, agent_runs, legal_drafts, obligations, legal_tasks, playbook_rules, deadline_rules
  FROM anon, authenticated;

-- operation_logs target_type 扩展 matter / legal_draft
DO $$ DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name FROM pg_constraint
  WHERE conrelid = 'operation_logs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%target_type%';
  IF constraint_name IS NOT NULL THEN EXECUTE format('ALTER TABLE operation_logs DROP CONSTRAINT %I', constraint_name); END IF;
  ALTER TABLE operation_logs ADD CONSTRAINT operation_logs_target_type_check
    CHECK (target_type IN ('expense_record','driver','vehicle','advance_fund','fee_type','staff','contract','legal_document','matter','legal_draft'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 种子数据 ============

-- Playbook：运输/分包合同立场（来源：公司现有模板，需法务负责人复核）
INSERT INTO playbook_rules (contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip)
SELECT * FROM (VALUES
  ('transport', 'liability',
   '分包商/承运方赔偿不以运费为限，覆盖货值损失、客户索赔款、重运费用、仓储费用、律师费及其他合理支出',
   '赔偿上限不低于我方对客户已承担或应承担的赔偿责任',
   '出现"赔偿以运费（或其 X 倍）为限"条款',
   '乙方的赔偿责任不以运费金额为限，不得低于甲方对客户已承担或应承担的赔偿责任。',
   '强调跨境链路中我方对客户先行担责，限额条款将导致风险敞口完全失衡'),
  ('transport', 'subcontract',
   '禁止擅自分包；经书面同意分包的，对分包方行为承担连带责任',
   '允许报备制分包，但保留连带责任',
   '允许自由分包且不承担连带责任',
   '未经甲方书面同意，乙方不得擅自分包。经同意分包的，乙方仍对分包方行为承担连带责任。',
   '以越南段/东南亚段多层分包的实际风险说明连带责任的必要性'),
  ('transport', 'force_majeure',
   '不可抗力限于不可预见、不可避免、不可克服的客观事件；拥堵、常规清关延迟、调度异常、油价波动、分包商违约均不构成',
   '可接受列举式不可抗力，但必须明确排除上述情形',
   '宽泛不可抗力定义（含拥堵/清关延迟）',
   '人员不足、车辆调度异常、分包商违约、常规拥堵、普通清关延迟、燃油价格波动等均不构成不可抗力。',
   '清关延迟是跨境物流常态成本，纳入不可抗力等于免除对方主要义务'),
  ('transport', 'evidence',
   '事故 24 小时内书面通知并提交照片、视频、签收记录、异常说明；逾期举证不利由对方承担',
   '48 小时通知期',
   '无证据义务条款',
   '乙方应在事故发生后 24 小时内书面通知甲方并提交现场照片、视频、签收记录、异常说明；未按时提交的，由此导致的举证不利后果由乙方承担。',
   '证据时效直接决定追偿成败，这是不可让步的程序条款'),
  ('transport', 'receipt',
   '签收不当然免责；隐蔽货损、数量短少可在约定期限内提出异议',
   '异议期不少于 7 天',
   '"签收即视为无异议"条款',
   '收货人签收不视为乙方当然免责；隐蔽货损、数量短少等情形仍可在约定期限内提出异议。',
   '集装箱/整车运输中隐蔽货损普遍，签收免责条款会架空索赔权'),
  ('transport', 'recourse',
   '我方有权先行赔付客户后向责任方追偿，责任方应在通知后 5 个工作日内支付',
   '10 个工作日支付期',
   '追偿以法院判决为前提',
   '如客户直接向甲方索赔，甲方有权先行赔付后向乙方追偿，乙方应在收到通知后 5 个工作日内支付。',
   '以诉讼为前提的追偿条款会把每单纠纷拖成年度诉讼'),
  ('transport', 'jurisdiction',
   '争议由我方所在地人民法院管辖',
   '合同签订地法院',
   '对方所在地法院或不利仲裁机构',
   '因本协议产生的争议，由甲方所在地人民法院管辖。',
   '跨省/跨境应诉成本高，管辖条款是隐性成本条款'),
  ('transport', 'payment',
   '月结对账 + 发票合规开具时限 + 逾期付款违约金',
   '可接受 45 天账期',
   '背靠背付款（客户付款为我方付款前提）',
   '运费按月对账结算；逾期付款的，每日按未付金额 0.05% 支付违约金。',
   '背靠背条款将客户信用风险转嫁给我方供应链，原则不接受')
) AS seed(contract_category, clause_topic, ideal_position, fallback_position, red_line, suggested_language, negotiation_tip)
WHERE NOT EXISTS (SELECT 1 FROM playbook_rules);

-- 期限规则（⚠ 上线前须由法务负责人逐条复核）
INSERT INTO deadline_rules (rule_key, description, base_event, duration_days, legal_basis)
SELECT * FROM (VALUES
  ('general_civil_claim', '普通民事请求权诉讼时效（含国内公路货损索赔、运费请求权）', '知道或应当知道权利受到损害以及义务人之日', 1095, '《民法典》第 188 条（3 年）'),
  ('intl_sea_cargo_claim', '海上货物运输向承运人索赔时效', '承运人交付或应当交付货物之日', 365, '《海商法》第 257 条（1 年）'),
  ('air_cargo_claim', '航空货物运输索赔诉讼时效', '民用航空器到达目的地点之日/应当到达之日', 730, '《民用航空法》第 135 条（2 年）'),
  ('multimodal_claim', '多式联运经营人索赔（涉海运区段）', '交付或应当交付货物之日', 365, '《海商法》第 257 条参照适用'),
  ('cargo_damage_notice_hidden', '隐蔽货损书面异议期（合同约定型，默认值）', '货物签收之日', 7, '合同约定（公司模板：约定期限内可提异议）')
) AS seed(rule_key, description, base_event, duration_days, legal_basis)
ON CONFLICT (rule_key) DO NOTHING;
