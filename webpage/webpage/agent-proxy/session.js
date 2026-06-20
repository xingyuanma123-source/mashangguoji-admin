// 会话校验：与 db-proxy 同源（同一 SESSION_SECRET 签名的 HMAC cookie）

const crypto = require('crypto');

const SESSION_COOKIE = 'mashang_admin_session';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;

function parseCookies(req) {
  return (req.headers.cookie || '').split(';').reduce((cookies, entry) => {
    const separator = entry.indexOf('=');
    if (separator === -1) return cookies;
    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

function requireSession(req, res, next) {
  const session = verifySession(parseCookies(req)[SESSION_COOKIE]);
  if (!session) {
    return res.status(401).json({ error: '登录已失效，请重新登录' });
  }
  req.session = session;
  next();
}

module.exports = { requireSession, verifySession, parseCookies, SESSION_COOKIE };
