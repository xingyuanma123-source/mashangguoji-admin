import { describe, expect, it } from 'vitest';

import { buildRenewalDraft, getChangedContractFields, getEffectiveContractStatus } from './legal-contracts';
import type { Contract } from '@/types/legal';

const contract: Contract = {
  id: 7,
  title: '跨境运输合同',
  contract_no: 'MS-001',
  counterparty: '测试客户',
  category: 'transport',
  amount: 12000,
  currency: 'CNY',
  sign_date: '2026-01-01',
  start_date: '2026-01-01',
  end_date: '2026-06-01',
  auto_renew: true,
  renew_notice_days: 30,
  owner_staff_id: 2,
  status: 'active',
  renewed_from_id: null,
  remark: '原备注',
  ocr_text: '合同正文',
  extracted: null,
  created_by: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('getEffectiveContractStatus', () => {
  it('将已过期的履行中合同显示为 expired', () => {
    expect(getEffectiveContractStatus(contract, '2026-06-11')).toBe('expired');
  });

  it('保留已续约等数据库状态', () => {
    expect(getEffectiveContractStatus({ ...contract, status: 'renewed' }, '2026-06-11')).toBe('renewed');
  });
});

describe('buildRenewalDraft', () => {
  it('继承业务字段并清空新周期与编号', () => {
    expect(buildRenewalDraft(contract)).toMatchObject({
      title: '跨境运输合同',
      contract_no: '',
      counterparty: '测试客户',
      category: 'transport',
      amount: '12000',
      currency: 'CNY',
      sign_date: '',
      start_date: '',
      end_date: '',
      auto_renew: true,
      renew_notice_days: '30',
      renewed_from_id: 7,
      ocr_text: '',
    });
  });
});

describe('getChangedContractFields', () => {
  it('只返回允许编辑且发生变化的字段', () => {
    expect(getChangedContractFields(contract, {
      title: '新标题',
      contract_no: 'MS-001',
      counterparty: '测试客户',
      category: 'transport',
      amount: '15000',
      currency: 'CNY',
      sign_date: '2026-01-01',
      start_date: '2026-01-01',
      end_date: '2026-06-01',
      auto_renew: true,
      renew_notice_days: '30',
      owner_staff_id: '2',
      remark: '原备注',
      ocr_text: '不应参与比较',
      renewed_from_id: null,
    })).toEqual(['title', 'amount']);
  });
});
