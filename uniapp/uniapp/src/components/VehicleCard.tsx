// 车辆卡片组件
import {View, Text, Input, Image} from '@tarojs/components'
import {useState, useEffect} from 'react'
import Taro from '@tarojs/taro'
import type {VehicleCard, FeeType, FeeItem} from '@/db/types'
import {searchVehicles, checkVehicleExists} from '@/db/api'
import {chooseImages} from '@/utils/upload'
import FeeRow from './FeeRow'

interface VehicleCardProps {
  card: VehicleCard
  feeTypes: FeeType[]
  onChange: (card: VehicleCard) => void
  onDelete: () => void
}

export default function VehicleCardComponent({card, feeTypes, onChange, onDelete}: VehicleCardProps) {
  const [plateSearch, setPlateSearch] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [plateValid, setPlateValid] = useState<'valid' | 'invalid' | 'unknown'>('unknown')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (card.plate_number) {
      checkVehicleExists(card.plate_number).then(({exists}) => {
        setPlateValid(exists ? 'valid' : 'invalid')
      })
    }
  }, [card.plate_number])

  const handlePlateSearch = async (value: string) => {
    setPlateSearch(value)
    onChange({...card, plate_number: value})

    if (value.length >= 2) {
      const {data} = await searchVehicles(value)
      setSearchResults(data.map((v) => v.plate_number))
      setShowSearch(true)
    } else {
      setSearchResults([])
      setShowSearch(false)
    }
  }

  const selectPlate = (plate: string) => {
    setPlateSearch(plate)
    onChange({...card, plate_number: plate})
    setShowSearch(false)
  }

  const addFeeItem = () => {
    const newItem: FeeItem = {
      id: `fee_${Date.now()}_${Math.random()}`,
      field_name: '',
      display_name: '',
      amount: 0
    }
    onChange({
      ...card,
      fee_items: [...card.fee_items, newItem]
    })
  }

  const updateFeeItem = (index: number, item: FeeItem) => {
    const newItems = [...card.fee_items]
    newItems[index] = item
    const total = newItems.reduce((sum, fee) => sum + (fee.amount || 0), 0)
    onChange({
      ...card,
      fee_items: newItems,
      total
    })
  }

  const deleteFeeItem = (index: number) => {
    const newItems = card.fee_items.filter((_, i) => i !== index)
    const total = newItems.reduce((sum, fee) => sum + (fee.amount || 0), 0)
    onChange({
      ...card,
      fee_items: newItems,
      total
    })
  }

  const handleChooseImages = async () => {
    const currentCount = card.receipt_images.length
    const maxCount = 9 - currentCount

    if (maxCount <= 0) {
      Taro.showToast({
        title: '最多上传9张图片',
        icon: 'none'
      })
      return
    }

    const images = await chooseImages(maxCount)
    if (images.length > 0) {
      onChange({
        ...card,
        receipt_images: [...card.receipt_images, ...images]
      })
    }
  }

  const deleteImage = (index: number) => {
    const newImages = card.receipt_images.filter((_, i) => i !== index)
    onChange({
      ...card,
      receipt_images: newImages
    })
  }

  const previewImage = (index: number) => {
    Taro.previewImage({
      urls: card.receipt_images.map((img) => img.path),
      current: card.receipt_images[index].path
    })
  }

  const borderColor =
    plateValid === 'valid'
      ? 'border-green-500'
      : plateValid === 'invalid'
        ? 'border-orange-500'
        : 'border-border'

  return (
    <View className="surface-card p-4 mb-4">
      <View className="flex flex-row items-center justify-between" onClick={() => setCollapsed(!collapsed)}>
        <View className="flex-1">
          <Text className="text-xl font-semibold text-foreground">{card.plate_number || '车辆信息'}</Text>
          <View className="mt-1 inline-flex soft-chip px-3 py-1">
            <Text className="text-base text-primary">小计 ¥{card.total.toFixed(2)}</Text>
          </View>
        </View>

        <View className="flex flex-row items-center gap-2">
          <View
            className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation?.()
              onDelete()
            }}>
            <View className="i-mdi-delete text-destructive text-xl" />
          </View>
          <View className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
            <View className={`${collapsed ? 'i-mdi-chevron-down' : 'i-mdi-chevron-up'} text-muted-foreground text-xl`} />
          </View>
        </View>
      </View>

      {!collapsed && (
        <View className="mt-4 flex flex-col gap-4">
          <View>
            <Text className="text-base text-muted-foreground mb-2 block">车牌号</Text>
            <View className={`rounded-xl border-2 ${borderColor} bg-background px-3 py-3`}>
              <Input
                className="w-full text-lg text-foreground"
                placeholder="输入车牌号搜索"
                value={plateSearch || card.plate_number}
                onInput={(e) => handlePlateSearch(e.detail.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearch(true)
                }}
              />
            </View>
            {plateValid === 'invalid' && (
              <Text className="mt-2 text-base text-orange-500">该车牌不在公司车辆库中</Text>
            )}
            {showSearch && searchResults.length > 0 && (
              <View className="mt-2 rounded-xl border border-border bg-card overflow-hidden">
                {searchResults.map((plate) => (
                  <View key={plate} className="px-3 py-2 border-b border-border" onClick={() => selectPlate(plate)}>
                    <Text className="text-base text-foreground">{plate}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View>
            <Text className="text-base text-muted-foreground mb-2 block">路线/地点（选填）</Text>
            <View className="rounded-xl border border-border bg-background px-3 py-3">
              <Input
                className="w-full text-lg text-foreground"
                placeholder="如：越南-桂福"
                value={card.route}
                onInput={(e) => onChange({...card, route: e.detail.value})}
              />
            </View>
          </View>

          <View>
            <View className="flex flex-row items-center justify-between mb-2">
              <Text className="text-base text-muted-foreground">费用明细</Text>
              <View className="soft-chip px-3 py-1">
                <Text className="text-sm text-muted-foreground">{card.fee_items.length} 项</Text>
              </View>
            </View>
            <View className="flex flex-col gap-2">
              {card.fee_items.map((item, index) => (
                <FeeRow
                  key={item.id}
                  feeItem={item}
                  feeTypes={feeTypes}
                  onChange={(newItem) => updateFeeItem(index, newItem)}
                  onDelete={() => deleteFeeItem(index)}
                />
              ))}
            </View>
            <View className="mt-2 rounded-xl border border-dashed border-primary/60 bg-primary/5 py-3 flex items-center justify-center" onClick={addFeeItem}>
              <Text className="text-base font-medium text-primary">+ 添加费用</Text>
            </View>
          </View>

          <View>
            <Text className="text-base text-muted-foreground mb-2 block">凭证图片（最多9张）</Text>
            <View className="flex flex-row flex-wrap gap-2">
              {card.receipt_images.map((img, index) => (
                <View key={index} className="relative h-20 w-20">
                  <Image
                    src={img.path}
                    className="h-full w-full rounded-lg"
                    mode="aspectFill"
                    onClick={() => previewImage(index)}
                  />
                  <View
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive flex items-center justify-center"
                    onClick={() => deleteImage(index)}>
                    <View className="i-mdi-close text-white text-sm" />
                  </View>
                </View>
              ))}
              {card.receipt_images.length < 9 && (
                <View
                  className="h-20 w-20 rounded-lg border border-dashed border-border bg-muted/50 flex flex-col items-center justify-center"
                  onClick={handleChooseImages}>
                  <View className="i-mdi-camera-plus text-muted-foreground text-2xl" />
                  <Text className="text-xs text-muted-foreground mt-1">上传</Text>
                </View>
              )}
            </View>
          </View>

          <View className="rounded-xl bg-primary/10 px-3 py-3 flex flex-row items-center justify-between">
            <Text className="text-base text-foreground font-medium">本车费用小计</Text>
            <Text className="text-xl font-bold text-primary">¥{card.total.toFixed(2)}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
