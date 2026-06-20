const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://test.local';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const { buildRadarTasks, dedupeAgainstExisting, msUntilNextRun } = require('./radar');

const TODAY = '2026-06-11';

test('到期合同生成提醒，已 ack 的跳过', () => {
  const tasks = buildRadarTasks({
    today: TODAY,
    expiringContracts: [
      { id: 1, title: 'A 合同', counterparty: '甲', end_date: '2026-07-01', auto_renew: false, effective_days_left: 20, acked: false, owner_staff_id: 2 },
      { id: 2, title: 'B 合同', counterparty: '乙', end_date: '2026-07-15', auto_renew: true, effective_days_left: 34, acked: true, owner_staff_id: null },
    ],
    obligations: [], matters: [],
  });
  assert.strictEqual(tasks.length, 1);
  assert.match(tasks[0].title, /A 合同/);
  assert.match(tasks[0].title, /到期/);
  assert.strictEqual(tasks[0].assignee_staff_id, 2);
});

test('自动续约合同提醒文案为续约/解约通知', () => {
  const tasks = buildRadarTasks({
    today: TODAY,
    expiringContracts: [{ id: 3, title: 'C 合同', counterparty: '丙', end_date: '2026-08-01', auto_renew: true, effective_days_left: 50, acked: false }],
    obligations: [], matters: [],
  });
  assert.match(tasks[0].title, /续约\/解约通知/);
});

test('义务仅 30 天窗口内生成，逾期文案区分', () => {
  const tasks = buildRadarTasks({
    today: TODAY,
    expiringContracts: [],
    obligations: [
      { id: 1, description: '退保证金', due_date: '2026-06-20', contract_id: 9 },
      { id: 2, description: '年检', due_date: '2026-09-01' },
      { id: 3, description: '付款', due_date: '2026-06-01', matter_id: 7 },
    ],
    matters: [],
  });
  assert.strictEqual(tasks.length, 2);
  assert.match(tasks[0].title, /即将到期/);
  assert.match(tasks[1].title, /已逾期/);
  assert.strictEqual(tasks[1].matter_id, 7);
});

test('时效告警 90 天窗口，30 天内标紧急', () => {
  const tasks = buildRadarTasks({
    today: TODAY,
    expiringContracts: [], obligations: [],
    matters: [
      { id: 1, title: '甲索赔', statute_deadline: '2026-07-01', owner_staff_id: 5 },
      { id: 2, title: '乙索赔', statute_deadline: '2026-08-30' },
      { id: 3, title: '丙索赔', statute_deadline: '2027-06-01' },
      { id: 4, title: '无时效', statute_deadline: null },
    ],
  });
  assert.strictEqual(tasks.length, 2);
  assert.match(tasks[0].title, /【紧急】/);
  assert.ok(!tasks[1].title.includes('紧急'));
  assert.strictEqual(tasks[0].matter_id, 1);
});

test('按 title 与已有 open 待办去重', () => {
  const candidates = [{ title: 'X' }, { title: 'Y' }];
  assert.deepStrictEqual(dedupeAgainstExisting(candidates, ['X']), [{ title: 'Y' }]);
  assert.strictEqual(dedupeAgainstExisting(candidates, []).length, 2);
});

test('msUntilNextRun 计算下一个整点', () => {
  const now = new Date('2026-06-11T07:00:00');
  assert.strictEqual(msUntilNextRun(8, now), 3_600_000);
  const after = new Date('2026-06-11T09:00:00');
  assert.strictEqual(msUntilNextRun(8, after), 23 * 3_600_000);
});

test('已发函件按 7/30 天档位提醒，取最高档', () => {
  const tasks = buildRadarTasks({
    today: TODAY,
    expiringContracts: [], obligations: [], matters: [],
    sentDrafts: [
      { id: 1, matter_id: 4, title: '催款函', sent_at: '2026-06-02T10:00:00+00:00', created_by: 2 },   // 9 天 → 7 天档
      { id: 2, matter_id: 5, title: '索赔函', sent_at: '2026-05-01T10:00:00+00:00' },                  // 41 天 → 30 天档
      { id: 3, matter_id: 6, title: '通知函', sent_at: '2026-06-08T10:00:00+00:00' },                  // 3 天 → 不提醒
      { id: 4, matter_id: 7, title: '无时间', sent_at: null },
    ],
  });
  assert.strictEqual(tasks.length, 2);
  assert.match(tasks[0].title, /超 7 天/);
  assert.match(tasks[0].detail, /升级催告口径/);
  assert.strictEqual(tasks[0].assignee_staff_id, 2);
  assert.match(tasks[1].title, /超 30 天/);
  assert.match(tasks[1].detail, /诉讼\/仲裁评估/);
});

test('7 天档与 30 天档标题不同，升级时不被去重拦截', () => {
  const seven = buildRadarTasks({
    today: '2026-06-11', expiringContracts: [], obligations: [], matters: [],
    sentDrafts: [{ id: 1, matter_id: 4, title: '催款函', sent_at: '2026-06-02T00:00:00Z' }],
  })[0];
  const thirty = buildRadarTasks({
    today: '2026-07-11', expiringContracts: [], obligations: [], matters: [],
    sentDrafts: [{ id: 1, matter_id: 4, title: '催款函', sent_at: '2026-06-02T00:00:00Z' }],
  })[0];
  assert.notStrictEqual(seven.title, thirty.title);
  assert.deepStrictEqual(dedupeAgainstExisting([thirty], [seven.title]), [thirty]);
});
