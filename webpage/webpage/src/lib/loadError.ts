export type LoadErrorKind = 'auth' | 'permission' | 'service' | 'generic';

type ErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  name?: string;
  status?: number;
  statusCode?: number;
  code?: string | number;
};

export function firstLoadError(...errors: unknown[]): unknown | null {
  return errors.find((error) => error !== null && error !== undefined) ?? null;
}

export function classifyLoadError(error: unknown): LoadErrorKind {
  const value = (error && typeof error === 'object' ? error : {}) as ErrorLike;
  const status = Number(value.status || value.statusCode || value.code);
  const message = [
    typeof error === 'string' ? error : undefined,
    value.name,
    value.message,
    value.details,
    value.hint,
    String(value.code || ''),
  ].filter(Boolean).join(' ').toLowerCase();

  if (status === 401 || /登录已失效|unauthorized|jwt|session/.test(message)) return 'auth';
  if (status === 403 || /仅管理员|forbidden|permission|权限/.test(message)) return 'permission';
  if (
    [502, 503, 504].includes(status)
    || /fetch failed|failed to fetch|load failed|network|proxy|数据库代理|service unavailable|request failed|connection|econnrefused|socket/.test(message)
  ) {
    return 'service';
  }
  return 'generic';
}
