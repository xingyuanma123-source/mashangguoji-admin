require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  authorizeSupabaseProxy,
  applyProxyManagedFields,
  scrubPasswords,
  SENSITIVE_TABLES,
} = require('./authorize');
const { buildSessionCookie } = require('./session-cookie');

const app = express();
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '127.0.0.1';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || SUPABASE_SERVICE_KEY;
const SESSION_COOKIE = 'mashang_admin_session';
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 12);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const BCRYPT_ROUNDS = 10;
const loginFailures = new Map();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY');
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 生产环境必须配置 SESSION_SECRET（独立于 service key 的随机值）');
    process.exit(1);
  }
  console.warn('⚠️  未配置 SESSION_SECRET，暂时使用 SUPABASE_SERVICE_KEY 签名会话');
}

const REST_URL = `${SUPABASE_URL}/rest/v1`;

const headers = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// 仅信任本机反向代理（nginx）设置的 X-Forwarded-For
app.set('trust proxy', 'loopback');

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

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

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
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
  // 活跃会话剩余不足一半有效期时自动续期，仍保留长期闲置后过期。
  const remainingSeconds = session.exp - Math.floor(Date.now() / 1000);
  if (remainingSeconds < SESSION_TTL_SECONDS / 2) {
    const { exp, ...user } = session;
    res.setHeader('Set-Cookie', sessionCookie(req, signSession(user)));
  }
  req.session = session;
  next();
}

function sessionCookie(req, token, maxAge = SESSION_TTL_SECONDS) {
  return buildSessionCookie(token, maxAge, req.secure);
}

function loginAttemptKey(req, username) {
  return `${req.ip || 'unknown'}:${username.toLowerCase()}`;
}

function getActiveFailures(key) {
  const attempt = loginFailures.get(key);
  if (!attempt || Date.now() - attempt.startedAt >= LOGIN_WINDOW_MS) {
    loginFailures.delete(key);
    return null;
  }
  return attempt;
}

function recordLoginFailure(key) {
  const attempt = getActiveFailures(key) || { count: 0, startedAt: Date.now() };
  attempt.count += 1;
  loginFailures.set(key, attempt);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of loginFailures) {
    if (now - attempt.startedAt >= LOGIN_WINDOW_MS) loginFailures.delete(key);
  }
}, LOGIN_WINDOW_MS).unref();

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

function plaintextMatches(actual, expected) {
  const actualHash = crypto.createHash('sha256').update(String(actual || '')).digest();
  const expectedHash = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

// 兼容存量明文密码；登录成功后由 upgradeStoredPassword 升级为 bcrypt
function passwordsMatch(stored, supplied) {
  if (isBcryptHash(stored)) return bcrypt.compareSync(supplied, stored);
  return plaintextMatches(supplied, stored);
}

async function upgradeStoredPassword(staffId, password) {
  try {
    const response = await fetch(`${REST_URL}/service_staff?id=eq.${staffId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ password: bcrypt.hashSync(password, BCRYPT_ROUNDS) }),
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (err) {
    console.error('[Password Upgrade Error]', err.message);
  }
}

// 管理端写入含密码列的表（service_staff / drivers）时统一落 bcrypt，明文不进库
// 注意：drivers 依赖 driver-api Edge Function 已部署 bcrypt 兼容版，否则司机无法登录
function hashPasswordFields(payload) {
  const rows = Array.isArray(payload) ? payload : [payload];
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof row.password === 'string'
      && row.password && !isBcryptHash(row.password)) {
      row.password = bcrypt.hashSync(row.password, BCRYPT_ROUNDS);
    }
  }
  return payload;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

// 保留 Supabase 客户端的完整查询能力，但由服务端统一注入 service role 凭证。
app.use('/api/db/supabase', requireSession, async (req, res) => {
  try {
    const upstreamPath = req.originalUrl.slice('/api/db/supabase'.length);
    const decision = authorizeSupabaseProxy({
      path: upstreamPath,
      method: req.method,
      session: req.session,
    });
    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.error });
    }

    const proxyHeaders = {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    };
    for (const name of ['accept', 'content-type', 'prefer', 'range', 'x-client-info', 'x-upsert']) {
      if (req.headers[name]) proxyHeaders[name] = req.headers[name];
    }

    let body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readRequestBody(req);
    if (body && /json/i.test(req.headers['content-type'] || '')) {
      let payload = JSON.parse(body.toString('utf8'));
      if (SENSITIVE_TABLES.includes(decision.table)) {
        payload = hashPasswordFields(payload);
      }
      payload = applyProxyManagedFields(payload, decision);
      body = Buffer.from(JSON.stringify(payload));
    }

    const upstream = await fetch(`${SUPABASE_URL}${decision.path}`, {
      method: req.method,
      headers: proxyHeaders,
      body,
    });

    res.status(upstream.status);
    for (const name of ['content-type', 'content-range', 'range-unit', 'location', 'content-disposition', 'cache-control']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    const raw = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || '';
    if (decision.table && raw.length > 0 && contentType.includes('application/json')) {
      try {
        return res.send(Buffer.from(JSON.stringify(scrubPasswords(JSON.parse(raw.toString('utf8'))))));
      } catch {
        // 非 JSON 或解析失败时按原样返回
      }
    }
    res.send(raw);
  } catch (err) {
    console.error('[Supabase Proxy Error]', err.message);
    res.status(502).json({ error: err.message || '数据库代理请求失败' });
  }
});

app.use(express.json({ limit: '256kb' }));
app.use('/api/db/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// 健康检查
app.get('/api/db/health', (req, res) => {
  res.json({ status: 'ok', service: 'supabase-proxy' });
});

async function findStaffForLogin(username) {
  for (const accountField of ['username', 'account']) {
    const url = new URL(`${REST_URL}/service_staff`);
    url.searchParams.set('select', '*');
    url.searchParams.set(accountField, `eq.${username}`);
    url.searchParams.set('limit', '1');
    const response = await fetch(url, { headers });
    if (!response.ok) continue;
    const rows = await response.json();
    if (rows[0]) return rows[0];
  }
  return null;
}

app.post('/api/db/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ error: '请输入账号和密码' });
    }

    const attemptKey = loginAttemptKey(req, username);
    const activeFailures = getActiveFailures(attemptKey);
    if (activeFailures?.count >= LOGIN_MAX_FAILURES) {
      const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (Date.now() - activeFailures.startedAt)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
    }

    const staff = await findStaffForLogin(username);
    if (!staff || !passwordsMatch(staff.password, password)) {
      recordLoginFailure(attemptKey);
      return res.status(401).json({ error: '账号或密码错误' });
    }

    loginFailures.delete(attemptKey);
    if (!isBcryptHash(staff.password)) {
      await upgradeStoredPassword(staff.id, password);
    }
    const user = {
      id: staff.id,
      name: staff.name,
      username: staff.username || staff.account,
      role: staff.role,
      created_at: staff.created_at,
    };
    res.setHeader('Set-Cookie', sessionCookie(req, signSession(user)));
    res.json({ user });
  } catch (err) {
    console.error('[Login Error]', err.message);
    res.status(503).json({ error: '登录服务暂时不可用' });
  }
});

app.get('/api/db/auth/session', requireSession, (req, res) => {
  const { exp, ...user } = req.session;
  res.json({ user });
});

app.post('/api/db/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  res.status(204).end();
});

app.listen(PORT, HOST, () => {
  console.log(`✅ Supabase Proxy 已启动: http://${HOST}:${PORT}`);
  console.log(`   健康检查: GET /api/db/health`);
  console.log(`   数据代理: /api/db/supabase/rest/v1/*`);
});
