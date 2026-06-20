import type { Contract, ContractCategory, ContractStatus } from '@/types/legal';

export type EffectiveContractStatus = ContractStatus | 'expired';

export interface ContractFormValues {
  title: string;
  contract_no: string;
  counterparty: string;
  category: ContractCategory;
  amount: string;
  currency: string;
  sign_date: string;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  renew_notice_days: string;
  owner_staff_id: string;
  remark: string;
  ocr_text: string;
  renewed_from_id: number | null;
}

export const emptyContractForm: ContractFormValues = {
  title: '',
  contract_no: '',
  counterparty: '',
  category: 'other',
  amount: '',
  currency: 'CNY',
  sign_date: '',
  start_date: '',
  end_date: '',
  auto_renew: false,
  renew_notice_days: '',
  owner_staff_id: '',
  remark: '',
  ocr_text: '',
  renewed_from_id: null,
};

export const EDITABLE_CONTRACT_FIELDS = [
  'title', 'contract_no', 'counterparty', 'category', 'amount', 'currency',
  'sign_date', 'start_date', 'end_date', 'auto_renew', 'renew_notice_days',
  'owner_staff_id', 'remark',
] as const;

export function getEffectiveContractStatus(contract: Contract, today = new Date().toISOString().slice(0, 10)): EffectiveContractStatus {
  if (contract.status === 'active' && contract.end_date && contract.end_date < today) return 'expired';
  return contract.status;
}

export function contractToForm(contract: Contract): ContractFormValues {
  return {
    title: contract.title,
    contract_no: contract.contract_no || '',
    counterparty: contract.counterparty,
    category: contract.category,
    amount: contract.amount == null ? '' : String(contract.amount),
    currency: contract.currency,
    sign_date: contract.sign_date || '',
    start_date: contract.start_date || '',
    end_date: contract.end_date || '',
    auto_renew: contract.auto_renew,
    renew_notice_days: contract.renew_notice_days == null ? '' : String(contract.renew_notice_days),
    owner_staff_id: contract.owner_staff_id == null ? '' : String(contract.owner_staff_id),
    remark: contract.remark || '',
    ocr_text: contract.ocr_text || '',
    renewed_from_id: contract.renewed_from_id || null,
  };
}

export function buildRenewalDraft(contract: Contract): ContractFormValues {
  return {
    ...emptyContractForm,
    title: contract.title,
    counterparty: contract.counterparty,
    category: contract.category,
    amount: contract.amount == null ? '' : String(contract.amount),
    currency: contract.currency,
    auto_renew: contract.auto_renew,
    renew_notice_days: contract.renew_notice_days == null ? '' : String(contract.renew_notice_days),
    owner_staff_id: contract.owner_staff_id == null ? '' : String(contract.owner_staff_id),
    renewed_from_id: contract.id,
  };
}

function comparableContractValue(contract: Contract, field: typeof EDITABLE_CONTRACT_FIELDS[number]) {
  const value = contract[field];
  if (field === 'amount' || field === 'renew_notice_days' || field === 'owner_staff_id') {
    return value == null ? '' : String(value);
  }
  return value == null ? '' : value;
}

export function getChangedContractFields(contract: Contract, form: ContractFormValues) {
  return EDITABLE_CONTRACT_FIELDS.filter((field) => comparableContractValue(contract, field) !== form[field]);
}

export function formToContractPatch(form: ContractFormValues) {
  return {
    title: form.title.trim(),
    contract_no: form.contract_no.trim() || null,
    counterparty: form.counterparty.trim(),
    category: form.category,
    amount: form.amount ? Number(form.amount) : null,
    currency: form.currency.trim() || 'CNY',
    sign_date: form.sign_date || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    auto_renew: form.auto_renew,
    renew_notice_days: form.renew_notice_days ? Number(form.renew_notice_days) : null,
    owner_staff_id: form.owner_staff_id ? Number(form.owner_staff_id) : null,
    remark: form.remark.trim() || null,
  };
}
