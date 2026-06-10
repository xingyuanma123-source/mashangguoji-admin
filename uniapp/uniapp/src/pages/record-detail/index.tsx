// 报账记录详情页
import {View, Text, Image, ScrollView} from '@tarojs/components'
import {useState, useEffect, useCallback} from 'react'
import Taro, {useDidShow} from '@tarojs/taro'
import {withRouteGuard} from '@/components/RouteGuard'
import type {ExpenseRecord, OtherFeeItem} from '@/db/types'
import {getExpenseRecordById, getSignedImageUrls} from '@/db/api'
import {parseFeeLocationDetail} from '@/utils/feeLocation'

function RecordDetail() {
  const [record, setRecord] = useState<ExpenseRecord | null>(null)
  const [otherFees, setOtherFees] = useState<OtherFeeItem[]>([])
  const [signedImages, setSignedImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const renderFeeItem = useCallback(
    (label: string, amount: number) => {
      if (amount <= 0 || !record) return null

      const locationDetails = parseFeeLocationDetail(record.fee_location_detail)[label] || []

      return (
        <View className="flex flex-col space-y-1">
          <View className="flex flex-row items-center justify-between">
            <Text className="text-xl text-muted-foreground">{label}</Text>
            <Text className="text-xl text-foreground font-medium">¥{amount.toFixed(2)}</Text>
          </View>
          {locationDetails.length > 0 && (
            <View className="flex flex-col space-y-1">
              {locationDetails.map((item, index) => (
                <Text key={`${label}-${item.location}-${index}`} className="text-lg text-muted-foreground">
                  {item.location}: ¥{item.amount.toFixed(2)}
                </Text>
              ))}
            </View>
          )}
        </View>
      )
    },
    [record]
  )

  const loadData = useCallback(async () => {
    const instance = Taro.getCurrentInstance()
    const id = instance.router?.params?.id

    if (!id) {
      Taro.showToast({
        title: '参数错误',
        icon: 'none'
      })
      return
    }

    setLoading(true)
    setLoadError(false)
    const recordId = Number(id)
    // 详情接口已内含其他费用，一次返回即可
    const {data, error} = await getExpenseRecordById(recordId)

    // 加载失败：标记错误，不要当成"记录不存在"
    if (error) {
      setLoadError(true)
      setLoading(false)
      return
    }

    setRecord(data)
    setOtherFees(data?.other_fees ?? [])

    // 私有桶：为已存图片换取临时可读链接（按下标对齐，失败留空串）
    const imgs = data?.receipt_images ?? []
    if (imgs.length > 0) {
      const {data: signed} = await getSignedImageUrls(imgs)
      setSignedImages(imgs.map((_, i) => signed[i] || ''))
    } else {
      setSignedImages([])
    }

    setLoading(false)
  }, [])

  useDidShow(() => {
    loadData()
  })

  useEffect(() => {
    loadData()
  }, [loadData])

  const previewImage = (index: number) => {
    const urls = signedImages.filter(Boolean)
    if (urls.length === 0) return
    Taro.previewImage({
      urls,
      current: signedImages[index] || urls[0]
    })
  }

  if (loading) {
    return (
      <View className="page-shell flex flex-col items-center justify-center">
        <View className="i-mdi-loading animate-spin text-primary text-6xl mb-4" />
        <Text className="text-xl text-muted-foreground">加载中...</Text>
      </View>
    )
  }

  if (loadError) {
    return (
      <View className="page-shell flex flex-col items-center justify-center px-8">
        <View className="i-mdi-cloud-alert-outline text-destructive text-6xl mb-4" />
        <Text className="text-2xl text-muted-foreground mb-5">加载失败，请检查网络</Text>
        <View
          className="btn-jumbo rounded-xl bg-primary px-10 flex items-center justify-center"
          role="button"
          ariaRole="button"
          ariaLabel="重试加载"
          onClick={loadData}>
          <Text className="text-xl text-primary-foreground font-medium">重试</Text>
        </View>
      </View>
    )
  }

  if (!record) {
    return (
      <View className="page-shell flex flex-col items-center justify-center">
        <View className="i-mdi-alert-circle text-muted-foreground text-6xl mb-4" />
        <Text className="text-2xl text-muted-foreground">记录不存在</Text>
      </View>
    )
  }

  return (
    <View className="page-shell">
      <ScrollView className="w-full" scrollY>
        <View className="px-4 py-6">
          <View className="surface-card p-5 mb-4">
            <View className="flex flex-row items-center justify-between mb-4">
              <Text className="text-plate text-foreground">{record.plate_number}</Text>
              {record.status === 'pending' ? (
                <View className="soft-chip bg-amber-100 border-amber-200 px-4 py-2">
                  <Text className="text-xl text-amber-700 font-semibold">待确认</Text>
                </View>
              ) : (
                <View className="soft-chip bg-emerald-100 border-emerald-200 px-4 py-2">
                  <Text className="text-xl text-emerald-700 font-semibold">已确认</Text>
                </View>
              )}
            </View>

            <View className="flex flex-col space-y-4">
              <View className="flex flex-row items-center justify-between">
                <Text className="text-xl text-muted-foreground">日期</Text>
                <Text className="text-xl text-foreground font-medium">{record.record_date}</Text>
              </View>

              {record.route && (
                <View className="flex flex-row items-center justify-between">
                  <Text className="text-xl text-muted-foreground">路线/地点</Text>
                  <Text className="text-xl text-foreground font-medium">{record.route}</Text>
                </View>
              )}
            </View>
          </View>

          <View className="surface-card p-5 mb-4">
            <Text className="text-2xl font-semibold text-foreground mb-4">费用明细</Text>
            <View className="flex flex-col space-y-3">
              {renderFeeItem('过磅费', record.fee_weighing)}
              {renderFeeItem('提柜费', record.fee_container)}
              {renderFeeItem('过夜费', record.fee_overnight)}
              {renderFeeItem('越南超时费', record.fee_vn_overtime)}
              {renderFeeItem('越南收钥匙', record.fee_vn_key)}
              {renderFeeItem('停车费', record.fee_parking)}
              {renderFeeItem('新岗', record.fee_newpost)}
              {renderFeeItem('打车', record.fee_taxi)}
              {renderFeeItem('淋水', record.fee_water)}
              {renderFeeItem('解篷布', record.fee_tarpaulin)}
              {renderFeeItem('高速费', record.fee_highway)}
              {renderFeeItem('盖章', record.fee_stamp)}
              {otherFees.length > 0 ? (
                otherFees.map((item) => (
                  <View key={item.id} className="flex flex-row items-center justify-between">
                    <Text className="text-xl text-muted-foreground">{item.name}</Text>
                    <Text className="text-xl text-foreground font-medium">¥{item.amount.toFixed(2)}</Text>
                  </View>
                ))
              ) : record.note_amount > 0 && (
                <View className="flex flex-col space-y-1">
                  <View className="flex flex-row items-center justify-between">
                    <Text className="text-xl text-muted-foreground">其他费用</Text>
                    <Text className="text-xl text-foreground font-medium">¥{record.note_amount.toFixed(2)}</Text>
                  </View>
                  {record.note_detail && (
                    <Text className="text-lg text-muted-foreground">{record.note_detail}</Text>
                  )}
                </View>
              )}

              <View className="h-px bg-border my-2" />

              <View className="flex flex-row items-center justify-between">
                <Text className="text-2xl text-foreground font-semibold">费用合计</Text>
                <Text className="text-money-hero text-primary">
                  ¥{record.total_expense.toFixed(2)}
                </Text>
              </View>

              {record.commission > 0 && (
                <View className="flex flex-row items-center justify-between">
                  <Text className="text-2xl text-foreground font-semibold">提成</Text>
                  <Text className="text-money text-green-700">
                    ¥{record.commission.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {record.receipt_images && record.receipt_images.length > 0 && (
            <View className="surface-card p-5 mb-4">
              <Text className="text-2xl font-semibold text-foreground mb-4">凭证图片</Text>
              <View className="flex flex-row flex-wrap gap-3">
                {record.receipt_images.map((img, index) => (
                  <Image
                    key={index}
                    src={signedImages[index] || ''}
                    className="w-32 h-32 rounded-xl"
                    mode="aspectFill"
                    ariaLabel={`预览第${index + 1}张凭证图片`}
                    onClick={() => previewImage(index)}
                  />
                ))}
              </View>
            </View>
          )}

          {record.status === 'confirmed' && (
            <View className="surface-card p-5 mb-4">
              <Text className="text-2xl font-semibold text-foreground mb-4">确认信息</Text>
              <View className="flex flex-col space-y-3">
                {record.confirmed_by && (
                  <View className="flex flex-row items-center justify-between">
                    <Text className="text-xl text-muted-foreground">确认人</Text>
                    <Text className="text-xl text-foreground font-medium">{record.confirmed_by}</Text>
                  </View>
                )}
                {record.confirmed_at && (
                  <View className="flex flex-row items-center justify-between">
                    <Text className="text-xl text-muted-foreground">确认时间</Text>
                    <Text className="text-xl text-foreground font-medium">
                      {new Date(record.confirmed_at).toLocaleString('zh-CN')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

export default withRouteGuard(RecordDetail)
