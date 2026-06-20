import type { ServiceStaffSession } from '@/types/database';

type SessionResponse = {
  user: ServiceStaffSession;
};

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

export async function loginAdminSession(username: string, password: string): Promise<ServiceStaffSession | null> {
  const response = await fetch('/api/db/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(await readError(response, '登录服务暂时不可用'));
  }

  const payload = await response.json() as SessionResponse;
  return payload.user;
}

export async function getAdminSession(): Promise<ServiceStaffSession | null> {
  const response = await fetch('/api/db/auth/session', {
    credentials: 'same-origin',
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(await readError(response, '无法恢复登录状态'));
  }

  const payload = await response.json() as SessionResponse;
  return payload.user;
}

export async function logoutAdminSession() {
  const response = await fetch('/api/db/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(await readError(response, '退出登录失败'));
  }
}
