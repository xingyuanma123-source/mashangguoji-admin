import {useCallback, useEffect, useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'

// Public pages that don't require authentication
const PUBLIC_PAGE_PATHS = ['/pages/login/index']

const LOGIN_PAGE_PATH = '/pages/login/index'

// Storage key for saving redirect path after login
export const STORAGE_KEY_REDIRECT_PATH = 'loginRedirectPath'

// Throttled navigation to prevent duplicate redirects
let isNavigating = false
function navigateToLogin(currentPath: string): void {
  if (isNavigating) {
    return
  }

  isNavigating = true

  // Save current path for redirect after login
  Taro.setStorageSync(STORAGE_KEY_REDIRECT_PATH, currentPath)
  // reLaunch 清空页面栈：登录页成为唯一页面，返回键直接退出小程序。
  // 若用 navigateTo/redirectTo，返回会弹回被守卫的页面又被压回登录页，造成"退不出去"
  Taro.reLaunch({url: LOGIN_PAGE_PATH})

  // Reset flag after 100ms
  setTimeout(() => {
    isNavigating = false
  }, 100)
}

/**
 * Route guard component for authentication protection
 * @warning DO NOT use this component in app.tsx! Wrap pages with withRouteGuard HOC
 */
function RouteGuard({children}: {children: React.ReactNode}) {
  const {user, driver, loading} = useAuth()
  const [shouldRender, setShouldRender] = useState(false)

  const checkAuth = useCallback(() => {
    if (loading) {
      setShouldRender(false)
      return
    }

    const currentPath: string = Taro.getCurrentInstance()?.router?.path || ''

    // Allow access if user is authenticated or driver is logged in or page is public
    const isPublic = PUBLIC_PAGE_PATHS.some((publicPath) => currentPath?.includes(publicPath))
    if (user || driver || isPublic) {
      setShouldRender(true)
      return
    }
    if (currentPath && !currentPath?.includes(LOGIN_PAGE_PATH)) {
      navigateToLogin(currentPath)
      setShouldRender(false)
      return
    }
    setShouldRender(false)
  }, [user, driver, loading])

  // Check auth when page is shown (handles tab switching)
  useDidShow(() => {
    checkAuth()
  })

  // Check auth when component mounts or auth state changes
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!shouldRender) {
    return null
  }

  return <>{children}</>
}

/**
 * HOC to wrap a component with route guard
 * Usage: export default withRouteGuard(PageComponent)
 */
export function withRouteGuard<P extends object>(Component: React.ComponentType<P>) {
  return function GuardedComponent(props: P) {
    return (
      <RouteGuard>
        <Component {...props} />
      </RouteGuard>
    )
  }
}
