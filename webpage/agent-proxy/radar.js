// 雷达：每日扫描合同到期 / 履约义务 / 索赔时效，产出 legal_tasks 待办（source='radar'）。
// 纯计算部分（buildRadarTasks）与 IO 分离，便于单测。

const { sbSelect, sbInsert } = require('./supabase');

const SCAN_HOUR = Number(process.env.RADAR_SCAN_HOUR || 8); // 本地时间整点
const OBLIGATION_WINDOW_DAYS = 30;
const STATUTE_WINDOW_DAYS = 90;
// 已发函件跟进档位：发出 N 天后提醒（升级口径在更高档触发新提醒）
const SENT_FOLLOWUP_TIERS = [7, 30];

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// 输入快照 → 应存在的雷达待办清单（today: 'YYYY-MM-DD'）
function buildRadarTasks({ today, expiringContracts, obligations, matters, sentDrafts = [] }) {
  const tasks = [];

  for (const contract of expiringContracts) {
    if (contract.acked) continue;
    const days = contract.effective_days_left;
    tasks.push({
      title: `合同${contract.auto_renew ? '续约/解约通知' : '到期'}提醒：${contract.title}（剩 ${days} 天）`,
      detail: `合同 #${contract.id}，对方 ${contract.counterparty}，${contract.auto_renew ? '解约通知截止' : '到期日'} ${contract.end_date}。请在台账处理续约/终止或标记已处理。`,
      due_date: today,
      assignee_staff_id: contract.owner_staff_id || null,
      matter_id: null,
    });
  }

  for (const obligation of obligations) {
    const days = daysBetween(today, obligation.due_date);
    if (days > OBLIGATION_WINDOW_DAYS) continue;
    tasks.push({
      title: `履约义务${days < 0 ? '已逾期' : '即将到期'}：${obligation.description}（${obligation.due_date}）`,
      detail: `义务 #${obligation.id}${obligation.contract_id ? `，合同 #${obligation.contract_id}` : ''}${obligation.matter_id ? `，事项 #${obligation.matter_id}` : ''}。完成后请在系统中标记。`,
      due_date: obligation.due_date,
      assignee_staff_id: obligation.owner_staff_id || null,
      matter_id: obligation.matter_id || null,
    });
  }

  for (const matter of matters) {
    if (!matter.statute_deadline) continue;
    const days = daysBetween(today, matter.statute_deadline);
    if (days > STATUTE_WINDOW_DAYS) continue;
    const urgency = days <= 30 ? '【紧急】' : '';
    tasks.push({
      title: `${urgency}时效告警：「${matter.title}」剩 ${days} 天（${matter.statute_deadline}）`,
      detail: `事项 #${matter.id} 的诉讼/索赔时效即将届满。请尽快推进协商或启动诉讼/仲裁程序。`,
      due_date: matter.statute_deadline,
      assignee_staff_id: matter.owner_staff_id || null,
      matter_id: matter.id,
    });
  }

  for (const draft of sentDrafts) {
    if (!draft.sent_at) continue;
    const daysSent = daysBetween(draft.sent_at.slice(0, 10), today);
    // 取已达到的最高档位；每档标题不同，升级时会生成新提醒
    const tier = [...SENT_FOLLOWUP_TIERS].reverse().find((t) => daysSent >= t);
    if (!tier) continue;
    tasks.push({
      title: `函件跟进：《${draft.title}》已发出超 ${tier} 天`,
      detail: `草稿 #${draft.id}（事项 #${draft.matter_id}）于 ${draft.sent_at.slice(0, 10)} 标记发出，至今 ${daysSent} 天。请确认对方回应情况；如未回应，${tier >= 30 ? '建议启动诉讼/仲裁评估' : '建议升级催告口径并再次发函'}。`,
      due_date: today,
      assignee_staff_id: draft.created_by || null,
      matter_id: draft.matter_id,
    });
  }

  return tasks;
}

// 与已有未完成雷达待办按 title 去重（同一告警不重复轰炸）
function dedupeAgainstExisting(candidates, existingOpenTitles) {
  const existing = new Set(existingOpenTitles);
  return candidates.filter((task) => !existing.has(task.title));
}

async function runRadarScan() {
  const today = new Date().toISOString().slice(0, 10);
  const [expiringContracts, obligations, matters, activeMatters, sentDraftsRaw, existingTasks] = await Promise.all([
    sbSelect('contracts_expiring', { select: 'id,title,counterparty,end_date,auto_renew,effective_days_left,acked,owner_staff_id' }),
    sbSelect('obligations', { select: 'id,contract_id,matter_id,description,due_date,owner_staff_id', status: 'eq.pending' }),
    sbSelect('matters', {
      select: 'id,title,statute_deadline,owner_staff_id',
      status: `in.(open,in_progress,awaiting)`,
      statute_deadline: 'not.is.null',
    }),
    sbSelect('matters', { select: 'id', status: 'in.(open,in_progress,awaiting)' }),
    sbSelect('legal_drafts', { select: 'id,matter_id,title,sent_at,created_by', status: 'eq.sent' }),
    sbSelect('legal_tasks', { select: 'title', status: 'eq.open', source: 'eq.radar' }),
  ]);

  // 仅跟进仍在进行中的事项的函件（已结案不再提醒）
  const activeIds = new Set(activeMatters.map((matter) => matter.id));
  const sentDrafts = sentDraftsRaw.filter((draft) => activeIds.has(draft.matter_id));

  const candidates = buildRadarTasks({ today, expiringContracts, obligations, matters, sentDrafts });
  const fresh = dedupeAgainstExisting(candidates, existingTasks.map((task) => task.title));

  for (const task of fresh) {
    await sbInsert('legal_tasks', { ...task, source: 'radar' });
  }
  return { scanned: candidates.length, created: fresh.length, today };
}

function msUntilNextRun(hour, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDailyScan(onResult) {
  const tick = async () => {
    try {
      const result = await runRadarScan();
      onResult?.(null, result);
    } catch (err) {
      onResult?.(err);
    } finally {
      setTimeout(tick, msUntilNextRun(SCAN_HOUR)).unref?.();
    }
  };
  const timer = setTimeout(tick, msUntilNextRun(SCAN_HOUR));
  timer.unref?.();
  return timer;
}

module.exports = { buildRadarTasks, dedupeAgainstExisting, runRadarScan, scheduleDailyScan, msUntilNextRun };
