export type ModelMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MODEL_ENDPOINT = '/api/agent/chat';

async function parseModelError(response: Response) {
  let errorMessage = `模型请求失败：HTTP ${response.status}`;

  try {
    const errorData = await response.json();
    const detail =
      typeof errorData?.error?.message === 'string'
        ? errorData.error.message
        : typeof errorData?.message === 'string'
          ? errorData.message
          : '';

    if (detail) {
      errorMessage = `${errorMessage}，${detail}`;
    }
  } catch {
    // Ignore JSON parse errors and keep the HTTP-level message.
  }

  return errorMessage;
}

export async function chatWithModel(messages: ModelMessage[]) {
  return chatWithModelStream(messages, () => {});
}

function readStreamEvent(payload: string) {
  const parsed = JSON.parse(payload) as { type?: string; text?: string; error?: string };
  if (parsed.type === 'error') throw new Error(parsed.error || '模型请求失败');
  return parsed;
}

export async function chatWithModelStream(
  messages: ModelMessage[],
  onChunk: (text: string) => void
) {
  const response = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseModelError(response));
  }

  if (!response.body) {
    throw new Error('模型流式响应不可用，请稍后重试。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || !trimmedLine.startsWith('data:')) {
        continue;
      }

      const payload = trimmedLine.slice(5).trim();

      if (!payload || payload === '[DONE]') {
        continue;
      }

      try {
        const parsed = readStreamEvent(payload);
        if (parsed.type === 'delta' && parsed.text) {
          fullText += parsed.text;
          onChunk(parsed.text);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // Ignore malformed stream frames and continue parsing later chunks.
      }
    }
  }

  const finalBuffered = buffer.trim();
  if (finalBuffered.startsWith('data:')) {
    const payload = finalBuffered.slice(5).trim();
    if (payload && payload !== '[DONE]') {
      try {
        const parsed = readStreamEvent(payload);
        if (parsed.type === 'delta' && parsed.text) {
          fullText += parsed.text;
          onChunk(parsed.text);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // Ignore malformed trailing frame.
      }
    }
  }

  return fullText.trim();
}
