const assert = require('node:assert/strict');
const { test } = require('node:test');

const CONFIG_PATH = require.resolve('./ecosystem.config.js');

function loadConfig(envPatch) {
  const previousEnv = { ...process.env };

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_KEY;
  delete process.env.PORT;
  Object.assign(process.env, envPatch);

  delete require.cache[CONFIG_PATH];

  try {
    return require(CONFIG_PATH);
  } finally {
    delete require.cache[CONFIG_PATH];
    process.env = previousEnv;
  }
}

test('requires Supabase env values instead of falling back to checked-in secrets', () => {
  assert.throws(
    () => loadConfig({}),
    /Missing required environment variable: SUPABASE_URL/,
  );

  assert.throws(
    () => loadConfig({ SUPABASE_URL: 'https://example.supabase.co' }),
    /Missing required environment variable: SUPABASE_KEY/,
  );
});

test('uses Supabase env values without hardcoded project credentials', () => {
  const config = loadConfig({
    PORT: '9908',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'runtime-only-key',
  });
  const env = config.apps[0].env;

  assert.equal(env.PORT, '9908');
  assert.equal(env.SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(env.SUPABASE_KEY, 'runtime-only-key');
});
