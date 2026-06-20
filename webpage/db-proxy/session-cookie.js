const SESSION_COOKIE = 'mashang_admin_session';

function buildSessionCookie(token, maxAge, secure) {
  const secureAttribute = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureAttribute}`;
}

module.exports = { buildSessionCookie };
