import { describe, expect, it } from 'vitest';

import {
  calculateAttendanceBonus,
  calculateBaseSalaryDeduction,
  calculateCommissionPoolTotal,
  calculateGrossNetSalary,
  calculateOvertimePay,
  calculateWeightedDriverCommissions,
} from './logic';

describe('calculateCommissionPoolTotal', () => {
  it('uses cumulative trip tiers', () => {
    expect(calculateCommissionPoolTotal(240)).toBe(0);
    expect(calculateCommissionPoolTotal(400)).toBe(2500);
    expect(calculateCommissionPoolTotal(460)).toBe(3900);
  });
});

describe('calculateWeightedDriverCommissions', () => {
  it('recalculates May weighted driver commission from real rows', () => {
    const rows = [
      { driverId: 1, rawCommission: 2750, transportFee: 80, attendanceDays: 31 },
      { driverId: 2, rawCommission: 3300, transportFee: 70, attendanceDays: 29 },
      { driverId: 3, rawCommission: 3420, transportFee: 60, attendanceDays: 30 },
      { driverId: 4, rawCommission: 3520, transportFee: 90, attendanceDays: 31 },
      { driverId: 5, rawCommission: 3180, transportFee: 90, attendanceDays: 31 },
      { driverId: 6, rawCommission: 3150, transportFee: 40, attendanceDays: 31 },
      { driverId: 7, rawCommission: 3290, transportFee: 70, attendanceDays: 28 },
      { driverId: 8, rawCommission: 3480, transportFee: 100, attendanceDays: 31 },
      { driverId: 9, rawCommission: 3060, transportFee: 90, attendanceDays: 31 },
      { driverId: 10, rawCommission: 3640, transportFee: 70, attendanceDays: 27 },
      { driverId: 11, rawCommission: 3170, transportFee: 80, attendanceDays: 31 },
    ];

    const result = calculateWeightedDriverCommissions(rows);
    expect(result.unitPrice).toBeCloseTo(106.1027190332, 10);
    expect(result.rows.find((row) => row.driverId === 1)?.actualCommission).toBe(3369.18);
    expect(result.rows.find((row) => row.driverId === 9)?.actualCommission).toBe(3379.18);
    expect(result.rows.find((row) => row.driverId === 10)?.actualCommission).toBe(2934.77);
    expect(result.rows.find((row) => row.driverId === 11)?.actualCommission).toBe(3369.18);
  });

  it('uses zero unit price when total attendance is zero', () => {
    const result = calculateWeightedDriverCommissions([
      { driverId: 1, rawCommission: 100, transportFee: 20, attendanceDays: 0 },
    ]);

    expect(result.unitPrice).toBe(0);
    expect(result.rows[0].actualCommission).toBe(20);
  });
});

describe('calculateAttendanceBonus', () => {
  it('handles office short-rest compensation and leave deductions', () => {
    expect(calculateAttendanceBonus({ personType: 'office', restDays: 2, hasStatutoryHoliday: false })).toBe(500);
    expect(calculateAttendanceBonus({ personType: 'office', restDays: 5, hasStatutoryHoliday: false })).toBe(150);
  });

  it('handles driver, manager and parttime branches', () => {
    expect(calculateAttendanceBonus({ personType: 'driver', leaveDays: 2 })).toBe(0);
    expect(calculateAttendanceBonus({ personType: 'driver', leaveDays: 1 })).toBe(150);
    expect(calculateAttendanceBonus({ personType: 'office', isFixedSalary: true, restDays: 0 })).toBe(0);
    expect(calculateAttendanceBonus({ personType: 'parttime', restDays: 0 })).toBe(0);
  });
});

describe('calculateBaseSalaryDeduction', () => {
  it('uses actual month days instead of a hard-coded 30 days', () => {
    expect(calculateBaseSalaryDeduction({
      personType: 'office',
      baseSalary: 6500,
      monthDays: 31,
      leaveDays: 2,
    }).baseSalaryDeduction).toBe(419.35);
  });

  it('handles driver substitute and parttime cook deductions', () => {
    expect(calculateBaseSalaryDeduction({
      personType: 'driver',
      baseSalary: 6500,
      monthDays: 31,
      leaveDays: 1,
      usedSubstitute: false,
    }).baseSalaryDeduction).toBe(0);
    expect(calculateBaseSalaryDeduction({
      personType: 'driver',
      baseSalary: 6500,
      monthDays: 31,
      leaveDays: 1,
      usedSubstitute: true,
    }).baseSalaryDeduction).toBe(209.68);
    expect(calculateBaseSalaryDeduction({
      personType: 'parttime',
      baseSalary: 2100,
      monthDays: 31,
      restDays: 3,
      parttimeKind: 'cook',
    }).manualDeduction).toBe(67.74);
  });
});

describe('calculateOvertimePay', () => {
  it('uses distinct overtime dates for drivers only', () => {
    expect(calculateOvertimePay({ personType: 'driver', overtimeDates: ['2026-06-02', '2026-06-02', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-19'] })).toBe(180);
    expect(calculateOvertimePay({ personType: 'driver', overtimeDates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-06-09', '2026-06-17', '2026-06-18', '2026-06-20', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-28'] })).toBe(360);
    expect(calculateOvertimePay({ personType: 'office', overtimeDates: ['2026-06-01'] })).toBe(0);
  });
});

describe('calculateGrossNetSalary', () => {
  it('matches the generated column formula for real and special rows', () => {
    expect(calculateGrossNetSalary({
      baseSalary: 6500,
      personalCommission: 3369.18,
      attendanceBonus: 300,
      overtime: 90,
      advanceIssued: 10500,
      advanceSpent: 11007.6,
      manualDeduction: 750,
      tax: 137.45,
      socialInsurance: 435.02,
    })).toEqual({ grossSalary: 10016.78, netSalary: 9444.31 });

    expect(calculateGrossNetSalary({
      baseSalary: 10000,
      tax: 97.8,
      socialInsurance: 435.02,
    })).toEqual({ grossSalary: 10000, netSalary: 9467.18 });

    expect(calculateGrossNetSalary({
      baseSalary: 2100,
      manualDeduction: 67.74,
    })).toEqual({ grossSalary: 2032.26, netSalary: 2032.26 });
  });
});
