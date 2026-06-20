// 加载失败提示横幅（带重试），用于区分"加载失败"与"无数据/真零值"
import {Text, View} from '@tarojs/components'

interface LoadErrorBannerProps {
  onRetry: () => void
  message?: string
}

export default function LoadErrorBanner({onRetry, message = '加载失败，请检查网络后重试'}: LoadErrorBannerProps) {
  return (
    <View className="mb-4 flex flex-row items-center justify-between rounded-2xl bg-destructive/10 px-4 py-3">
      <View className="mr-2 flex min-w-0 flex-1 flex-row items-center gap-2">
        <View className="i-mdi-cloud-alert-outline shrink-0 text-2xl text-destructive" />
        <Text className="text-lg text-destructive">{message}</Text>
      </View>
      <View
        className="tap-target shrink-0 rounded-lg bg-destructive px-5 flex items-center justify-center"
        role="button"
        ariaRole="button"
        ariaLabel="重试加载"
        onClick={onRetry}>
        <Text className="text-lg font-medium text-destructive-foreground">重试</Text>
      </View>
    </View>
  )
}
