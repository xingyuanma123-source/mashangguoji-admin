// driver-api —— 司机端安全网关（Supabase Edge Function，service_role 运行）
//
// 设计：
// - 微信小程序无法用 cookie，故用自定义 HMAC 令牌（登录后下发，放在 x-driver-token 头）。
// - 所有数据接口都从令牌里取 driver_id，强制只能读写「自己」的数据，客户端传来的 driver_id 一律忽略。
// - 用 service_role 直连 PostgREST；DB 锁死 anon 后，这是唯一入口。
// - verify_jwt=false：本函数自带鉴权（登录校验凭证、数据接口校验自签令牌）。

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SECRET = Deno.env.get('DRIVER_SESSION_SECRET') || SERVICE_KEY
const REST = `${SUPABASE_URL}/rest/v1`
const TOKEN_TTL = 60 * 60 * 24 * 7 // 令牌 7 天

const restHeaders: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-driver-token, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const FEE_FIELDS = [
  'fee_weighing', 'fee_container', 'fee_overnight', 'fee_vn_overtime', 'fee_vn_key',
  'fee_parking', 'fee_newpost', 'fee_taxi', 'fee_water', 'fee_tarpaulin', 'fee_highway', 'fee_stamp',
]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const num = (v: unknown): number => Number(v) || 0

// ---------- 令牌 ----------
function b64urlBytes(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).split('+').join('-').split('/').join('_').split('=').join('')
}
function b64urlStr(str: string): string {
  return b64urlBytes(new TextEncoder().encode(str))
}
function b64urlToStr(s: string): string {
  let t = s.split('-').join('+').split('_').join('/')
  while (t.length % 4) t += '='
  return atob(t)
}
async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlBytes(new Uint8Array(sig))
}
async function signToken(claims: Record<string, unknown>): Promise<string> {
  const payload = b64urlStr(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL }))
  return `${payload}.${await hmac(payload)}`
}
async function verifyToken(token: string | null): Promise<Record<string, any> | null> {
  if (!token || !token.includes('.')) return null
  const [payload, sig] = token.split('.')
  const expected = await hmac(payload)
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const claims = JSON.parse(b64urlToStr(payload))
    if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}
async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
}
async function passwordsMatch(actual: string, expected: string): Promise<boolean> {
  const a = await sha256(String(actual ?? ''))
  const b = await sha256(String(expected ?? ''))
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// ---------- PostgREST ----------
async function pg(path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`${REST}${path}`, {
    ...init,
    headers: { ...restHeaders, ...(init?.headers as Record<string, string> | undefined) },
  })
}
async function pgRows(path: string): Promise<any[]> {
  const resp = await pg(path)
  if (!resp.ok) throw new Error(await resp.text())
  return await resp.json()
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  return { start, end }
}

function normalizeOtherFees(list: any): { name: string; amount: number; sort_order: number }[] {
  return (Array.isArray(list) ? list : [])
    .map((it: any, i: number) => ({
      name: String(it?.name ?? '').trim(),
      amount: num(it?.amount),
      sort_order: it?.sort_order ?? i,
    }))
    .filter((it) => it.name && it.amount > 0)
}

function buildRecordFields(r: any): Record<string, unknown> {
  const out: Record<string, unknown> = {
    record_date: r.record_date,
    plate_number: r.plate_number,
    route: r.route ?? null,
    fee_location_detail: r.fee_location_detail ?? null,
    note_amount: num(r.note_amount),
    note_detail: r.note_detail ?? null,
    total_expense: num(r.total_expense),
    receipt_images: r.receipt_images ?? null,
    is_overtime: !!r.is_overtime,
  }
  for (const f of FEE_FIELDS) out[f] = num(r[f])
  return out
}

// ---------- 登录 ----------
async function handleLogin(req: Request): Promise<Response> {
  let body: any
  try { body = await req.json() } catch { return json({ error: '请求格式错误' }, 400) }
  const username = String(body?.username || '').trim()
  const password = String(body?.password || '')
  if (!username || !password) return json({ error: '请输入账号和密码' }, 400)

  const rows = await pgRows(
    `/drivers?select=id,name,username,password,is_active&username=eq.${encodeURIComponent(username)}&is_active=eq.true&limit=1`,
  )
  const driver = rows?.[0]
  if (!driver || !(await passwordsMatch(driver.password, password))) {
    return json({ error: '账号或密码错误' }, 401)
  }
  const token = await signToken({ driver_id: driver.id, username: driver.username })
  return json({
    token,
    driver: { id: driver.id, name: driver.name, username: driver.username, is_active: driver.is_active },
  })
}

// ---------- 数据接口（均已按 driverId 限定） ----------
async function handleVehicles(): Promise<Response> {
  const data = await pgRows(
    `/vehicles?select=id,plate_number,vehicle_type,source,is_active,created_at&is_active=eq.true&order=plate_number.asc&limit=500`,
  )
  return json({ data })
}

async function handleFeeTypes(): Promise<Response> {
  const data = await pgRows(`/fee_types?select=*&is_active=eq.true&order=sort_order.asc`)
  return json({ data })
}

async function handleMe(driverId: number): Promise<Response> {
  const rows = await pgRows(`/drivers?select=id,name,username,is_active&id=eq.${driverId}&limit=1`)
  return json({ data: rows?.[0] ?? null })
}

async function handleCreateRecords(driverId: number, body: any): Promise<Response> {
  const records = Array.isArray(body?.records) ? body.records : []
  if (records.length === 0) return json({ error: '没有要提交的记录' }, 400)

  // 幂等：同一提交键已处理过（弱网超时重试）→ 直接返回上次结果，不重复插入
  const idemKey = typeof body?.idempotency_key === 'string' && body.idempotency_key ? body.idempotency_key : null
  if (idemKey) {
    const existing = await pgRows(
      `/expense_records?select=*&driver_id=eq.${driverId}&idempotency_key=eq.${idemKey}&order=id.asc`,
    )
    if (existing.length > 0) return json({ data: existing, idempotent: true })
  }

  const payload = records.map((r: any) => ({
    ...buildRecordFields(r),
    driver_id: driverId, // 强制为登录司机
    commission: 0,
    status: 'pending',
    confirmed_by: null,
    confirmed_at: null,
    idempotency_key: idemKey,
  }))

  const insertResp = await pg('/expense_records', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  if (!insertResp.ok) return json({ error: await insertResp.text() }, 500)
  const created = await insertResp.json()

  const childRows: any[] = []
  created.forEach((rec: any, i: number) => {
    for (const of of normalizeOtherFees(records[i]?.other_fees)) {
      childRows.push({ expense_record_id: rec.id, name: of.name, amount: of.amount, sort_order: of.sort_order })
    }
  })
  if (childRows.length) {
    const childResp = await pg('/expense_other_fees', { method: 'POST', body: JSON.stringify(childRows) })
    if (!childResp.ok) return json({ error: await childResp.text() }, 500)
  }
  return json({ data: created })
}

async function handleByMonth(driverId: number, body: any): Promise<Response> {
  const { start, end } = monthRange(Number(body.year), Number(body.month))
  const data = await pgRows(
    `/expense_records?select=*&driver_id=eq.${driverId}&record_date=gte.${start}&record_date=lt.${end}&order=record_date.desc,created_at.desc`,
  )
  return json({ data })
}

async function handleGetRecord(driverId: number, body: any): Promise<Response> {
  const id = Number(body.id)
  const rows = await pgRows(`/expense_records?select=*&id=eq.${id}&driver_id=eq.${driverId}&limit=1`)
  const rec = rows?.[0]
  if (!rec) return json({ data: null })
  const other_fees = await pgRows(
    `/expense_other_fees?select=*&expense_record_id=eq.${id}&order=sort_order.asc,id.asc`,
  )
  return json({ data: { ...rec, other_fees } })
}

async function handleOtherFees(driverId: number, body: any): Promise<Response> {
  const id = Number(body.recordId)
  const owned = await pgRows(`/expense_records?select=id&id=eq.${id}&driver_id=eq.${driverId}&limit=1`)
  if (!owned?.length) return json({ data: [] })
  const data = await pgRows(
    `/expense_other_fees?select=*&expense_record_id=eq.${id}&order=sort_order.asc,id.asc`,
  )
  return json({ data })
}

async function handleUpdateRecord(driverId: number, body: any): Promise<Response> {
  const id = Number(body.id)
  const updates = body.updates || {}
  const chk = await pgRows(`/expense_records?select=id,status&id=eq.${id}&driver_id=eq.${driverId}&limit=1`)
  const rec = chk?.[0]
  if (!rec) return json({ error: '记录不存在或无权修改' }, 403)
  if (rec.status !== 'pending') return json({ error: '已确认的记录不能修改' }, 403)

  const patchResp = await pg(`/expense_records?id=eq.${id}&driver_id=eq.${driverId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(buildRecordFields(updates)),
  })
  if (!patchResp.ok) return json({ error: await patchResp.text() }, 500)
  const updated = (await patchResp.json())?.[0] ?? null

  await pg(`/expense_other_fees?expense_record_id=eq.${id}`, { method: 'DELETE' })
  const ofs = normalizeOtherFees(updates.other_fees)
  if (ofs.length) {
    const rows = ofs.map((of) => ({ expense_record_id: id, name: of.name, amount: of.amount, sort_order: of.sort_order }))
    const childResp = await pg('/expense_other_fees', { method: 'POST', body: JSON.stringify(rows) })
    if (!childResp.ok) return json({ error: await childResp.text() }, 500)
  }
  return json({ data: updated })
}

async function handleDeleteRecord(driverId: number, body: any): Promise<Response> {
  const id = Number(body.id)
  const chk = await pgRows(`/expense_records?select=id,status&id=eq.${id}&driver_id=eq.${driverId}&limit=1`)
  const rec = chk?.[0]
  if (!rec) return json({ error: '记录不存在或无权删除' }, 403)
  if (rec.status !== 'pending') return json({ error: '已确认的记录不能删除' }, 403)

  await pg(`/expense_other_fees?expense_record_id=eq.${id}`, { method: 'DELETE' })
  const delResp = await pg(`/expense_records?id=eq.${id}&driver_id=eq.${driverId}&status=eq.pending&select=id`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  })
  if (!delResp.ok) return json({ error: await delResp.text() }, 500)
  const deleted = await delResp.json()
  if (!deleted?.length) return json({ error: '未找到可删除的报账记录' }, 404)
  return json({ data: deleted })
}

async function handleMonthlyStats(driverId: number, body: any): Promise<Response> {
  const { start, end } = monthRange(Number(body.year), Number(body.month))
  const records = await pgRows(
    `/expense_records?select=total_expense,commission,status,is_overtime,record_date&driver_id=eq.${driverId}&record_date=gte.${start}&record_date=lt.${end}`,
  )
  const overtimeDates = new Set<string>()
  for (const r of records) if (r.status === 'confirmed' && r.is_overtime) overtimeDates.add(r.record_date)
  return json({
    data: {
      total_expense: records.reduce((s: number, r: any) => s + num(r.total_expense), 0),
      total_commission: records.reduce((s: number, r: any) => s + num(r.commission), 0),
      overtime_count: overtimeDates.size,
      pending_count: records.filter((r: any) => r.status === 'pending').length,
      confirmed_count: records.filter((r: any) => r.status === 'confirmed').length,
    },
  })
}

async function handleOvertimeCount(driverId: number, body: any): Promise<Response> {
  const { start, end } = monthRange(Number(body.year), Number(body.month))
  const rows = await pgRows(
    `/expense_records?select=record_date&driver_id=eq.${driverId}&status=eq.confirmed&is_overtime=eq.true&record_date=gte.${start}&record_date=lt.${end}`,
  )
  return json({ count: new Set(rows.map((r: any) => r.record_date)).size })
}

async function handleFundStats(driverId: number, body: any): Promise<Response> {
  const { start, end } = monthRange(Number(body.year), Number(body.month))
  const fundRows = await pgRows(
    `/advance_fund_records?select=*&driver_id=eq.${driverId}&fund_date=gte.${start}&fund_date=lt.${end}&order=fund_date.asc`,
  )
  const expRows = await pgRows(
    `/expense_records?select=record_date,total_expense&driver_id=eq.${driverId}&status=eq.confirmed&record_date=gte.${start}&record_date=lt.${end}&order=record_date.asc`,
  )
  const totalRecharge = fundRows.reduce((s: number, r: any) => s + num(r.amount), 0)
  const totalExpense = expRows.reduce((s: number, r: any) => s + num(r.total_expense), 0)
  const recordsList = [
    ...fundRows.map((r: any) => ({ date: r.fund_date, type: 'recharge', amount: num(r.amount), description: r.note || '充值' })),
    ...expRows.map((r: any) => ({ date: r.record_date, type: 'expense', amount: num(r.total_expense), description: '支出' })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return json({
    data: {
      total_recharge: totalRecharge,
      total_expense: totalExpense,
      balance: totalRecharge - totalExpense,
      records: recordsList,
    },
  })
}

// ---------- 合并接口（减少往返）----------
// 记录页：一次返回 records + stats（含 overtime_count），只查一次库
async function handleRecordsPage(driverId: number, body: any): Promise<Response> {
  const { start, end } = monthRange(Number(body.year), Number(body.month))
  const records = await pgRows(
    `/expense_records?select=*&driver_id=eq.${driverId}&record_date=gte.${start}&record_date=lt.${end}&order=record_date.desc,created_at.desc`,
  )
  const overtimeDates = new Set<string>()
  for (const r of records) if (r.status === 'confirmed' && r.is_overtime) overtimeDates.add(r.record_date)
  const stats = {
    total_expense: records.reduce((s: number, r: any) => s + num(r.total_expense), 0),
    total_commission: records.reduce((s: number, r: any) => s + num(r.commission), 0),
    overtime_count: overtimeDates.size,
    pending_count: records.filter((r: any) => r.status === 'pending').length,
    confirmed_count: records.filter((r: any) => r.status === 'confirmed').length,
  }
  return json({ data: { records, stats } })
}

// 我的页：一次返回 fund + overtime_count
async function handleProfileSummary(driverId: number, body: any): Promise<Response> {
  const { start, end } = monthRange(Number(body.year), Number(body.month))
  const fundRows = await pgRows(
    `/advance_fund_records?select=*&driver_id=eq.${driverId}&fund_date=gte.${start}&fund_date=lt.${end}&order=fund_date.asc`,
  )
  const expRows = await pgRows(
    `/expense_records?select=record_date,total_expense,is_overtime&driver_id=eq.${driverId}&status=eq.confirmed&record_date=gte.${start}&record_date=lt.${end}&order=record_date.asc`,
  )
  const totalRecharge = fundRows.reduce((s: number, r: any) => s + num(r.amount), 0)
  const totalExpense = expRows.reduce((s: number, r: any) => s + num(r.total_expense), 0)
  const recordsList = [
    ...fundRows.map((r: any) => ({ date: r.fund_date, type: 'recharge', amount: num(r.amount), description: r.note || '充值' })),
    ...expRows.map((r: any) => ({ date: r.record_date, type: 'expense', amount: num(r.total_expense), description: '支出' })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const overtimeDates = new Set<string>()
  for (const r of expRows) if (r.is_overtime) overtimeDates.add(r.record_date)
  return json({
    data: {
      fund: { total_recharge: totalRecharge, total_expense: totalExpense, balance: totalRecharge - totalExpense, records: recordsList },
      overtime_count: overtimeDates.size,
    },
  })
}

// ---------- 路由 ----------
function getToken(req: Request): string | null {
  const direct = req.headers.get('x-driver-token')
  if (direct) return direct
  const auth = req.headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return null
}
async function safeJson(req: Request): Promise<any> {
  try { return await req.json() } catch { return {} }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const path = new URL(req.url).pathname
  try {
    // 公开接口
    if (req.method === 'GET' && path.endsWith('/health')) return json({ status: 'ok' })
    if (req.method === 'POST' && path.endsWith('/auth/login')) return await handleLogin(req)

    // 以下需令牌
    const claims = await verifyToken(getToken(req))
    if (!claims) return json({ error: '登录已失效，请重新登录' }, 401)
    const driverId = Number(claims.driver_id)

    if (req.method === 'GET' && path.endsWith('/vehicles/active')) return await handleVehicles()
    if (req.method === 'GET' && path.endsWith('/fee-types')) return await handleFeeTypes()
    if (req.method === 'GET' && path.endsWith('/driver/me')) return await handleMe(driverId)

    const body = await safeJson(req)
    if (req.method === 'POST' && path.endsWith('/records/page')) return await handleRecordsPage(driverId, body)
    if (req.method === 'POST' && path.endsWith('/profile/summary')) return await handleProfileSummary(driverId, body)
    if (req.method === 'POST' && path.endsWith('/records/create')) return await handleCreateRecords(driverId, body)
    if (req.method === 'POST' && path.endsWith('/records/by-month')) return await handleByMonth(driverId, body)
    if (req.method === 'POST' && path.endsWith('/records/get')) return await handleGetRecord(driverId, body)
    if (req.method === 'POST' && path.endsWith('/records/update')) return await handleUpdateRecord(driverId, body)
    if (req.method === 'POST' && path.endsWith('/records/delete')) return await handleDeleteRecord(driverId, body)
    if (req.method === 'POST' && path.endsWith('/records/other-fees')) return await handleOtherFees(driverId, body)
    if (req.method === 'POST' && path.endsWith('/stats/monthly')) return await handleMonthlyStats(driverId, body)
    if (req.method === 'POST' && path.endsWith('/stats/overtime')) return await handleOvertimeCount(driverId, body)
    if (req.method === 'POST' && path.endsWith('/fund/stats')) return await handleFundStats(driverId, body)

    return json({ error: '未知接口' }, 404)
  } catch (e) {
    console.error('driver-api 异常:', e)
    return json({ error: (e as Error)?.message || '服务异常' }, 500)
  }
})
