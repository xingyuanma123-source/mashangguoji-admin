import {ScrollView, Text, View} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {useEffect} from 'react'

type LegalType = 'agreement' | 'privacy'

interface LegalSection {
  title: string
  paragraphs: string[]
}

const agreementSections: LegalSection[] = [
  {
    title: '一、适用范围',
    paragraphs: [
      '本用户协议适用于广西马上国际货代内部使用的司机报账系统。系统用于司机提交工作相关费用、凭证和加班信息，并供公司人员审核、统计与管理。',
      '本系统仅供获得公司授权的人员使用，不面向社会公众提供服务。'
    ]
  },
  {
    title: '二、账号使用',
    paragraphs: [
      '使用人应妥善保管账号和密码，不得将账号转借给他人。发现账号异常、密码泄露或无法登录时，应及时联系公司管理员。',
      '公司可根据人员在职状态和工作安排启用、停用或调整账号权限。'
    ]
  },
  {
    title: '三、报账责任',
    paragraphs: [
      '使用人应根据实际业务情况填写报账日期、车牌号、费用金额、费用名称、路线地点和凭证图片，并在提交前核对内容。',
      '记录在客服确认前可按系统功能修改；确认后的记录将锁定并进入公司汇总数据。如需更正已确认记录，请联系公司管理员处理。'
    ]
  },
  {
    title: '四、合理使用',
    paragraphs: [
      '不得利用本系统提交虚假、违法或与工作无关的信息，不得尝试获取无权访问的数据，也不得干扰系统正常运行。',
      '因网络、设备或系统维护导致操作中断时，请检查草稿和记录状态，避免重复提交。'
    ]
  },
  {
    title: '五、说明更新与联系',
    paragraphs: [
      '系统功能或公司管理要求调整时，本协议可能同步更新。具体业务规则以公司正式通知和管理制度为准。',
      '对账号、报账记录或本协议有疑问时，请联系公司管理员或客服人员。'
    ]
  }
]

const privacySections: LegalSection[] = [
  {
    title: '一、处理的信息',
    paragraphs: [
      '为完成司机报账和内部管理，系统会处理账号、司机姓名、报账日期、车牌号、路线地点、费用明细、加班标记、报账状态和确认信息。',
      '当使用人主动上传凭证时，系统还会处理相应的图片文件。请勿上传与报账无关的个人信息或第三方敏感信息。'
    ]
  },
  {
    title: '二、使用目的',
    paragraphs: [
      '上述信息用于身份识别、报账提交与审核、费用统计、备用金核对、加班统计、记录查询以及必要的内部问题排查。',
      '系统不会将报账信息用于与公司业务管理无关的公开展示。'
    ]
  },
  {
    title: '三、访问与保存',
    paragraphs: [
      '报账信息仅供获得相应权限的司机、客服和管理人员访问。凭证图片会上传至系统配置的存储服务。',
      '信息保存期限和归档方式按公司财务、业务管理及适用要求执行。'
    ]
  },
  {
    title: '四、使用人的选择',
    paragraphs: [
      '路线地点、备注和凭证图片等非必填内容可由使用人根据实际业务需要提交。必填内容缺失时，系统可能无法完成报账。',
      '如需查询、更正账号信息或处理无法自行修改的记录，请联系公司管理员或客服人员。'
    ]
  },
  {
    title: '五、安全提示',
    paragraphs: [
      '请勿向他人泄露账号密码，不要在公共设备上保存登录信息。发现异常记录或疑似信息泄露时，请立即联系公司管理员。',
      '本隐私政策用于说明当前系统的信息处理方式；如系统功能发生变化，相关说明会同步更新。'
    ]
  }
]

export default function Legal() {
  const type = (Taro.getCurrentInstance().router?.params?.type || 'agreement') as LegalType
  const isPrivacy = type === 'privacy'
  const title = isPrivacy ? '隐私政策' : '用户协议'
  const sections = isPrivacy ? privacySections : agreementSections

  useEffect(() => {
    Taro.setNavigationBarTitle({title})
  }, [title])

  return (
    <View className="page-shell">
      <ScrollView className="w-full" scrollY>
        <View className="px-4 py-5">
          <View className="surface-card p-5 mb-4">
            <Text className="text-2xl font-bold text-foreground block">{title}</Text>
            <Text className="text-sm text-muted-foreground mt-2 block">更新日期：2026年6月7日</Text>
            <Text className="text-sm text-muted-foreground mt-3 block">
              本说明适用于公司内部司机报账系统。如与公司正式制度或通知不一致，以公司正式制度或通知为准。
            </Text>
          </View>

          {sections.map((section) => (
            <View key={section.title} className="surface-card p-5 mb-4">
              <Text className="text-lg font-semibold text-foreground mb-3 block">{section.title}</Text>
              {section.paragraphs.map((paragraph) => (
                <Text key={paragraph} className="text-base text-muted-foreground leading-7 mb-3 last:mb-0 block">
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
