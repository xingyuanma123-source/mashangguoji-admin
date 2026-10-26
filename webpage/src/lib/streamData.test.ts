import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStreamData } from './streamData';
import { chatWithModel, chatWithModelStream } from './model';
import { approveAgentRun, rejectAgentRun, startAgentRun } from './agent';

function stream(text: string, byteByByte = false) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (byteByByte) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      } else controller.enqueue(bytes);
      controller.close();
    },
  });
}

function mockResponse(text: string) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(stream(text, true)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('readStreamData', () => {
  it('handles split UTF-8, CRLF, comments, empty data and a trailing line', async () => {
    const body = stream(': ping\r\nevent: delta\r\ndata: {"text":"中文"}\r\n\r\ndata: \ndata: [DONE]\ndata: last', true);
    const result: string[] = [];
    for await (const data of readStreamData(body)) result.push(data);
    expect(result).toEqual(['{"text":"中文"}', 'last']);
    expect(body.locked).toBe(false);
  });

  it('handles an empty stream', async () => {
    const result: string[] = [];
    for await (const data of readStreamData(stream(''))) result.push(data);
    expect(result).toEqual([]);
  });

  it('releases the reader when the consumer stops early', async () => {
    const body = stream('data: first\ndata: second\n');
    for await (const data of readStreamData(body)) {
      expect(data).toBe('first');
      break;
    }
    expect(body.locked).toBe(false);
  });

  it('propagates transport errors and releases the reader', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error('断线')); } });
    await expect(readStreamData(body).next()).rejects.toThrow('断线');
    expect(body.locked).toBe(false);
  });
});

describe('model stream integration', () => {
  it('keeps request settings, ignores bad JSON and returns trimmed text', async () => {
    const fetchMock = mockResponse('data: {bad}\ndata: {"type":"delta","text":" 中文 "}\ndata: [DONE]\ndata: {"type":"delta","text":"末尾 "}');
    const onChunk = vi.fn();
    const messages = [{ role: 'user' as const, content: '测试' }];
    expect(await chatWithModelStream(messages, onChunk)).toBe('中文 末尾');
    expect(onChunk.mock.calls).toEqual([[' 中文 '], ['末尾 ']]);
    expect(fetchMock).toHaveBeenCalledWith('/api/agent/chat', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ messages, temperature: 0.3 }),
    }));
  });

  it('preserves service error events', async () => {
    mockResponse('data: {"type":"error","error":"模型不可用"}\n');
    await expect(chatWithModel([])).rejects.toThrow('模型不可用');
  });

  it('preserves callback error propagation', async () => {
    mockResponse('data: {"type":"delta","text":"文字"}\n');
    await expect(chatWithModelStream([], () => { throw new Error('回调失败'); })).rejects.toThrow('回调失败');
  });

  it('preserves HTTP error details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"限流"}}', { status: 429 })));
    await expect(chatWithModel([])).rejects.toThrow('模型请求失败：HTTP 429，限流');
  });

  it('preserves the missing-body error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
    await expect(chatWithModel([])).rejects.toThrow('模型流式响应不可用');
  });
});

describe('agent stream integration', () => {
  it('keeps delivering after bad JSON and callback errors, including the final event', async () => {
    const fetchMock = mockResponse('data: {bad}\n\ndata: {"type":"first"}\n\ndata: {"type":"last"}');
    const onEvent = vi.fn().mockImplementationOnce(() => { throw new Error('回调失败'); });
    await startAgentRun({ message: '测试', matterId: 7 }, onEvent);
    expect(onEvent.mock.calls).toEqual([[{ type: 'first' }], [{ type: 'last' }]]);
    expect(fetchMock).toHaveBeenCalledWith('/api/agent/runs', expect.objectContaining({
      method: 'POST', credentials: 'include', body: '{"message":"测试","matter_id":7}',
    }));
  });

  it('preserves approve and reject endpoints and empty request bodies', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(stream(''))));
    vi.stubGlobal('fetch', fetchMock);
    await approveAgentRun(3, vi.fn());
    await rejectAgentRun(3, vi.fn());
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/agent/runs/3/approve', expect.objectContaining({ body: '{}' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/agent/runs/3/reject', expect.objectContaining({ body: '{}' }));
  });

  it('preserves HTTP error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"服务不可用"}', { status: 503 })));
    await expect(startAgentRun({ message: '测试' }, vi.fn())).rejects.toThrow('服务不可用');
  });

  it('preserves the missing-body error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
    await expect(startAgentRun({ message: '测试' }, vi.fn())).rejects.toThrow('Agent 流式响应不可用');
  });
});
