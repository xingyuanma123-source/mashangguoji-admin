// 费用校验规则（首页报账 / 记录编辑页共用）
//
// 原则：只拦截"会算错账"的费用行，其余一律放行。
// - 整车无费用、空费用行、金额为 0、"其他"费用未写名称（且无金额）等都允许，
//   因为可能存在"只出车、没费用"的情况。
// - 唯一会造成合计对不上账的是：某行填了金额，但这笔金额无法归入任何费用字段/明细
//   （合计 total 会累加所有行的金额，而费用字段只在选了类型 / "其他"填了名称时才写入）。
import type {FeeItem} from '@/db/types'

// 校验一组费用明细，返回第一条错误信息（无错误返回 null）
export function validateFeeItems(feeItems: FeeItem[]): string | null {
  for (const item of feeItems) {
    const amount = item.amount || 0

    // 金额为 0 / 空行：可能只出车无费用，放行
    if (amount <= 0) continue

    // 有金额但没选类型：金额会进合计，却进不了任何费用字段 → 合计对不上账
    if (!item.field_name) {
      return '有费用填了金额但没选类型，请补选费用类型'
    }

    // "其他"费用有金额但没写名称：金额会进合计，却没有对应明细 → 合计对不上账
    if (item.field_name === 'other' && !item.note?.trim()) {
      return '有"其他"费用填了金额但没写名称，请补写名称'
    }
  }

  return null
}
