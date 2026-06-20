// Supabase REST 轻量封装（service_role，仅服务端使用）

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const baseHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...baseHeaders, ...options.headers },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

function encodeParams(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function sbSelect(table, params = {}) {
  return request(`/${table}${encodeParams({ select: '*', ...params })}`);
}

async function sbInsert(table, row) {
  return request(`/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
}

async function sbUpdate(table, idFilter, patch) {
  return request(`/${table}${encodeParams(idFilter)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

async function sbRpc(fn, args) {
  return request(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
}

module.exports = { sbSelect, sbInsert, sbUpdate, sbRpc };
