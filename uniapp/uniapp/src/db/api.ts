// 数据库查询 API —— 全部经 driver-api 云函数（service_role）访问，不再直连数据表。
// 对外函数名与返回结构保持不变，页面无需改动。
import type {Driver, ExpenseRecord, FeeType, FundStats, MonthlyStats, OtherFeeItem, Vehicle} from './types'
import {callEdge, setDriverToken} from './edge'

export type {Driver}

let activeVehiclesCache: Vehicle[] | null = null

function normalizePlateNumber(value: string) {
  return value.replace(/\s+/g, '').trim().toUpperCase()
}

// ==================== 司机相关 ====================

/** 验证司机登录：成功后保存令牌，返回司机信息 */
export async function verifyDriverLogin(username: string, password: string) {
  const {data, error} = await callEdge<{token: string; driver: Driver}>('/auth/login', {
    auth: false,
    body: {username, password}
  })
  if (error || !data?.token) {
    return {data: null, error: error || new Error('账号或密码错误')}
  }
  setDriverToken(data.token)
  return {data: data.driver as Driver, error: null}
}

/** 获取当前登录司机信息（令牌决定身份，入参仅为兼容旧签名） */
export async function getDriverById(_driverId: number) {
  const {data, error} = await callEdge<{data: Driver | null}>('/driver/me', {method: 'GET'})
  if (error) return {data: null, error}
  return {data: (data?.data ?? null) as Driver | null, error: null}
}

// ==================== 车辆相关 ====================

async function getActiveVehicles() {
  if (activeVehiclesCache) return {data: activeVehiclesCache, error: null}
  const {data, error} = await callEdge<{data: Vehicle[]}>('/vehicles/active', {method: 'GET'})
  if (error) return {data: [] as Vehicle[], error}
  activeVehiclesCache = Array.isArray(data?.data) ? (data as {data: Vehicle[]}).data : []
  return {data: activeVehiclesCache, error: null}
}

/** 搜索车牌号（模糊匹配） */
export async function searchVehicles(keyword: string) {
  const normalizedKeyword = normalizePlateNumber(keyword)
  if (!normalizedKeyword) return {data: [] as Vehicle[], error: null}

  const {data, error} = await getActiveVehicles()
  if (error) return {data: [] as Vehicle[], error}

  const matched = data
    .filter((v) => normalizePlateNumber(v.plate_number).includes(normalizedKeyword))
    .sort((a, b) => {
      const aP = normalizePlateNumber(a.plate_number)
      const bP = normalizePlateNumber(b.plate_number)
      const aStarts = aP.startsWith(normalizedKeyword) ? 0 : 1
      const bStarts = bP.startsWith(normalizedKeyword) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return aP.localeCompare(bP)
    })
    .slice(0, 10)

  return {data: matched, error: null}
}

/** 检查车牌号是否在库中 */
export async function checkVehicleExists(plateNumber: string) {
  const normalized = normalizePlateNumber(plateNumber)
  if (!normalized) return {exists: false, error: null}

  const {data, error} = await getActiveVehicles()
  if (error) return {exists: false, error}

  return {exists: data.some((v) => normalizePlateNumber(v.plate_number) === normalized), error: null}
}

// ==================== 费用类型相关 ====================

export async function getFeeTypes() {
  const {data, error} = await callEdge<{data: FeeType[]}>('/fee-types', {method: 'GET'})
  if (error) return {data: [] as FeeType[], error}
  return {data: (data?.data ?? []) as FeeType[], error: null}
}

// ==================== 报账记录相关 ====================

/** 批量创建报账记录（driver_id / status / commission 由服务端强制） */
export async function createExpenseRecords(records: Partial<ExpenseRecord>[]) {
  const {data, error} = await callEdge<{data: ExpenseRecord[]}>('/records/create', {body: {records}})
  if (error) return {data: [] as ExpenseRecord[], error}
  return {data: (data?.data ?? []) as ExpenseRecord[], error: null}
}

/** 创建单条报账记录 */
export async function createExpenseRecord(record: Partial<ExpenseRecord>) {
  const {data, error} = await createExpenseRecords([record])
  if (error) return {data: null, error}
  return {data: (data[0] ?? null) as ExpenseRecord | null, error: null}
}

/** 更新报账记录（仅本人且 pending，由服务端校验） */
export async function updateExpenseRecord(id: number, updates: Partial<ExpenseRecord>) {
  const {data, error} = await callEdge<{data: ExpenseRecord | null}>('/records/update', {body: {id, updates}})
  if (error) return {data: null, error}
  return {data: (data?.data ?? null) as ExpenseRecord | null, error: null}
}

/** 获取本人某月的报账记录 */
export async function getExpenseRecordsByMonth(_driverId: number, year: number, month: number) {
  const {data, error} = await callEdge<{data: ExpenseRecord[]}>('/records/by-month', {body: {year, month}})
  if (error) return {data: [] as ExpenseRecord[], error}
  return {data: (data?.data ?? []) as ExpenseRecord[], error: null}
}

/** 获取单条报账记录详情（含其他费用，仅本人） */
export async function getExpenseRecordById(id: number) {
  const {data, error} = await callEdge<{data: ExpenseRecord | null}>('/records/get', {body: {id}})
  if (error) return {data: null, error}
  return {data: (data?.data ?? null) as ExpenseRecord | null, error: null}
}

/** 获取某条记录的其他费用明细（仅本人） */
export async function fetchOtherFees(recordId: number) {
  const {data, error} = await callEdge<{data: OtherFeeItem[]}>('/records/other-fees', {body: {recordId}})
  if (error) return {data: [] as OtherFeeItem[], error}
  return {data: (data?.data ?? []) as OtherFeeItem[], error: null}
}

/** 删除报账记录（仅本人且 pending） */
export async function deleteExpenseRecord(id: number) {
  const {error} = await callEdge('/records/delete', {body: {id}})
  return {error}
}

// ==================== 统计相关 ====================

export async function getMonthlyStats(_driverId: number, year: number, month: number) {
  const fallback: MonthlyStats = {
    total_expense: 0,
    total_commission: 0,
    overtime_count: 0,
    pending_count: 0,
    confirmed_count: 0
  }
  const {data, error} = await callEdge<{data: MonthlyStats}>('/stats/monthly', {body: {year, month}})
  if (error) return {data: fallback, error}
  return {data: (data?.data ?? fallback) as MonthlyStats, error: null}
}

export async function getOvertimeCount(_driverId: number, year: number, month: number) {
  const {data, error} = await callEdge<{count: number}>('/stats/overtime', {body: {year, month}})
  if (error) return {count: 0, error}
  return {count: data?.count ?? 0, error: null}
}

// ==================== 备用金相关 ====================

export async function getFundStats(_driverId: number, year: number, month: number) {
  const fallback: FundStats = {total_recharge: 0, total_expense: 0, balance: 0, records: []}
  const {data, error} = await callEdge<{data: FundStats}>('/fund/stats', {body: {year, month}})
  if (error) return {data: fallback, error}
  return {data: (data?.data ?? fallback) as FundStats, error: null}
}

// ==================== 合并接口（减少往返，提升速度）====================

/** 记录页：一次返回 records + stats（含 overtime_count） */
export async function getRecordsPage(_driverId: number, year: number, month: number) {
  const fallback = {
    records: [] as ExpenseRecord[],
    stats: {total_expense: 0, total_commission: 0, overtime_count: 0, pending_count: 0, confirmed_count: 0} as MonthlyStats
  }
  const {data, error} = await callEdge<{data: {records: ExpenseRecord[]; stats: MonthlyStats}}>('/records/page', {
    body: {year, month}
  })
  if (error) return {data: fallback, error}
  return {data: (data?.data ?? fallback), error: null}
}

/** 我的页：一次返回 fund + overtime_count */
export async function getProfileSummary(_driverId: number, year: number, month: number) {
  const fallback = {
    fund: {total_recharge: 0, total_expense: 0, balance: 0, records: []} as FundStats,
    overtime_count: 0
  }
  const {data, error} = await callEdge<{data: {fund: FundStats; overtime_count: number}}>('/profile/summary', {
    body: {year, month}
  })
  if (error) return {data: fallback, error}
  return {data: (data?.data ?? fallback), error: null}
}
