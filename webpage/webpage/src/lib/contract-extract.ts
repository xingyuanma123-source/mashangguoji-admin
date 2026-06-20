import { chatWithModel } from '@/lib/model';
import type { ContractFinding, RiskLevel } from '@/types/legal';

const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;
const CONTRACT_TEXT_LIMIT = 12_000;

export function parseModelJson<T = Record<string, unknown>>(raw: string): T {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const json = unfenced.match(JSON_OBJECT_PATTERN)?.[0];
  if (!json) throw new Error('AI 未返回有效 JSON，请人工录入或重试。');
  return JSON.parse(json) as T;
}

function dateDiffInDays(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function getContractAlertLevel(params: {
  endDate: string;
  today: string;
  autoRenew: boolean;
  renewNoticeDays?: number | null;
}) {
  const daysLeft = dateDiffInDays(params.endDate, params.today);
  const effectiveDaysLeft = params.autoRenew && params.renewNoticeDays != null
    ? daysLeft - params.renewNoticeDays
    : daysLeft;
  const level = effectiveDaysLeft <= 30 ? 30 : effectiveDaysLeft <= 60 ? 60 : effectiveDaysLeft <= 90 ? 90 : null;
  return { level, effectiveDaysLeft };
}

export async function extractContractFields(text: string) {
  const result = await chatWithModel([
    {
      role: 'system',
      content: '你是合同信息抽取器。只输出 JSON，不要 Markdown。日期用 YYYY-MM-DD；未知字段用 null。',
    },
    {
      role: 'user',
      content: `抽取 title, contract_no, counterparty, category, amount, currency, sign_date, start_date, end_date, auto_renew, renew_notice_days。category 仅可为 transport/lease/labor/purchase/service/other。\n\n${text.slice(0, CONTRACT_TEXT_LIMIT)}`,
    },
  ]);
  return parseModelJson(result);
}

export async function scanContractRisk(contractText: string, templateText?: string | null) {
  const templateSection = templateText
    ? `\n\n标准模板：\n${templateText.slice(0, CONTRACT_TEXT_LIMIT)}`
    : '';
  const result = await chatWithModel([
    {
      role: 'system',
      content: '你是合同风险审查器。只输出 JSON：risk_level(high/medium/low), summary, findings[]；每条 finding 包含 clause, risk, suggestion, severity。重点检查违约责任缺失、单方解除权、管辖仲裁、自动续约、付款发票、保密竞业、不可抗力。',
    },
    {
      role: 'user',
      content: `审查合同${templateText ? '并列出偏离标准模板的条款' : ''}：\n${contractText.slice(0, CONTRACT_TEXT_LIMIT)}${templateSection}`,
    },
  ]);
  return parseModelJson<{ risk_level: RiskLevel; summary: string; findings: ContractFinding[] }>(result);
}
