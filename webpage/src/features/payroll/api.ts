import { supabase } from '@/lib/supabase';

import {
  calculateCommissionPoolTotal,
  calculateGrossNetSalary,
  calculateWeightedDriverCommissions,
  roundMoney,
  type GrossNetInput,
  type PayrollPersonType,
} from './logic';

export interface DriverAdvanceBalance {
  driver_id: number;
  driver_name: string;
  period: string;
  advance_issued: number;
  advance_spent: number;
  balance: number;
}

export interface MonthlyAdvanceTopUpResult {
  inserted: number;
  skipped: number;
}

export interface DriverCommissionSettlementInput {
  driverId: number;
  driverName: string;
  payeeName?: string | null;
  rawCommission: number;
  transportFee: number;
  attendanceDays: number;
}

export interface CommissionPoolParticipantInput {
  staffId: number;
  staffName: string;
  isDivisor: boolean;
}

export interface CommissionPoolSettlementInput {
  period: string;
  tripCount: number;
  participants: CommissionPoolParticipantInput[];
}

export interface CommissionPoolSettlementResult {
  settlementId: number;
  poolTotal: number;
  divisor: number;
  perShare: number;
}

export interface SalaryDraftPersonInput extends GrossNetInput {
  personType: PayrollPersonType;
  personId: number;
  personName: string;
  payeeName?: string | null;
  jobTitle?: string | null;
  isFixedSalary?: boolean;
  monthDays?: number;
  leaveDays?: number;
  restDays?: number;
  hasStatutoryHoliday?: boolean;
  usedSubstitute?: boolean;
  note?: string | null;
}

export interface SalaryDraftRecord extends SalaryDraftPersonInput {
  period: string;
  monthDays: number;
  grossSalary: number;
  netSalary: number;
  status: 'draft';
}

const ADVANCE_WARN_THRESHOLD = 200;

function daysInPeriod(period: string): number {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) {
    throw new Error(`Invalid period: ${period}`);
  }
  return new Date(year, month, 0).getDate();
}

function isUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === '23505' || /duplicate key|unique/i.test(candidate.message ?? '');
}

export async function getDriverAdvanceBalances(period: string): Promise<DriverAdvanceBalance[]> {
  const { data, error } = await supabase
    .from('driver_advance_balance')
    .select('*')
    .eq('period', period)
    .order('driver_name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DriverAdvanceBalance[];
}

export async function getAdvanceBalanceWarnings(period: string): Promise<DriverAdvanceBalance[]> {
  const rows = await getDriverAdvanceBalances(period);
  return rows.filter((row) => Number(row.balance) < ADVANCE_WARN_THRESHOLD);
}

export async function topUpMonthlyAdvances(
  period: string,
  fundDate: string,
): Promise<MonthlyAdvanceTopUpResult> {
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('id,name,monthly_advance_default')
    .eq('is_active', true);

  if (error) throw error;

  let inserted = 0;
  let skipped = 0;
  for (const driver of (drivers ?? []) as Array<{ id: number; monthly_advance_default?: number | null }>) {
    const { error: insertError } = await supabase
      .from('advance_fund_records')
      .insert({
        driver_id: driver.id,
        amount: Number(driver.monthly_advance_default ?? 1000),
        fund_date: fundDate,
        month: period,
        note: '月初充值',
      });

    if (insertError) {
      if (isUniqueConflict(insertError)) {
        skipped += 1;
        continue;
      }
      throw insertError;
    }
    inserted += 1;
  }

  return { inserted, skipped };
}

export async function finalizeMonthlySalaryRecords(period: string): Promise<SalaryDraftRecord[]> {
  const balances = await getDriverAdvanceBalances(period);
  const monthDays = daysInPeriod(period);
  const finalizedAt = new Date().toISOString();

  const rows = balances.map((balance) => ({
    period,
    person_type: 'driver',
    person_id: balance.driver_id,
    person_name: balance.driver_name,
    month_days: monthDays,
    advance_issued: Number(balance.advance_issued),
    advance_spent: Number(balance.advance_spent),
    status: 'finalized',
    finalized_at: finalizedAt,
  }));

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('salary_records')
    .upsert(rows, { onConflict: 'period,person_type,person_id' })
    .select('*');

  if (error) throw error;
  return (data ?? []) as SalaryDraftRecord[];
}

export async function settleDriverCommissions(
  period: string,
  inputs: DriverCommissionSettlementInput[],
): Promise<Array<{ driverId: number; personalCommission: number }>> {
  const monthDays = daysInPeriod(period);
  const settlement = calculateWeightedDriverCommissions(inputs.map((input) => ({
    driverId: input.driverId,
    rawCommission: input.rawCommission,
    transportFee: input.transportFee,
    attendanceDays: input.attendanceDays,
  })));

  const { error: inputError } = await supabase
    .from('driver_commission_inputs')
    .upsert(inputs.map((input) => ({
      period,
      driver_id: input.driverId,
      raw_commission: input.rawCommission,
      transport_fee: input.transportFee,
      attendance_days: input.attendanceDays,
    })), { onConflict: 'period,driver_id' });

  if (inputError) throw inputError;

  const salaryRows = settlement.rows.map((row) => {
    const input = inputs.find((item) => item.driverId === row.driverId);
    if (!input) throw new Error(`Missing commission input for driver ${row.driverId}`);
    return {
      period,
      person_type: 'driver',
      person_id: row.driverId,
      person_name: input.driverName,
      payee_name: input.payeeName ?? null,
      month_days: monthDays,
      personal_commission: row.actualCommission,
      status: 'draft',
    };
  });

  const { error: salaryError } = await supabase
    .from('salary_records')
    .upsert(salaryRows, { onConflict: 'period,person_type,person_id' });

  if (salaryError) throw salaryError;

  return settlement.rows.map((row) => ({
    driverId: row.driverId,
    personalCommission: row.actualCommission,
  }));
}

export async function settleCommissionPool(
  input: CommissionPoolSettlementInput,
): Promise<CommissionPoolSettlementResult> {
  const divisor = input.participants.filter((participant) => participant.isDivisor).length;
  if (divisor <= 0) {
    throw new Error('At least one dispatch participant must be marked as divisor');
  }

  const poolTotal = calculateCommissionPoolTotal(input.tripCount);
  const perShare = roundMoney(poolTotal / divisor);

  const { data: settlement, error: settlementError } = await supabase
    .from('commission_pool_settlements')
    .upsert({
      period: input.period,
      trip_count: Math.floor(input.tripCount),
      pool_total: poolTotal,
      divisor,
      per_share: perShare,
    }, { onConflict: 'period' })
    .select('id')
    .single();

  if (settlementError) throw settlementError;
  const settlementId = Number((settlement as { id: number }).id);

  const { error: participantError } = await supabase
    .from('commission_pool_participants')
    .insert(input.participants.map((participant) => ({
      settlement_id: settlementId,
      staff_id: participant.staffId,
      staff_name: participant.staffName,
      is_divisor: participant.isDivisor,
      share_amount: perShare,
    })));

  if (participantError) throw participantError;

  const monthDays = daysInPeriod(input.period);
  const { error: salaryError } = await supabase
    .from('salary_records')
    .upsert(input.participants.map((participant) => ({
      period: input.period,
      person_type: 'office',
      person_id: participant.staffId,
      person_name: participant.staffName,
      month_days: monthDays,
      personal_commission: perShare,
      status: 'draft',
    })), { onConflict: 'period,person_type,person_id' });

  if (salaryError) throw salaryError;

  return { settlementId, poolTotal, divisor, perShare };
}

export async function generateSalaryDrafts(
  period: string,
  people: SalaryDraftPersonInput[],
): Promise<SalaryDraftRecord[]> {
  const defaultMonthDays = daysInPeriod(period);
  const rows = people.map((person) => {
    const monthDays = person.monthDays ?? defaultMonthDays;
    const { grossSalary, netSalary } = calculateGrossNetSalary(person);
    return {
      ...person,
      period,
      monthDays,
      grossSalary,
      netSalary,
      status: 'draft' as const,
    };
  });

  const { data, error } = await supabase
    .from('salary_records')
    .upsert(rows.map((row) => ({
      period: row.period,
      person_type: row.personType,
      person_id: row.personId,
      person_name: row.personName,
      payee_name: row.payeeName ?? null,
      job_title: row.jobTitle ?? null,
      is_fixed_salary: Boolean(row.isFixedSalary),
      base_salary: row.baseSalary ?? 0,
      personal_commission: row.personalCommission ?? 0,
      attendance_bonus: row.attendanceBonus ?? 0,
      overtime: row.overtime ?? 0,
      post_allowance: row.postAllowance ?? 0,
      phone_allowance: row.phoneAllowance ?? 0,
      transport_allowance: row.transportAllowance ?? 0,
      month_days: row.monthDays,
      leave_days: row.leaveDays ?? 0,
      rest_days: row.restDays ?? 0,
      has_statutory_holiday: Boolean(row.hasStatutoryHoliday),
      used_substitute: Boolean(row.usedSubstitute),
      advance_issued: row.advanceIssued ?? 0,
      advance_spent: row.advanceSpent ?? 0,
      base_salary_deduction: row.baseSalaryDeduction ?? 0,
      manual_deduction: row.manualDeduction ?? 0,
      adjustment: row.adjustment ?? 0,
      tax: row.tax ?? 0,
      social_insurance: row.socialInsurance ?? 0,
      note: row.note ?? null,
      status: 'draft',
    })), { onConflict: 'period,person_type,person_id' })
    .select('*');

  if (error) throw error;
  return (data ?? rows) as SalaryDraftRecord[];
}
