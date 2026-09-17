import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  finalizeMonthlySalaryRecords,
  getAdvanceBalanceWarnings,
  getDriverAdvanceBalances,
  settleCommissionPool,
  topUpMonthlyAdvances,
} from './api';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

function createQuery(result: Record<string, unknown> = { data: [], error: null }) {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    lt: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    upsert: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: Record<string, unknown>) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

describe('payroll api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads driver advance balances and filters warnings through the db-proxy client', async () => {
    const rows = [
      { driver_id: 1, driver_name: 'A', period: '2026-06', advance_issued: 1000, advance_spent: 900, balance: 100 },
      { driver_id: 2, driver_name: 'B', period: '2026-06', advance_issued: 1000, advance_spent: 700, balance: 300 },
    ];
    fromMock.mockReturnValue(createQuery({ data: rows, error: null }));

    await expect(getDriverAdvanceBalances('2026-06')).resolves.toEqual(rows);
    await expect(getAdvanceBalanceWarnings('2026-06')).resolves.toEqual([rows[0]]);

    expect(fromMock).toHaveBeenCalledWith('driver_advance_balance');
  });

  it('uses driver defaults and treats monthly top-up unique conflicts as skipped', async () => {
    fromMock
      .mockReturnValueOnce(createQuery({
        data: [
          { id: 1, name: '陆贻祥', monthly_advance_default: 2000 },
          { id: 2, name: '徐良斌', monthly_advance_default: 1000 },
        ],
        error: null,
      }))
      .mockReturnValueOnce(createQuery({ data: { id: 10 }, error: null }))
      .mockReturnValueOnce(createQuery({ data: null, error: { code: '23505', message: 'duplicate key' } }));

    await expect(topUpMonthlyAdvances('2026-06', '2026-06-01')).resolves.toEqual({
      inserted: 1,
      skipped: 1,
    });

    expect(fromMock).toHaveBeenNthCalledWith(1, 'drivers');
    expect(fromMock).toHaveBeenNthCalledWith(2, 'advance_fund_records');
  });

  it('finalizes monthly salary records from advance snapshots', async () => {
    const rows = [
      { driver_id: 1, driver_name: '陆贻祥', period: '2026-06', advance_issued: 5000, advance_spent: 4515.88, balance: 484.12 },
    ];
    fromMock
      .mockReturnValueOnce(createQuery({ data: rows, error: null }))
      .mockReturnValueOnce(createQuery({ data: [{ id: 1 }], error: null }));

    await expect(finalizeMonthlySalaryRecords('2026-06')).resolves.toHaveLength(1);

    expect(fromMock).toHaveBeenNthCalledWith(2, 'salary_records');
  });

  it('settles a manually entered commission pool', async () => {
    fromMock
      .mockReturnValueOnce(createQuery({ data: { id: 10 }, error: null }))
      .mockReturnValueOnce(createQuery({ data: [], error: null }));

    await expect(settleCommissionPool({
      period: '2026-06',
      tripCount: 400,
      participants: [
        { staffId: 1, staffName: '调度A', isDivisor: true },
        { staffId: 2, staffName: '会计B', isDivisor: false },
      ],
    })).resolves.toEqual({ settlementId: 10, poolTotal: 2500, divisor: 1, perShare: 2500 });
  });
});
