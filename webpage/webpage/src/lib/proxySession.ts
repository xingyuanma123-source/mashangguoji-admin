export const PROXY_SESSION_EXPIRED_EVENT = 'mashang:proxy-session-expired';

export function isExpiredProxySession(url: RequestInfo | URL, status: number) {
  const path = String(url);
  return status === 401 && (
    path.includes('/api/db/supabase/')
    || path.includes('/api/agent/')
  );
}

export function isSessionExpiredError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && String(error.message).includes('登录已失效');
}

export function notifyExpiredProxySession() {
  window.dispatchEvent(new Event(PROXY_SESSION_EXPIRED_EVENT));
}

export async function fetchWithProxySession(url: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(url, { ...init, credentials: 'include' });
  if (isExpiredProxySession(url, response.status)) {
    notifyExpiredProxySession();
  }
  return response;
}
