import type { AgentStreamEvent } from '@/types/agent';
import { isExpiredProxySession, notifyExpiredProxySession } from '@/lib/proxySession';

// agent-proxy SSE 客户端：POST 发起，逐事件回调
async function streamSse(url: string, body: Record<string, unknown> | undefined, onEvent: (event: AgentStreamEvent) => void) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });

  if (isExpiredProxySession(url, response.status)) {
    notifyExpiredProxySession();
  }
  if (!response.ok) {
    let message = `Agent 服务错误 HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error('Agent 流式响应不可用');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as AgentStreamEvent);
        } catch {
          // 忽略坏帧
        }
      }
    }
  }
}

export function startAgentRun(params: { message: string; matterId?: number | null }, onEvent: (event: AgentStreamEvent) => void) {
  return streamSse('/api/agent/runs', { message: params.message, matter_id: params.matterId ?? null }, onEvent);
}

export function approveAgentRun(runId: number, onEvent: (event: AgentStreamEvent) => void) {
  return streamSse(`/api/agent/runs/${runId}/approve`, undefined, onEvent);
}

export function rejectAgentRun(runId: number, onEvent: (event: AgentStreamEvent) => void) {
  return streamSse(`/api/agent/runs/${runId}/reject`, undefined, onEvent);
}
