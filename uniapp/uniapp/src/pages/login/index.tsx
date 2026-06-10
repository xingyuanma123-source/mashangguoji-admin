import {View, Text, Input, Button, Image} from '@tarojs/components'
import {useState} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {useAuth} from '@/contexts/AuthContext'
import {withRouteGuard, STORAGE_KEY_REDIRECT_PATH} from '@/components/RouteGuard'
import logoImage from '@/static/images/logo.png'

function Login() {
  const {signInWithDriver} = useAuth()
  // 记住上次登录账号：司机重新登录时免去重输
  const [username, setUsername] = useState<string>(() => Taro.getStorageSync('last_login_username') || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [agreeHint, setAgreeHint] = useState(false)
  const [loading, setLoading] = useState(false)

  // 登录页经 reLaunch 后是唯一页面，胶囊 home 键会跳回被守卫的首页又弹回来（死循环），直接隐藏
  useDidShow(() => {
    Taro.hideHomeButton?.()
  })

  const openLegal = (type: 'agreement' | 'privacy') => {
    Taro.navigateTo({url: `/pages/legal/index?type=${type}`})
  }

  const handleLogin = async () => {
    if (!username.trim()) {
      Taro.showToast({
        title: '请输入账号',
        icon: 'none'
      })
      return
    }

    if (!password.trim()) {
      Taro.showToast({
        title: '请输入密码',
        icon: 'none'
      })
      return
    }

    if (!agreed) {
      setAgreeHint(true)
      Taro.showToast({
        title: '请先阅读并同意用户协议和隐私政策',
        icon: 'none'
      })
      return
    }

    setLoading(true)

    const {error} = await signInWithDriver(username.trim(), password)

    setLoading(false)

    if (error) {
      Taro.showToast({
        title: error.message || '账号或密码错误',
        icon: 'none'
      })
      return
    }

    Taro.setStorageSync('last_login_username', username.trim())

    Taro.showToast({
      title: '登录成功',
      icon: 'success'
    })

    // 登录成功后跳转
    setTimeout(() => {
      const redirectPath = Taro.getStorageSync(STORAGE_KEY_REDIRECT_PATH)
      Taro.removeStorageSync(STORAGE_KEY_REDIRECT_PATH)

      if (redirectPath && redirectPath !== '/pages/login/index') {
        // 检查是否是 TabBar 页面
        const isTabBar = redirectPath.includes('/pages/submit/index') || 
                        redirectPath.includes('/pages/records/index') || 
                        redirectPath.includes('/pages/profile/index')
        
        if (isTabBar) {
          Taro.switchTab({url: redirectPath})
        } else {
          Taro.navigateTo({url: redirectPath})
        }
      } else {
        Taro.switchTab({url: '/pages/submit/index'})
      }
    }, 500)
  }

  return (
    <View className="page-shell flex flex-col">
      <View className="flex-1 flex flex-col items-center justify-center px-8">
        <View className="w-full max-w-md">
          <View className="flex flex-col items-center mb-12">
            {/* 公司 logo：透明底 PNG（static 资源引用，不内嵌 base64），与渐变背景自然融合 */}
            <Image
              src={logoImage}
              className="w-40 h-40 mb-2"
              mode="aspectFit"
              ariaLabel="广西马上国际货运代理有限公司"
            />
            <Text className="text-4xl font-bold text-foreground mt-5 mb-2">司机报账系统</Text>
            <Text className="text-xl text-muted-foreground">广西马上国际货代专用</Text>
          </View>

          <View className="surface-card p-6">
            <View className="flex flex-col space-y-6">
              <View className="flex flex-col space-y-2">
                <Text className="text-xl text-foreground font-medium">账号</Text>
                <View className="field-box bg-input rounded-xl border border-border px-4">
                  <View className="i-mdi-account-outline text-muted-foreground text-2xl mr-2 shrink-0" />
                  <Input
                    className="h-9 min-w-0 flex-1 text-foreground text-2xl"
                    placeholder="请输入账号"
                    ariaLabel="账号"
                    value={username}
                    onInput={(e) => setUsername(e.detail.value)}
                  />
                </View>
              </View>

              <View className="flex flex-col space-y-2">
                <Text className="text-xl text-foreground font-medium">密码</Text>
                <View className="field-box bg-input rounded-xl border border-border px-4">
                  <View className="i-mdi-lock-outline text-muted-foreground text-2xl mr-2 shrink-0" />
                  <Input
                    className="h-9 min-w-0 flex-1 text-foreground text-2xl"
                    placeholder="请输入密码"
                    ariaLabel="密码"
                    password={!showPassword}
                    confirmType="done"
                    value={password}
                    onInput={(e) => setPassword(e.detail.value)}
                    onConfirm={handleLogin}
                  />
                  <View
                    className="tap-target -mr-3 shrink-0 flex items-center justify-center"
                    role="button"
                    ariaRole="button"
                    ariaLabel={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword(!showPassword)}>
                    <View className={`${showPassword ? 'i-mdi-eye-off-outline' : 'i-mdi-eye-outline'} text-muted-foreground text-2xl`} />
                  </View>
                </View>
              </View>

              <View className="flex flex-row items-center">
                <View
                  className="tap-target -ml-2 flex items-center justify-center flex-shrink-0"
                  role="checkbox"
                  ariaRole="checkbox"
                  ariaLabel={agreed ? '已同意用户协议和隐私政策，点击取消同意' : '未同意用户协议和隐私政策，点击同意'}
                  onClick={() => {
                    setAgreeHint(false)
                    setAgreed(!agreed)
                  }}>
                  <View
                    className={`w-7 h-7 rounded border-2 flex items-center justify-center ${
                      agreed ? 'bg-primary border-primary' : agreeHint ? 'bg-background border-destructive' : 'bg-background border-border'
                    }`}>
                    {agreed && <View className="i-mdi-check text-primary-foreground text-xl" />}
                  </View>
                </View>
                <View className="flex-1 flex flex-row flex-wrap items-center">
                  <Text className={`text-lg ${agreeHint ? 'text-destructive' : 'text-muted-foreground'}`}>已阅读并同意</Text>
                  <View
                    className="inline-flex"
                    role="link"
                    ariaRole="link"
                    ariaLabel="查看用户协议"
                    onClick={() => openLegal('agreement')}>
                    <Text className="text-lg text-primary">《用户协议》</Text>
                  </View>
                  <View
                    className="inline-flex"
                    role="link"
                    ariaRole="link"
                    ariaLabel="查看隐私政策"
                    onClick={() => openLegal('privacy')}>
                    <Text className="text-lg text-primary">《隐私政策》</Text>
                  </View>
                </View>
              </View>

              <Button
                className="w-full bg-primary text-primary-foreground text-2xl font-medium rounded-xl"
                onClick={handleLogin}
                disabled={loading}>
                <View className="btn-jumbo flex items-center justify-center">
                  <Text>{loading ? '登录中...' : '登录'}</Text>
                </View>
              </Button>
            </View>
          </View>
        </View>
      </View>

      <View className="px-8 pb-8">
        <Text className="text-center text-xl text-muted-foreground">
          © 2026 司机报账系统
        </Text>
      </View>
    </View>
  )
}

export default withRouteGuard(Login)
