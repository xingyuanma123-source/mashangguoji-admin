// 代理授权逻辑：表/存储桶白名单、密码字段防护、非管理员日志范围限定。
// 纯函数，便于单测（见 authorize.test.js）。

const ALLOWED_TABLES = [
  'service_staff', 'drivers', 'vehicles', 'fee_types',
  'expense_records', 'advance_fund_records', 'operation_logs',
  'expense_fee_details', 'expense_other_fees', 'legal_reviews',
  'operating_companies', 'vehicle_documents', 'vehicle_locations',
  'vehicles_sorted', 'trailers_sorted', 'vehicles_trailer',
  'truck_trailer_assignments',
  'customers', 'dispatch_records', 'dispatch_operation_logs',
  'contracts', 'contract_files', 'contract_reviews', 'contract_alert_acks',
  'legal_documents', 'legal_document_versions', 'contracts_expiring',
  'matters', 'matter_links', 'agent_runs', 'legal_drafts', 'obligations',
  'legal_tasks', 'playbook_rules', 'deadline_rules',
];

// 含密码列的表：读取必须用明确字段列表，写入响应会被剥除密码字段
const SENSITIVE_TABLES = ['drivers', 'service_staff'];

const ALLOWED_BUCKETS = ['vehicle-documents', 'receipt-images', 'contracts', 'legal-library'];
const STORAGE_ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE']);
const LEGAL_BUCKETS = new Set(['contracts', 'legal-library']);
const ADMIN_ONLY_LEGAL_WRITE_TABLES = new Set([
  'contracts', 'contract_files', 'contract_reviews', 'legal_documents', 'legal_document_versions',
]);
// agent 体系表的写入归 agent-proxy（service_role 直连）；前端经 db-proxy 只读
const AGENT_READONLY_TABLES = new Set(['agent_runs', 'deadline_rules']);
// Playbook 仅管理员可改；legal_drafts/obligations 的修改删除也限管理员
const ADMIN_ONLY_AGENT_WRITE_TABLES = new Set(['playbook_rules', 'legal_drafts', 'obligations']);
const ALLOWED_RPCS = new Set(['search_legal_documents', 'renew_contract']);
const ADMIN_ONLY_RPCS = new Set(['renew_contract']);
// /object/ 之后、bucket 之前可能出现的路径关键字（sign/list 等子接口）
const STORAGE_PATH_KEYWORDS = new Set(['sign', 'public', 'authenticated', 'info', 'list', 'upload']);

function deny(status, error) {
  return { ok: false, status, error };
}

function selectLeaksPassword(select) {
  return /password/i.test(select)
    || /(?:drivers|service_staff)(?:![^,(]+)?\(\s*\*\s*\)/i.test(select);
}

function authorizeStorage(path, method, session) {
  if (!STORAGE_ALLOWED_METHODS.has(method)) {
    return deny(403, '不允许的存储操作');
  }
  const segments = path.split('?')[0].split('/').filter(Boolean);
  if (segments[2] !== 'object') {
    return deny(403, '不允许的存储路径');
  }
  let index = 3;
  while (index < segments.length && STORAGE_PATH_KEYWORDS.has(segments[index])) index += 1;
  const bucket = decodeURIComponent(segments[index] || '');
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return deny(403, '不允许访问该存储桶');
  }
  if (method === 'DELETE' && (!LEGAL_BUCKETS.has(bucket) || session.role !== 'admin')) {
    return deny(403, '仅管理员可删除法务文件');
  }
  return { ok: true, path };
}

function authorizeRest(path, method, session) {
  const url = new URL(path, 'http://proxy.local');
  const segments = url.pathname.split('/').filter(Boolean);
  const table = decodeURIComponent(segments[2] || '');
  if (table === 'rpc') {
    const rpc = decodeURIComponent(segments[3] || '');
    if (method !== 'POST' || !ALLOWED_RPCS.has(rpc)) {
      return deny(403, '不允许调用该数据库函数');
    }
    if (ADMIN_ONLY_RPCS.has(rpc) && session.role !== 'admin') {
      return deny(403, '仅管理员可执行合同续约');
    }
    return { ok: true, path, rpc };
  }
  if (!ALLOWED_TABLES.includes(table)) {
    return deny(403, '不允许访问该数据表');
  }
  if (table === 'service_staff' && session.role !== 'admin') {
    return deny(403, '仅管理员可访问客服账号数据');
  }
  if (session.role !== 'admin' && ADMIN_ONLY_LEGAL_WRITE_TABLES.has(table)
    && (method === 'PATCH' || method === 'DELETE')) {
    return deny(403, '仅管理员可修改或删除法务数据');
  }
  if (session.role !== 'admin' && table === 'legal_document_versions' && method === 'POST') {
    return deny(403, '仅管理员可发布法律文件新版本');
  }
  if (AGENT_READONLY_TABLES.has(table) && method !== 'GET' && method !== 'HEAD') {
    return deny(403, '该表仅可通过法务 Agent 服务写入');
  }
  if (session.role !== 'admin' && ADMIN_ONLY_AGENT_WRITE_TABLES.has(table)
    && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
    return deny(403, '仅管理员可修改该法务数据');
  }
  if (session.role !== 'admin' && (table === 'matters' || table === 'matter_links') && method === 'DELETE') {
    return deny(403, '仅管理员可删除法务事项');
  }

  const select = url.searchParams.get('select');
  if (select && selectLeaksPassword(select)) {
    return deny(403, '不允许读取密码字段');
  }

  const isRead = method === 'GET' || method === 'HEAD';
  if (isRead && SENSITIVE_TABLES.includes(table) && (!select || select.includes('*'))) {
    return deny(403, '敏感账号表必须使用明确字段列表');
  }

  if (table === 'customers' && method === 'POST') {
    return { ok: true, path, table, forceCustomerCreatedBy: session.id };
  }
  if (table === 'dispatch_records') {
    if (method === 'DELETE') {
      return deny(403, '派遣记录只能软删除');
    }
    if (method === 'POST') {
      return { ok: true, path, table, forceDispatchAgentId: session.id };
    }
    if (method === 'PATCH') {
      if (session.role !== 'admin') {
        url.searchParams.set('agent_id', `eq.${session.id}`);
      }
      return { ok: true, path: `${url.pathname}${url.search}`, table, stripDispatchAgentId: true };
    }
  }
  if (table === 'dispatch_operation_logs') {
    if (method === 'PATCH' || method === 'DELETE') {
      return deny(403, '派遣操作日志不允许修改或删除');
    }
    if (method === 'POST') {
      return { ok: true, path, table, forceDispatchOperatorId: session.id };
    }
    if (session.role !== 'admin' && isRead) {
      url.searchParams.set('operator_id', `eq.${session.id}`);
      return { ok: true, path: `${url.pathname}${url.search}`, table };
    }
  }

  // 非管理员只能看自己的操作日志（密码检查必须在此分支之前完成）
  if (table === 'operation_logs' && session.role !== 'admin' && isRead) {
    url.searchParams.set('operator_id', `eq.${session.id}`);
    return { ok: true, path: `${url.pathname}${url.search}`, table };
  }

  return { ok: true, path, table };
}

function authorizeSupabaseProxy({ path, method, session }) {
  if (path.startsWith('/storage/v1/')) return authorizeStorage(path, method, session);
  if (path.startsWith('/rest/v1/')) return authorizeRest(path, method, session);
  return deny(404, '不支持的 Supabase 代理路径');
}

// 递归剥除响应中的密码字段（return=representation 会回显整行）
function scrubPasswords(value) {
  if (Array.isArray(value)) return value.map(scrubPasswords);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/password/i.test(key)) continue;
      out[key] = scrubPasswords(item);
    }
    return out;
  }
  return value;
}

function applyProxyManagedFields(payload, decision) {
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (decision.forceCustomerCreatedBy != null) row.created_by = decision.forceCustomerCreatedBy;
    if (decision.forceDispatchAgentId != null) row.agent_id = decision.forceDispatchAgentId;
    if (decision.stripDispatchAgentId) delete row.agent_id;
    if (decision.forceDispatchOperatorId != null) row.operator_id = decision.forceDispatchOperatorId;
  }
  return payload;
}

module.exports = {
  ALLOWED_TABLES,
  ALLOWED_BUCKETS,
  SENSITIVE_TABLES,
  authorizeSupabaseProxy,
  applyProxyManagedFields,
  scrubPasswords,
};
