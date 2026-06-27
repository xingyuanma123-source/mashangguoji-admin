// LLM 调用（OpenAI 兼容接口，模型与端点均可配置）

const LLM_ENDPOINT = process.env.LLM_ENDPOINT;
const AGENT_MODEL = process.env.AGENT_MODEL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const MAX_ATTEMPTS = Number(process.env.LLM_MAX_ATTEMPTS || 3);
const RETRY_BASE_MS = Number(process.env.LLM_RETRY_BASE_MS || 500);
const MAX_TOKENS = positiveIntEnv('LLM_MAX_TOKENS', 4096);
const REQUEST_TIMEOUT_MS = positiveIntEnv('LLM_TIMEOUT_MS', 120_000);
const THINKING_DISABLED = { thinking: { type: 'disabled' } };

function positiveIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createTimeout(context) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    clear: () => clearTimeout(timer),
    error: () => new Error(`模型请求超时 ${REQUEST_TIMEOUT_MS}ms: ${context}`),
  };
}

// 仅保留 OpenAI 兼容协议字段；带 tool_calls 的 assistant 消息省略空 content。
function sanitizeMessage(message) {
  const clean = { role: message.role };
  if (message.tool_calls?.length) {
    clean.tool_calls = message.tool_calls;
    if (typeof message.content === 'string' && message.content) clean.content = message.content;
  } else {
    clean.content = typeof message.content === 'string' ? message.content : '';
  }
  if (message.tool_call_id) clean.tool_call_id = message.tool_call_id;
  if (message.name) clean.name = message.name;
  return clean;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status) {
  return status === 429 || status >= 500;
}

async function chatCompletion(messages, tools) {
  const body = JSON.stringify({
    model: AGENT_MODEL,
    messages: messages.map(sanitizeMessage),
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    ...THINKING_DISABLED,
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const timeout = createTimeout('chat completion');
    try {
      const response = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: timeout.signal,
      });

      if (!response.ok) {
        const detail = await response.text();
        if (isRetryable(response.status) && attempt < MAX_ATTEMPTS) {
          timeout.clear();
          await sleep(RETRY_BASE_MS * attempt);
          continue;
        }
        const error = new Error(`模型请求失败 HTTP ${response.status}: ${detail.slice(0, 300)}`);
        error.noRetry = true;
        throw error;
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error('模型未返回消息');
      return { message, usage: data.usage || null };
    } catch (error) {
      if (timeout.didTimeout() || error?.name === 'AbortError') throw timeout.error();
      if (error?.noRetry) throw error;
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(RETRY_BASE_MS * attempt);
    } finally {
      timeout.clear();
    }
  }
  throw new Error('模型请求失败');
}

async function chatCompletionStream(messages, onDelta, options = {}) {
  const timeout = createTimeout('streaming chat completion');
  let reader;
  try {
    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        messages: messages.map(sanitizeMessage),
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? MAX_TOKENS,
        stream: true,
        ...THINKING_DISABLED,
      }),
      signal: timeout.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`模型请求失败 HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    if (!response.body) throw new Error('模型流式响应不可用');

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let usage = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const payload = line.trim().replace(/^data:\s*/, '');
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload);
          usage = data.usage || usage;
          const delta = data.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // Ignore malformed provider frames.
        }
      }
    }
    return { message: { role: 'assistant', content: fullText }, usage };
  } catch (error) {
    if (timeout.didTimeout() || error?.name === 'AbortError') {
      try {
        await reader?.cancel();
      } catch {
        // Stream is already aborted.
      }
      throw timeout.error();
    }
    throw error;
  } finally {
    timeout.clear();
    try {
      reader?.releaseLock();
    } catch {
      // Ignore release errors after abort or completed reads.
    }
  }
}

module.exports = { chatCompletion, chatCompletionStream, AGENT_MODEL };
