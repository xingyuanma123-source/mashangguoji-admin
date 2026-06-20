import { describe, expect, it } from 'vitest';

import { isExpiredProxySession, isSessionExpiredError } from './proxySession';

describe('isExpiredProxySession', () => {
  it('detects an expired session returned by the Supabase proxy', () => {
    expect(isExpiredProxySession('http://119.91.129.106/api/db/supabase/rest/v1/fee_types', 401)).toBe(true);
  });

  it('does not treat unrelated 401 responses as an expired proxy session', () => {
    expect(isExpiredProxySession('/api/db/auth/login', 401)).toBe(false);
    expect(isExpiredProxySession('/api/db/supabase/rest/v1/fee_types', 403)).toBe(false);
  });
});

describe('isSessionExpiredError', () => {
  it('detects session-expired proxy errors', () => {
    expect(isSessionExpiredError(new Error('登录已失效，请重新登录'))).toBe(true);
    expect(isSessionExpiredError({ message: '登录已失效，请重新登录' })).toBe(true);
  });

  it('does not hide ordinary load errors', () => {
    expect(isSessionExpiredError(new Error('数据库代理请求失败'))).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});
