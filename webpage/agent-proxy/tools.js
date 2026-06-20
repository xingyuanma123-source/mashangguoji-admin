// Agent 工具集：schema（OpenAI function calling 格式）+ 执行器。
// 写操作（NEEDS_APPROVAL）由 agent.js 拦截挂起，经用户批准后才执行。

const { sbSelect, sbInsert, sbUpdate, sbRpc } = require('./supabase');

const TOOL_RESULT_LIMIT = 6000;
const OCR_TEXT_LIMIT = 8000;

const NEEDS_APPROVAL = new Set([
  'create_matter', 'update_matter', 'create_task', 'register_obligation', 'finalize_document', 'close_matter',
]);

// 证据包标准（按事项类型；货损索赔与设计文档 §W1 对齐）
const EVIDENCE_STANDARDS = {
  claim: [
    { key: 'waybill', label: '运单原件/电子运单' },
    { key: 'handover', label: '区段交接单' },
    { key: 'receipt', label: '签收单' },
    { key: 'scene_media', label: '事故现场照片/视频' },
    { key: 'incident_report', label: '异常情况说明（承运方出具）' },
    { key: 'cargo_value', label: '货值证明（发票/报关单）' },
    { key: 'customer_claim', label: '客户索赔函及我方赔付凭证' },
    { key: 'correspondence', label: '与责任方的沟通记录' },
  ],
  collection: [
    { key: 'contract', label: '运输/服务合同' },
    { key: 'statement', label: '对账单（双方确认版）' },
    { key: 'invoices', label: '已开具发票' },
    { key: 'delivery_proof', label: '运输完成凭证（签收/POD）' },
    { key: 'reminder_records', label: '历次催款记录' },
  ],
  dispute: [
    { key: 'contract', label: '相关合同及附件' },
    { key: 'correspondence', label: '双方往来函件/聊天记录' },
    { key: 'performance_proof', label: '履约凭证' },
    { key: 'loss_proof', label: '损失证明材料' },
  ],
};

const ADMIN_ONLY_TOOLS = new Set(['finalize_document']);

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'search_contracts',
      description: '按关键词检索合同台账（标题/对方单位/合同编号），返回基本信息列表',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string', description: '关键词，如对方公司名' } },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_contract',
      description: '按 id 获取合同详情，含 OCR 正文（用于条款分析）',
      parameters: {
        type: 'object',
        properties: { contract_id: { type: 'number' } },
        required: ['contract_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: '全文检索法律文件库（合同模板/制度/法规/诉讼文书），返回标题与匹配摘录',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string' },
          doc_type: { type: 'string', enum: ['template', 'policy', 'regulation', 'litigation', 'authorization', 'other'] },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_matters',
      description: '列出法务事项（可按状态筛选）',
      parameters: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['open', 'in_progress', 'awaiting', 'resolved', 'closed'] } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_matter',
      description: '获取事项全量上下文：基本信息、关联合同/文件、文书草稿、待办',
      parameters: {
        type: 'object',
        properties: { matter_id: { type: 'number' } },
        required: ['matter_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_deadline',
      description: '按期限规则表计算时效/期限截止日（规则查表计算，勿自行估算法定时效）',
      parameters: {
        type: 'object',
        properties: {
          rule_key: { type: 'string', description: '规则键，如 general_civil_claim；传错会返回可用规则清单' },
          base_date: { type: 'string', description: '起算日 YYYY-MM-DD' },
        },
        required: ['rule_key', 'base_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_evidence',
      description: '获取事项的证据包标准清单，并返回已关联材料与未完成待办，用于对照标注已有/缺失项',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'number' },
          claim_type: { type: 'string', enum: ['claim', 'collection', 'dispute'], description: '默认取事项类型' },
        },
        required: ['matter_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_matter',
      description: '将合同/文件库文档关联到事项（建立证据/依据关系）',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'number' },
          target_type: { type: 'string', enum: ['contract', 'legal_document'] },
          target_id: { type: 'number' },
          relation: { type: 'string', description: "如 'basis_contract' / 'evidence'" },
        },
        required: ['matter_id', 'target_type', 'target_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_document',
      description: '起草法律文书（索赔函/催款函/确认书等），存为草稿等待人工定稿。草稿不可对外发出',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'number' },
          doc_kind: { type: 'string', enum: ['claim_letter', 'demand_letter', 'confirmation', 'notice', 'other'] },
          title: { type: 'string' },
          content: { type: 'string', description: '文书全文' },
        },
        required: ['matter_id', 'doc_kind', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_matter',
      description: '创建法务事项（立案）。需用户批准',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['claim', 'contract_review', 'collection', 'consult', 'dispute', 'other'] },
          title: { type: 'string' },
          counterparty: { type: 'string' },
          amount: { type: 'number' },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] },
          statute_deadline: { type: 'string', description: '时效截止日 YYYY-MM-DD（用 compute_deadline 计算）' },
          summary: { type: 'string', description: '事实与诉求摘要' },
        },
        required: ['type', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_matter',
      description: '更新事项状态/优先级/时效/摘要。需用户批准',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'number' },
          status: { type: 'string', enum: ['open', 'in_progress', 'awaiting', 'resolved', 'closed'] },
          priority: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] },
          statute_deadline: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['matter_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '派发待办任务（如补充证据材料）。需用户批准',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'number' },
          title: { type: 'string' },
          detail: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['matter_id', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_obligation',
      description: '注册履约义务到雷达监控（付款节点/续约通知/保证金退还等）。需用户批准',
      parameters: {
        type: 'object',
        properties: {
          contract_id: { type: 'number' },
          matter_id: { type: 'number' },
          description: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          recurrence: { type: 'string', enum: ['monthly', 'yearly'] },
        },
        required: ['description', 'due_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_cases',
      description: '检索已结案的历史案例（结案报告），用于借鉴同类索赔/催收/纠纷的处理经验',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '关键词，如对方名称、货损、催收' },
          type: { type: 'string', enum: ['claim', 'contract_review', 'collection', 'consult', 'dispute', 'other'] },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_matter',
      description: '结案归档：写入结案报告（处理过程/结果/经验教训），事项转为已结案并沉淀为可检索案例。需用户批准',
      parameters: {
        type: 'object',
        properties: {
          matter_id: { type: 'number' },
          outcome: { type: 'string', enum: ['recovered', 'settled', 'written_off', 'litigation_won', 'litigation_lost', 'other'], description: '结果：全额追回/和解/核销/胜诉/败诉/其他' },
          closing_report: { type: 'string', description: '结案报告全文：事实经过、处理步骤、最终结果、金额、经验教训' },
        },
        required: ['matter_id', 'outcome', 'closing_report'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_document',
      description: '将文书草稿定稿（之后可下载发出）。需管理员批准',
      parameters: {
        type: 'object',
        properties: { draft_id: { type: 'number' } },
        required: ['draft_id'],
      },
    },
  },
];

function truncate(value, limit = TOOL_RESULT_LIMIT) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…[已截断]` : text;
}

function escapeIlike(keyword) {
  return keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(result.getTime())) throw new Error(`无效日期: ${date}`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

const executors = {
  async search_contracts({ keyword }) {
    const pattern = `*${escapeIlike(keyword)}*`;
    return sbSelect('contracts', {
      select: 'id,title,contract_no,counterparty,category,status,amount,currency,start_date,end_date,auto_renew',
      or: `(title.ilike.${pattern},counterparty.ilike.${pattern},contract_no.ilike.${pattern})`,
      limit: '10',
      order: 'updated_at.desc',
    });
  },

  async get_contract({ contract_id }) {
    const rows = await sbSelect('contracts', { id: `eq.${contract_id}`, limit: '1' });
    if (!rows[0]) return { error: '合同不存在' };
    const contract = rows[0];
    if (contract.ocr_text && contract.ocr_text.length > OCR_TEXT_LIMIT) {
      contract.ocr_text = `${contract.ocr_text.slice(0, OCR_TEXT_LIMIT)}…[正文已截断]`;
    }
    delete contract.extracted;
    return contract;
  },

  async search_knowledge({ keyword, doc_type }) {
    const rows = await sbRpc('search_legal_documents', {
      p_keyword: keyword,
      p_doc_type: doc_type || null,
    });
    return rows.slice(0, 8).map((row) => ({
      id: row.id, title: row.title, doc_type: row.doc_type, tags: row.tags, excerpt: row.excerpt,
    }));
  },

  async list_matters({ status }) {
    return sbSelect('matters', {
      select: 'id,type,title,status,priority,counterparty,amount,statute_deadline,updated_at',
      ...(status ? { status: `eq.${status}` } : {}),
      order: 'updated_at.desc',
      limit: '20',
    });
  },

  async get_matter({ matter_id }) {
    const [matters, links, drafts, tasks] = await Promise.all([
      sbSelect('matters', { id: `eq.${matter_id}`, limit: '1' }),
      sbSelect('matter_links', { matter_id: `eq.${matter_id}` }),
      sbSelect('legal_drafts', {
        select: 'id,doc_kind,title,status,created_at', matter_id: `eq.${matter_id}`, order: 'created_at.desc', limit: '10',
      }),
      sbSelect('legal_tasks', {
        select: 'id,title,status,due_date,assignee_staff_id', matter_id: `eq.${matter_id}`, order: 'created_at.desc', limit: '10',
      }),
    ]);
    if (!matters[0]) return { error: '事项不存在' };
    return { ...matters[0], links, drafts, tasks };
  },

  async compute_deadline({ rule_key, base_date }) {
    const rules = await sbSelect('deadline_rules', { rule_key: `eq.${rule_key}`, limit: '1' });
    if (!rules[0]) {
      const all = await sbSelect('deadline_rules', { select: 'rule_key,description' });
      return { error: `规则 ${rule_key} 不存在`, available_rules: all };
    }
    const rule = rules[0];
    const deadline = addDays(base_date, rule.duration_days);
    const daysLeft = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.now()) / 86_400_000);
    return { rule_key, deadline, days_left: daysLeft, base_event: rule.base_event, legal_basis: rule.legal_basis };
  },

  async check_evidence({ matter_id, claim_type }) {
    const matters = await sbSelect('matters', { id: `eq.${matter_id}`, limit: '1' });
    if (!matters[0]) return { error: '事项不存在' };
    const type = claim_type || matters[0].type;
    const standard = EVIDENCE_STANDARDS[type] || EVIDENCE_STANDARDS.dispute;
    const [links, tasks] = await Promise.all([
      sbSelect('matter_links', { matter_id: `eq.${matter_id}` }),
      sbSelect('legal_tasks', {
        select: 'id,title,status,due_date', matter_id: `eq.${matter_id}`, status: 'eq.open',
      }),
    ]);
    return {
      claim_type: type,
      standard_checklist: standard,
      linked_materials: links.map((link) => ({ type: link.target_type, id: link.target_id, relation: link.relation })),
      open_tasks: tasks,
      note: '请对照 standard_checklist 标注已有/缺失项；缺失项可用 create_task 派发收集任务（同名任务勿重复创建）',
    };
  },

  async link_matter({ matter_id, target_type, target_id, relation }, session) {
    const rows = await sbInsert('matter_links', { matter_id, target_type, target_id, relation: relation || null });
    return rows[0];
  },

  async draft_document({ matter_id, doc_kind, title, content }, session) {
    const rows = await sbInsert('legal_drafts', {
      matter_id, doc_kind, title, content, status: 'draft', created_by: session.id,
    });
    return { draft_id: rows[0].id, status: 'draft', note: '草稿已保存，需人工审核定稿后方可对外使用' };
  },

  async create_matter(args, session) {
    const rows = await sbInsert('matters', {
      type: args.type, title: args.title, counterparty: args.counterparty || null,
      amount: args.amount ?? null, priority: args.priority || 'normal',
      statute_deadline: args.statute_deadline || null, summary: args.summary || null,
      owner_staff_id: session.id, created_by: session.id,
    });
    return rows[0];
  },

  async update_matter({ matter_id, ...fields }, session) {
    const patch = { updated_at: new Date().toISOString() };
    for (const key of ['status', 'priority', 'statute_deadline', 'summary']) {
      if (fields[key] !== undefined) patch[key] = fields[key];
    }
    const rows = await sbUpdate('matters', { id: `eq.${matter_id}` }, patch);
    return rows[0] || { error: '事项不存在' };
  },

  async create_task({ matter_id, title, detail, due_date }, session) {
    const rows = await sbInsert('legal_tasks', {
      matter_id, title, detail: detail || null, due_date: due_date || null,
      assignee_staff_id: session.id, source: 'agent',
    });
    return rows[0];
  },

  async register_obligation({ contract_id, matter_id, description, due_date, recurrence }, session) {
    const rows = await sbInsert('obligations', {
      contract_id: contract_id || null, matter_id: matter_id || null,
      description, due_date, recurrence: recurrence || null, owner_staff_id: session.id,
    });
    return rows[0];
  },

  async search_cases({ keyword, type }) {
    const pattern = `*${escapeIlike(keyword)}*`;
    const rows = await sbSelect('matters', {
      select: 'id,type,title,counterparty,amount,summary,updated_at',
      status: 'in.(resolved,closed)',
      or: `(title.ilike.${pattern},counterparty.ilike.${pattern},summary.ilike.${pattern})`,
      ...(type ? { type: `eq.${type}` } : {}),
      order: 'updated_at.desc',
      limit: '5',
    });
    return rows.map((row) => ({
      ...row,
      summary: row.summary ? `${row.summary.slice(0, 1500)}${row.summary.length > 1500 ? '…' : ''}` : null,
    }));
  },

  async close_matter({ matter_id, outcome, closing_report }, session) {
    const outcomeLabels = {
      recovered: '全额追回', settled: '和解结案', written_off: '核销', litigation_won: '诉讼胜诉', litigation_lost: '诉讼败诉', other: '其他',
    };
    const report = `【结案报告 · ${outcomeLabels[outcome] || outcome} · ${new Date().toISOString().slice(0, 10)}】\n${closing_report}`;
    const rows = await sbUpdate('matters', { id: `eq.${matter_id}` }, {
      status: 'closed', summary: report, updated_at: new Date().toISOString(),
    });
    if (!rows[0]) return { error: '事项不存在' };
    return { matter_id, status: 'closed', note: '已结案归档，可通过 search_cases 检索本案例' };
  },

  async finalize_document({ draft_id }, session) {
    if (session.role !== 'admin') return { error: '仅管理员可定稿文书' };
    const rows = await sbUpdate('legal_drafts', { id: `eq.${draft_id}`, status: 'eq.draft' }, {
      status: 'approved', approved_by: session.id, updated_at: new Date().toISOString(),
    });
    return rows[0] || { error: '草稿不存在或已定稿' };
  },
};

async function executeTool(name, args, session) {
  const executor = executors[name];
  if (!executor) return { error: `未知工具: ${name}` };
  if (ADMIN_ONLY_TOOLS.has(name) && session.role !== 'admin') {
    return { error: '该操作仅管理员可执行' };
  }
  try {
    return await executor(args, session);
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { TOOL_SCHEMAS, NEEDS_APPROVAL, ADMIN_ONLY_TOOLS, EVIDENCE_STANDARDS, executeTool, truncate, addDays, escapeIlike };
