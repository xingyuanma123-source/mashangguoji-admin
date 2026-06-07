// 云门卫（driver-api Edge Function）调用层
// 小程序所有数据访问都经此层：带上 anon apikey（过网关）+ 司机令牌（x-driver-token）。
import Taro from '@tarojs/taro'
import {SUPABASE_ANON_KEY, SUPABASE_URL} from '@/client/supabase'

const FN_BASE = `${SUPABASE_URL}/functions/v1/driver-api`
const TOKEN_KEY = 'driver_token'

export function getDriverToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}
export function setDriverToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token)
}
export function clearDriverToken(): void {
  Taro.removeStorageSync(TOKEN_KEY)
}

export interface EdgeResult<T> {
  data: T | null
  error: Error | null
  status: number
}

interface CallOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: boolean
}

// 调用云函数。返回 {data: 整个响应体, error, status}
export async function callEdge<T = any>(path: string, opts: CallOptions = {}): Promise<EdgeResult<T>> {
  const {method = 'POST', body, auth = true} = opts

  const header: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  }
  if (auth) {
    const token = getDriverToken()
    if (token) header['x-driver-token'] = token
  }

  try {
    const res = await Taro.request({
      url: `${FN_BASE}${path}`,
      method,
      header,
      data: body ?? undefined
    })

    const status = res.statusCode
    const payload = res.data as any

    if (status < 200 || status >= 300) {
      // 令牌失效：清掉本地登录态，交由路由守卫跳登录
      if (status === 401) {
        clearDriverToken()
        Taro.removeStorageSync('driver_info')
      }
      return {data: null, error: new Error(payload?.error || `请求失败(${status})`), status}
    }

    return {data: payload as T, error: null, status}
  } catch (e) {
    return {data: null, error: e as Error, status: 0}
  }
}
