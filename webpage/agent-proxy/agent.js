// Agent 主循环：LLM tool-calling → 工具执行 → 结果回喂，写操作挂起待审批。
// 运行全程持久化到 agent_runs（messages 含 system，可恢复续跑）。

const { sbSelect, sbInsert, sbUpdate } = require('./supabase');
const { TOOL_SCHEMAS, NEEDS_APPROVAL, executeTool, truncate } = require('./tools');
const { buildSystemPrompt } = require('./prompts');
const { chatCompletion, chatCompletionStream, AGENT_MODEL } = require('./llm');

const MAX_STEPS = 12;
// 模型有时只输出"我将执行…"的计划文本而不调工具，检测后自动纠偏一次
const PLAN_ONLY_PATTERN = /我将|即将为|接下来我?会|正在为您|让我先|首先我/;

async function loadMatter(matterId) {
  if (!matterId) return null;
  const rows = await sbSelect('matters', { id: `eq.${matterId}`, limit: '1' });
  return rows[0] || null;
}

async function loadPlaybook() {
  return sbSelect('playbook_rules', {
    select: 'contract_category,clause_topic,ideal_position,red_line',
    is_active: 'eq.true',
    order: 'id.asc',
  });
}

async function loadRecentHistory(matterId) {
  if (!matterId) return [];
  const runs = await sbSelect('agent_runs', {
    select: 'user_message,final_text',
    matter_id: `eq.${matterId}`,
    status: 'eq.completed',
    order: 'created_at.desc',
    limit: '5',
  });
  return runs.reverse().flatMap((run) => [
    { role: 'user', content: run.user_message },
    { role: 'assistant', content: (run.final_text || '').slice(0, 2000) },
  ]).filter((entry) => entry.content);
}

async function saveRun(runId, patch) {
  await sbUpdate('agent_runs', { id: `eq.${runId}` }, patch);
}

async function streamFinalAnswer(messages, draft, emit) {
  const finalMessages = [
    ...messages.slice(0, -1),
    {
      role: 'user',
      content: `请直接输出最终结论，不要描述执行过程。保留以下草稿中的事实、依据和建议，组织为清晰完整的中文答复：\n\n${draft}`,
    },
  ];
  const { message, usage } = await chatCompletionStream(
    finalMessages,
    (text) => emit({ type: 'delta', text }),
  );
  return { finalText: message.content || draft, usage };
}

// 主循环：从 messages 当前状态继续推进，直到产出最终回答 / 挂起审批 / 超步数
async function driveLoop({ run, messages, steps, session, emit }) {
  let nudged = false;
  // 每次驱动都给满额步数预算（恢复续跑不被历史步骤挤占）
  for (let iteration = 0; iteration < MAX_STEPS; iteration++) {
    const { message, usage } = await chatCompletion(messages, TOOL_SCHEMAS);
    messages.push(message);

    const toolCalls = message.tool_calls || [];
    if (toolCalls.length === 0 && !nudged && PLAN_ONLY_PATTERN.test(message.content || '')) {
      nudged = true;
      messages.push({
        role: 'user',
        content: '（系统提示：不要输出计划文本，请立即调用工具执行上述操作；全部完成后再输出最终结论。）',
      });
      continue;
    }
    if (toolCalls.length === 0) {
      const draft = message.content || '（无内容）';
      let finalText = draft;
      let finalUsage = usage;
      try {
        const streamed = await streamFinalAnswer(messages, draft, emit);
        finalText = streamed.finalText;
        finalUsage = streamed.usage || usage;
        messages[messages.length - 1] = { role: 'assistant', content: finalText };
      } catch {
        emit({ type: 'delta', text: draft });
      }
      await saveRun(run.id, {
        status: 'completed', final_text: finalText, messages, steps,
        token_usage: finalUsage, completed_at: new Date().toISOString(),
      });
      emit({ type: 'final', text: finalText });
      return;
    }

    for (let index = 0; index < toolCalls.length; index++) {
      const call = toolCalls[index];
      let args;
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }

      if (NEEDS_APPROVAL.has(call.function.name)) {
        // 同批未处理的后续调用一并标记跳过，恢复时只执行被批准的这一个
        const pending = { tool_call_id: call.id, name: call.function.name, arguments: args };
        for (const remaining of toolCalls.slice(index + 1)) {
          messages.push({
            role: 'tool', tool_call_id: remaining.id,
            content: JSON.stringify({ skipped: '等待前序操作审批，本次未执行，如仍需要请重新调用' }),
          });
        }
        await saveRun(run.id, { status: 'suspended', pending_approval: pending, messages, steps });
        emit({ type: 'approval_required', run_id: run.id, call: pending });
        return;
      }

      emit({ type: 'tool_start', name: call.function.name, arguments: args });
      const result = await executeTool(call.function.name, args, session);
      const digest = truncate(result, 500);
      steps.push({ tool: call.function.name, args, result_digest: digest, ts: new Date().toISOString() });
      messages.push({ role: 'tool', tool_call_id: call.id, content: truncate(result) });
      emit({ type: 'tool_result', name: call.function.name, result_digest: digest });
    }
    await saveRun(run.id, { messages, steps });
  }

  // 步数耗尽：不带工具强制收尾，把已有信息总结成最终回答
  messages.push({
    role: 'user',
    content: '（系统提示：已达执行步数上限，请基于以上已获得的信息直接输出最终结论与下一步建议，不要再调用工具。）',
  });
  try {
    const { message } = await chatCompletion(messages, undefined);
    const finalText = message.content || '执行步数超限，请拆分任务后重试';
    messages.push(message);
    await saveRun(run.id, {
      status: 'completed', final_text: finalText, messages, steps, completed_at: new Date().toISOString(),
    });
    emit({ type: 'final', text: finalText });
  } catch {
    await saveRun(run.id, { status: 'failed', final_text: '执行步数超限', completed_at: new Date().toISOString() });
    emit({ type: 'error', error: '执行步数超限，请拆分任务后重试' });
  }
}

async function startRun({ matterId, userMessage, session, emit }) {
  const [matter, playbookRules, history] = await Promise.all([
    loadMatter(matterId), loadPlaybook(), loadRecentHistory(matterId),
  ]);

  const messages = [
    { role: 'system', content: buildSystemPrompt({ playbookRules, matter, today: new Date().toISOString().slice(0, 10) }) },
    ...history,
    { role: 'user', content: userMessage },
  ];

  const rows = await sbInsert('agent_runs', {
    matter_id: matterId || null, user_message: userMessage, messages,
    model: AGENT_MODEL, created_by: session.id,
  });
  const run = rows[0];
  emit({ type: 'run_created', run_id: run.id });

  try {
    await driveLoop({ run, messages, steps: [], session, emit });
  } catch (err) {
    await saveRun(run.id, { status: 'failed', final_text: err.message, completed_at: new Date().toISOString() });
    emit({ type: 'error', error: err.message });
  }
}

async function resumeRun({ runId, approved, session, emit }) {
  const rows = await sbSelect('agent_runs', { id: `eq.${runId}`, limit: '1' });
  const run = rows[0];
  if (!run) return emit({ type: 'error', error: '运行记录不存在' });
  if (run.status !== 'suspended' || !run.pending_approval) {
    return emit({ type: 'error', error: '该运行没有待审批操作' });
  }
  if (run.created_by !== session.id && session.role !== 'admin') {
    return emit({ type: 'error', error: '仅发起人或管理员可审批' });
  }

  const { tool_call_id, name, arguments: args } = run.pending_approval;
  const messages = run.messages;
  const steps = run.steps || [];

  let result;
  if (approved) {
    emit({ type: 'tool_start', name, arguments: args, approved: true });
    result = await executeTool(name, args, session);
    const digest = truncate(result, 500);
    steps.push({ tool: name, args, result_digest: digest, approved_by: session.id, ts: new Date().toISOString() });
    emit({ type: 'tool_result', name, result_digest: digest });
  } else {
    result = { rejected: '用户拒绝了该操作，请调整方案或结束当前任务' };
    steps.push({ tool: name, args, rejected_by: session.id, ts: new Date().toISOString() });
    emit({ type: 'tool_rejected', name });
  }
  messages.push({ role: 'tool', tool_call_id, content: truncate(result) });
  await saveRun(run.id, { status: 'running', pending_approval: null, messages, steps });

  try {
    await driveLoop({ run, messages, steps, session, emit });
  } catch (err) {
    await saveRun(run.id, { status: 'failed', final_text: err.message, completed_at: new Date().toISOString() });
    emit({ type: 'error', error: err.message });
  }
}

module.exports = { startRun, resumeRun, MAX_STEPS };
