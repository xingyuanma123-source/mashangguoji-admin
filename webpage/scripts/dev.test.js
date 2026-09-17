import { describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { developmentEnv, requireFreePort } from './dev.mjs';

const valid = { SUPABASE_URL: 'https://ovtnnahdqljqqkponvhu.supabase.co',
  SUPABASE_SERVICE_KEY: 'sb_secret_test-only', SESSION_SECRET: 'test-only-session-secret' };

describe('local development environment', () => {
  it('forces loopback and test ports, regardless of file ports', () => {
    expect(developmentEnv({ ...valid, PORT: '3002', HOST: '0.0.0.0' })).toMatchObject({ PORT: '4002', HOST: '127.0.0.1' });
  });
  it('rejects production and spoofed staging URLs', () => {
    for (const SUPABASE_URL of ['https://rwjbladqwubgjotlygyy.supabase.co', `${valid.SUPABASE_URL}.evil.test`, '']) {
      expect(() => developmentEnv({ ...valid, SUPABASE_URL })).toThrow('不是 staging');
    }
  });
  it('checks inherited overrides instead of trusting only the env file', () => {
    expect(() => developmentEnv(valid, { SUPABASE_URL: 'https://prod.invalid' })).toThrow('不是 staging');
  });
  it('rejects missing and example credentials without printing them', () => {
    expect(() => developmentEnv({ ...valid, SUPABASE_SERVICE_KEY: 'your-service-role-key' })).toThrow('SUPABASE_SERVICE_KEY');
    expect(() => developmentEnv({ ...valid, SESSION_SECRET: '' })).toThrow('SESSION_SECRET');
  });
  it('rejects a service JWT for the wrong project', () => {
    const payload = Buffer.from(JSON.stringify({ ref: 'wrong-project', role: 'service_role' })).toString('base64url');
    expect(() => developmentEnv({ ...valid, SUPABASE_SERVICE_KEY: `eyJhbGciOiJIUzI1NiJ9.${payload}.test` })).toThrow('不是 staging');
  });
  it('does not attach to an existing process', async () => {
    const server = createServer();
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    try { await expect(requireFreePort(server.address().port)).rejects.toThrow('被占用'); }
    finally { await new Promise((done) => server.close(done)); }
  });
});
