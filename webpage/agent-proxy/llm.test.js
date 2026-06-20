const test = require('node:test');
const assert = require('node:assert');

process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test-key';
process.env.LLM_ENDPOINT = process.env.LLM_ENDPOINT || 'http://model.test/chat/completions';
process.env.AGENT_MODEL = process.env.AGENT_MODEL || 'mimo-v2.5-pro';
process.env.LLM_RETRY_BASE_MS = '0';

const { chatCompletion } = require('./llm');

test('模型服务 500 会自动重试', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({
        error: { message: 'invalid type: unit variant, expected newtype variant at line 1 column 40' },
      }), { status: 500 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    }), { status: 200 });
  };
  t.after(() => { global.fetch = originalFetch; });

  const result = await chatCompletion([{ role: 'user', content: 'test' }]);

  assert.strictEqual(calls, 2);
  assert.strictEqual(result.message.content, 'ok');
});

test('非临时模型错误不会重试', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response('unauthorized', { status: 401 });
  };
  t.after(() => { global.fetch = originalFetch; });

  await assert.rejects(
    chatCompletion([{ role: 'user', content: 'test' }]),
    /HTTP 401/,
  );
  assert.strictEqual(calls, 1);
});
