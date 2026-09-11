const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorizeSupabaseProxy, scrubPasswords } = require('./authorize');

const admin = { id: 1, role: 'admin' };
const staff = { id: 2, role: 'staff' };

function authorize(path, { method = 'GET', session = admin } = {}) {
  return authorizeSupabaseProxy({ path, method, session });
}

test('拒绝白名单外的表和 rpc 路径', () => {
  assert.equal(authorize('/rest/v1/pg_user?select=*').ok, false);
  assert.equal(authorize('/rest/v1/rpc/do_thing', { method: 'POST' }).ok, false);
  assert.equal(authorize('/auth/v1/admin/users').status, 404);
});

test('仅放行指定法务 RPC，续约仅管理员可调用', () => {
  assert.equal(authorize('/rest/v1/rpc/search_legal_documents', { method: 'POST', session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/rpc/renew_contract', { method: 'POST', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/rpc/renew_contract', { method: 'POST' }).ok, true);
  assert.equal(authorize('/rest/v1/rpc/search_legal_documents', { method: 'GET' }).status, 403);
});

test('service_staff 仅管理员可访问', () => {
  assert.equal(authorize('/rest/v1/service_staff?select=id,name', { session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/service_staff?select=id,name').ok, true);
});

test('拒绝读取密码字段（含嵌套 embed）', () => {
  assert.equal(authorize('/rest/v1/drivers?select=id,password').status, 403);
  assert.equal(authorize('/rest/v1/expense_records?select=*,drivers(*)').status, 403);
  assert.equal(authorize('/rest/v1/expense_records?select=*,drivers(id,name)').ok, true);
});

test('敏感账号表读取必须用明确字段列表', () => {
  assert.equal(authorize('/rest/v1/drivers').status, 403);
  assert.equal(authorize('/rest/v1/drivers?select=*').status, 403);
  assert.equal(authorize('/rest/v1/drivers?select=id,name,username').ok, true);
});

test('非管理员读日志被限定到本人，且不能借此绕过密码检查', () => {
  const scoped = authorize('/rest/v1/operation_logs?select=id,action', { session: staff });
  assert.equal(scoped.ok, true);
  assert.match(scoped.path, /operator_id=eq\.2/);

  // 修复前：该分支提前 return，跳过了密码 embed 检查
  const leak = authorize('/rest/v1/operation_logs?select=*,service_staff(password)', { session: staff });
  assert.equal(leak.status, 403);
});

test('storage 仅允许白名单 bucket 与安全方法', () => {
  assert.equal(authorize('/storage/v1/object/vehicle-documents/trucks/1/a.jpg', { method: 'POST' }).ok, true);
  assert.equal(authorize('/storage/v1/object/sign/vehicle-documents/trucks/1/a.jpg', { method: 'POST' }).ok, true);
  assert.equal(authorize('/storage/v1/object/sign/receipt-images/2026/06/x.jpg').ok, true);
  assert.equal(authorize('/storage/v1/object/secret-bucket/x.jpg').status, 403);
  assert.equal(authorize('/storage/v1/object/vehicle-documents/a.jpg', { method: 'DELETE' }).status, 403);
  assert.equal(authorize('/storage/v1/bucket', { method: 'POST' }).status, 403);
});

test('法务表允许全员读取新增，但修改删除仅管理员', () => {
  assert.equal(authorize('/rest/v1/contracts?select=*', { session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/contracts', { method: 'POST', session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/contract_alert_acks', { method: 'POST', session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/contracts?id=eq.1', { method: 'PATCH', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/legal_documents?id=eq.1', { method: 'DELETE', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/legal_document_versions', { method: 'POST', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/legal_document_versions', { method: 'POST' }).ok, true);
  assert.equal(authorize('/rest/v1/contracts?id=eq.1', { method: 'PATCH' }).ok, true);
});

test('法务存储桶允许上传下载，删除仅管理员', () => {
  assert.equal(authorize('/storage/v1/object/contracts/1/a.pdf', { method: 'POST', session: staff }).ok, true);
  assert.equal(authorize('/storage/v1/object/sign/legal-library/1/a.pdf', { method: 'POST', session: staff }).ok, true);
  assert.equal(authorize('/storage/v1/object/contracts/1/a.pdf', { method: 'DELETE', session: staff }).status, 403);
  assert.equal(authorize('/storage/v1/object/contracts/1/a.pdf', { method: 'DELETE' }).ok, true);
});

test('scrubPasswords 递归剥除密码字段', () => {
  const scrubbed = scrubPasswords([
    { id: 1, password: 'x', profile: { old_password: 'y', name: '张三' } },
  ]);
  assert.deepEqual(scrubbed, [{ id: 1, profile: { name: '张三' } }]);
});

test('agent 体系表：runs/规则表前端只读，写入被拒', () => {
  assert.equal(authorize('/rest/v1/agent_runs?matter_id=eq.1', { session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/agent_runs', { method: 'POST', session: admin }).status, 403);
  assert.equal(authorize('/rest/v1/deadline_rules?select=*', { session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/deadline_rules', { method: 'PATCH', session: admin }).status, 403);
});

test('playbook/drafts/obligations 写入仅管理员', () => {
  assert.equal(authorize('/rest/v1/playbook_rules?select=*', { session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/playbook_rules', { method: 'POST', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/playbook_rules', { method: 'POST', session: admin }).ok, true);
  assert.equal(authorize('/rest/v1/legal_drafts?id=eq.1', { method: 'PATCH', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/legal_drafts?id=eq.1', { method: 'PATCH', session: admin }).ok, true);
  assert.equal(authorize('/rest/v1/obligations', { method: 'DELETE', session: staff }).status, 403);
});

test('事项全员可建可改，删除仅管理员', () => {
  assert.equal(authorize('/rest/v1/matters', { method: 'POST', session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/matters?id=eq.1', { method: 'PATCH', session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/matters?id=eq.1', { method: 'DELETE', session: staff }).status, 403);
  assert.equal(authorize('/rest/v1/matters?id=eq.1', { method: 'DELETE', session: admin }).ok, true);
  assert.equal(authorize('/rest/v1/legal_tasks', { method: 'POST', session: staff }).ok, true);
});

test('派遣模块表允许访问并按客服会话限制写入', () => {
  assert.equal(authorize('/rest/v1/customers?select=id,name', { session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/dispatch_records?select=*', { session: staff }).ok, true);
  assert.equal(authorize('/rest/v1/dispatch_operation_logs?select=*', { session: staff }).ok, true);

  const create = authorize('/rest/v1/dispatch_records', { method: 'POST', session: staff });
  assert.equal(create.ok, true);
  assert.equal(create.forceDispatchAgentId, 2);

  const update = authorize('/rest/v1/dispatch_records?id=eq.10', { method: 'PATCH', session: staff });
  assert.equal(update.ok, true);
  assert.match(update.path, /agent_id=eq\.2/);
  assert.equal(update.stripDispatchAgentId, true);

  const adminUpdate = authorize('/rest/v1/dispatch_records?id=eq.10', { method: 'PATCH', session: admin });
  assert.equal(adminUpdate.ok, true);
  assert.doesNotMatch(adminUpdate.path, /agent_id=eq\.1/);
  assert.equal(adminUpdate.stripDispatchAgentId, true);

  assert.equal(authorize('/rest/v1/dispatch_records?id=eq.10', { method: 'DELETE', session: admin }).status, 403);

  const logCreate = authorize('/rest/v1/dispatch_operation_logs', { method: 'POST', session: staff });
  assert.equal(logCreate.ok, true);
  assert.equal(logCreate.forceDispatchOperatorId, 2);
  assert.equal(authorize('/rest/v1/dispatch_operation_logs?id=eq.5', { method: 'PATCH', session: admin }).status, 403);
});
