// @ts-nocheck

import {createClient} from '@supabase/supabase-js'
import Taro, {showToast} from '@tarojs/taro'

// Supabase 数据库配置
export const SUPABASE_URL: string = process.env.TARO_APP_SUPABASE_URL
if (!SUPABASE_URL) {
  throw new Error('缺少环境变量 TARO_APP_SUPABASE_URL')
}
export const SUPABASE_ANON_KEY: string = process.env.TARO_APP_SUPABASE_ANON_KEY
if (!SUPABASE_ANON_KEY) {
  throw new Error('缺少环境变量 TARO_APP_SUPABASE_ANON_KEY')
}
const appId: string = process.env.TARO_APP_APP_ID
if (!appId) {
  throw new Error('缺少环境变量 TARO_APP_APP_ID')
}

let noticed = false
export const customFetch: typeof fetch = async (url: string, options: RequestInit) => {
  let headers: HeadersInit = options.headers || {}
  const {method = 'GET', body} = options

  if (options.headers instanceof Map) {
    headers = Object.fromEntries(options.headers)
  }

  const res = await Taro.request({
    url,
    method: method as keyof Taro.request.Method,
    header: headers,
    data: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  })

  // 全局启停提示
  if (res.statusCode > 300 && res.data?.code === 'SupabaseNotReady' && !noticed) {
    const tip = res.data.message || res.data.msg || '服务端报错'
    noticed = true
    showToast({
      title: tip,
      icon: 'error',
      duration: 5000
    })
  }

  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => res.data,
    text: async () => JSON.stringify(res.data),
    data: res.data, // 兼容小程序的返回格式
    headers: {
      get: (key: string) => res.header?.[key] || res.header?.[key?.toLowerCase()]
    }
  } as unknown as Response
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: {
    fetch: customFetch
  },
  auth: {
    storageKey: `${appId}-auth-token`
  }
})
