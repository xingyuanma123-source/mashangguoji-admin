export type PayrollPersonType = 'driver' | 'office' | 'parttime';
export type ParttimeKind = 'cook' | 'fixed';

export interface DriverCommissionInput {
  driverId: number;
  rawCommission: number;
  transportFee: number;
  attendanceDays: number;
}

export interface WeightedDriverCommissionRow extends DriverCommissionInput {
  realCommission: number;
  commissionAmount: number;
  actualCommission: number;
}

export interface WeightedDriverCommissionResult {
  unitPrice: number;
  rows: WeightedDriverCommissionRow[];
}

export interface AttendanceBonusInput {
  personType: PayrollPersonType;
  isFixedSalary?: boolean;
  leaveDays?: number;
  restDays?: number;
  hasStatutoryHoliday?: boolean;
}

export interface DeductionInput {
  personType: PayrollPersonType;
  baseSalary: number;
  monthDays: number;
  leaveDays?: number;
  restDays?: number;
  usedSubstitute?: boolean;
  isFixedSalary?: boolean;
  parttimeKind?: ParttimeKind;
}

export interface DeductionResult {
  baseSalaryDeduction: number;
  manualDeduction: number;
}

export interface OvertimeInput {
  personType: PayrollPersonType;
  overtimeDates: string[];
}

export interface GrossNetInput {
  baseSalary?: number;
  personalCommission?: number;
  attendanceBonus?: number;
  overtime?: number;
  postAllowance?: number;
  phoneAllowance?: number;
  transportAllowance?: number;
  advanceIssued?: number;
  advanceSpent?: number;
  baseSalaryDeduction?: number;
  manualDeduction?: number;
  adjustment?: number;
  tax?: number;
  socialInsurance?: number;
}

export interface GrossNetResult {
  grossSalary: number;
  netSalary: number;
}

const MONEY_SCALE = 100;
const OFFICE_REST_QUOTA = 4;
const OFFICE_BASE_ATTENDANCE_BONUS = 300;
const SHORT_REST_BONUS: Record<number, number> = {
  1: 100,
  2: 200,
  3: 400,
  4: 800,
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

function valueOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function calculateCommissionPoolTotal(tripCount: number): number {
  const trips = Math.max(0, Math.floor(tripCount));
  const tier250To300 = Math.max(Math.min(trips, 300) - 250, 0) * 10;
  const tier300To450 = Math.max(Math.min(trips, 450) - 300, 0) * 20;
  const tier450Plus = Math.max(trips - 450, 0) * 40;
  return roundMoney(tier250To300 + tier300To450 + tier450Plus);
}

export function calculateWeightedDriverCommissions(
  rows: DriverCommissionInput[],
): WeightedDriverCommissionResult {
  const totalRealCommission = rows.reduce(
    (sum, row) => sum + (valueOrZero(row.rawCommission) - valueOrZero(row.transportFee)),
    0,
  );
  const totalAttendance = rows.reduce((sum, row) => sum + valueOrZero(row.attendanceDays), 0);
  const unitPrice = totalAttendance === 0 ? 0 : totalRealCommission / totalAttendance;

  return {
    unitPrice,
    rows: rows.map((row) => {
      const realCommission = roundMoney(valueOrZero(row.rawCommission) - valueOrZero(row.transportFee));
      const commissionAmount = roundMoney(unitPrice * valueOrZero(row.attendanceDays));
      const actualCommission = roundMoney(commissionAmount + valueOrZero(row.transportFee));
      return {
        ...row,
        realCommission,
        commissionAmount,
        actualCommission,
      };
    }),
  };
}

function officeLeaveAttendanceBonus(leaveDays: number): number {
  if (leaveDays <= 0) return OFFICE_BASE_ATTENDANCE_BONUS;
  if (leaveDays <= 0.5) return 225;
  if (leaveDays <= 1) return 150;
  return 0;
}

export function calculateAttendanceBonus(input: AttendanceBonusInput): number {
  if (input.personType === 'parttime' || input.isFixedSalary) {
    return 0;
  }

  if (input.personType === 'driver') {
    const leaveDays = valueOrZero(input.leaveDays);
    if (leaveDays <= 0) return 300;
    if (leaveDays === 1) return 150;
    return 0;
  }

  const quota = OFFICE_REST_QUOTA + (input.hasStatutoryHoliday ? 1 : 0);
  const restDays = valueOrZero(input.restDays);
  if (restDays < quota) {
    const shortRestDays = Math.min(Math.floor(quota - restDays), 4);
    return OFFICE_BASE_ATTENDANCE_BONUS + (SHORT_REST_BONUS[shortRestDays] ?? 0);
  }
  if (restDays > quota) {
    return officeLeaveAttendanceBonus(restDays - quota);
  }
  return OFFICE_BASE_ATTENDANCE_BONUS;
}

function dailyBaseSalary(baseSalary: number, monthDays: number): number {
  if (!Number.isInteger(monthDays) || monthDays < 28 || monthDays > 31) {
    throw new Error('monthDays must be the real day count of the month, between 28 and 31');
  }
  return baseSalary / monthDays;
}

export function calculateBaseSalaryDeduction(input: DeductionInput): DeductionResult {
  if (input.isFixedSalary) {
    return { baseSalaryDeduction: 0, manualDeduction: 0 };
  }

  const baseSalary = valueOrZero(input.baseSalary);
  const dayRate = dailyBaseSalary(baseSalary, input.monthDays);

  if (input.personType === 'parttime') {
    if (input.parttimeKind !== 'cook') {
      return { baseSalaryDeduction: 0, manualDeduction: 0 };
    }
    const extraRestDays = Math.max(valueOrZero(input.restDays) - 2, 0);
    return {
      baseSalaryDeduction: 0,
      manualDeduction: roundMoney(dayRate * extraRestDays),
    };
  }

  if (input.personType === 'driver') {
    const leaveDays = valueOrZero(input.leaveDays);
    if (leaveDays < 1) return { baseSalaryDeduction: 0, manualDeduction: 0 };
    if (leaveDays === 1 && !input.usedSubstitute) {
      return { baseSalaryDeduction: 0, manualDeduction: 0 };
    }
    return {
      baseSalaryDeduction: roundMoney(dayRate * leaveDays),
      manualDeduction: 0,
    };
  }

  return {
    baseSalaryDeduction: roundMoney(dayRate * valueOrZero(input.leaveDays)),
    manualDeduction: 0,
  };
}

export function calculateOvertimePay(input: OvertimeInput): number {
  if (input.personType !== 'driver') {
    return 0;
  }
  return new Set(input.overtimeDates.filter(Boolean)).size * 30;
}

export function calculateGrossNetSalary(input: GrossNetInput): GrossNetResult {
  const grossSalary = roundMoney(
    valueOrZero(input.baseSalary)
    + valueOrZero(input.personalCommission)
    + valueOrZero(input.attendanceBonus)
    + valueOrZero(input.overtime)
    + valueOrZero(input.postAllowance)
    + valueOrZero(input.phoneAllowance)
    + valueOrZero(input.transportAllowance)
    - (valueOrZero(input.advanceIssued) - valueOrZero(input.advanceSpent))
    - valueOrZero(input.baseSalaryDeduction)
    - valueOrZero(input.manualDeduction)
    + valueOrZero(input.adjustment),
  );
  const netSalary = roundMoney(
    grossSalary - valueOrZero(input.tax) - valueOrZero(input.socialInsurance),
  );

  return { grossSalary, netSalary };
}
