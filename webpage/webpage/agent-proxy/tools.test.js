const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.local';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const { TOOL_SCHEMAS, NEEDS_APPROVAL, ADMIN_ONLY_TOOLS, truncate, addDays, escapeIlike, executeTool } = require('./tools');
const { formatPlaybook, buildSystemPrompt } = require('./prompts');

test('所有审批工具都有对应 schema', () => {
  const names = new Set(TOOL_SCHEMAS.map((tool) => tool.function.name));
  for (const name of NEEDS_APPROVAL) {
    assert.ok(names.has(name), `${name} 缺少 schema`);
  }
  for (const name of ADMIN_ONLY_TOOLS) {
    assert.ok(NEEDS_APPROVAL.has(name), `admin 工具 ${name} 必须同时要求审批`);
  }
});

test('只读检索工具不在审批清单', () => {
  for (const name of ['search_contracts', 'get_contract', 'search_knowledge', 'get_matter', 'compute_deadline']) {
    assert.ok(!NEEDS_APPROVAL.has(name), `${name} 不应要求审批`);
  }
});

test('draft_document 免审批（草稿不可对外）但 finalize 需审批', () => {
  assert.ok(!NEEDS_APPROVAL.has('draft_document'));
  assert.ok(NEEDS_APPROVAL.has('finalize_document'));
});

test('truncate 截断超长结果', () => {
  assert.strictEqual(truncate('abc', 10), 'abc');
  const long = 'x'.repeat(100);
  const out = truncate(long, 10);
  assert.ok(out.startsWith('xxxxxxxxxx'));
  assert.ok(out.includes('截断'));
  assert.strictEqual(truncate({ a: 1 }, 100), '{"a":1}');
});

test('addDays 跨月跨年正确', () => {
  assert.strictEqual(addDays('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(addDays('2026-12-31', 365), '2027-12-31');
  assert.strictEqual(addDays('2026-06-11', 1095), '2029-06-10');
  assert.throws(() => addDays('not-a-date', 1));
});

test('escapeIlike 转义通配符', () => {
  assert.strictEqual(escapeIlike('100%_test\\'), '100\\%\\_test\\\\');
});

test('未知工具返回错误而不抛异常', async () => {
  const result = await executeTool('no_such_tool', {}, { id: 1, role: 'staff' });
  assert.ok(result.error);
});

test('admin 工具拒绝普通 staff', async () => {
  const result = await executeTool('finalize_document', { draft_id: 1 }, { id: 1, role: 'staff' });
  assert.match(result.error, /管理员/);
});

test('系统提示词包含 Playbook 与时效纪律', () => {
  const prompt = buildSystemPrompt({
    playbookRules: [{ contract_category: 'transport', clause_topic: 'liability', ideal_position: '不以运费为限', red_line: '限额条款' }],
    matter: null,
    today: '2026-06-11',
  });
  assert.ok(prompt.includes('compute_deadline'));
  assert.ok(prompt.includes('不以运费为限'));
  assert.ok(prompt.includes('马上国际'));
});

test('formatPlaybook 空值兜底', () => {
  assert.ok(formatPlaybook([]).includes('为空'));
  assert.ok(formatPlaybook(null).includes('为空'));
});
