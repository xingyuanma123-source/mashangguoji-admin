const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionCookie } = require('./session-cookie');

test('HTTP 请求的会话 Cookie 不包含 Secure', () => {
  const cookie = buildSessionCookie('token', 3600, false);
  assert.doesNotMatch(cookie, /; Secure/);
});

test('HTTPS 请求的会话 Cookie 包含 Secure', () => {
  const cookie = buildSessionCookie('token', 3600, true);
  assert.match(cookie, /; Secure/);
});
