import { describe, expect, it } from 'vitest';
import {
  buildDispatchBoard,
  getMonthDays,
  sortDispatchRows,
  type DispatchBoardRecord,
  type DispatchBoardVehicle,
} from './logic';

const vehicles: DispatchBoardVehicle[] = [
  {
    id: 1,
    plate_number: '桂FB0797',
    vehicle_model_short: '45HQ',
    vehicle_category: '高柜',
    type_seq: 1,
    operator: '马上供应链-韦淑琳',
    is_active: true,
  },
  {
    id: 2,
    plate_number: '桂FB0123',
    vehicle_model_short: '45HQ',
    vehicle_category: '高柜',
    type_seq: 2,
    operator: '马上供应链-韦淑琳',
    is_active: true,
  },
  {
    id: 3,
    plate_number: '桂FB8888',
    vehicle_model_short: '13米7冷柜',
    vehicle_category: '冷柜',
    type_seq: null,
    operator: null,
    is_active: true,
  },
];

const records: DispatchBoardRecord[] = [
  {
    id: 11,
    vehicle_id: 1,
    dispatch_date: '2026-06-03',
    customer_id: 101,
    agent_id: 8,
    is_substitute_driver: false,
    is_deleted: false,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    customer: { id: 101, name: '富' },
    agent: { id: 8, name: '黄' },
  },
  {
    id: 12,
    vehicle_id: 1,
    dispatch_date: '2026-06-03',
    customer_id: 102,
    agent_id: 9,
    is_substitute_driver: true,
    is_deleted: false,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    customer: { id: 102, name: '战' },
    agent: { id: 9, name: '陈' },
  },
  {
    id: 13,
    vehicle_id: 3,
    dispatch_date: '2026-06-20',
    customer_id: 103,
    agent_id: 8,
    is_substitute_driver: false,
    is_deleted: false,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    customer: { id: 103, name: '鲲' },
    agent: { id: 8, name: '黄' },
  },
];

describe('dispatch board logic', () => {
  it('returns real calendar days for the selected month', () => {
    const days = getMonthDays('2026-06');

    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ date: '2026-06-01', dayOfMonth: 1, weekday: '一' });
    expect(days[29]).toEqual({ date: '2026-06-30', dayOfMonth: 30, weekday: '二' });
  });

  it('builds row cells, top stats, and idle status from monthly records', () => {
    const board = buildDispatchBoard({
      month: '2026-06',
      vehicles,
      records,
      idleThresholdDays: 7,
      today: '2026-06-23',
    });

    expect(board.summary).toEqual({
      activeVehicleCount: 3,
      neverDispatchedCount: 1,
      dispatchRecordCount: 3,
    });

    const firstRow = board.rows[0];
    expect(firstRow.vehicle.plate_number).toBe('桂FB0797');
    expect(firstRow.monthDispatchCount).toBe(2);
    expect(firstRow.dispatchedDayCount).toBe(1);
    expect(firstRow.daysSinceLastDispatch).toBe(20);
    expect(firstRow.isIdle).toBe(true);
    expect(firstRow.cells['2026-06-03'].label).toBe('富 +1');
    expect(firstRow.cells['2026-06-03'].records).toHaveLength(2);

    const neverDispatched = board.rows.find((row) => row.vehicle.id === 2);
    expect(neverDispatched?.isNeverDispatchedThisMonth).toBe(true);
    expect(neverDispatched?.isIdle).toBe(true);
  });

  it('sorts by fixed type sequence by default and by low utilization when requested', () => {
    const board = buildDispatchBoard({
      month: '2026-06',
      vehicles,
      records,
      idleThresholdDays: 7,
      today: '2026-06-23',
    });

    expect(sortDispatchRows(board.rows, 'fixed').map((row) => row.vehicle.plate_number)).toEqual([
      '桂FB0797',
      '桂FB0123',
      '桂FB8888',
    ]);
    expect(sortDispatchRows(board.rows, 'idle').map((row) => row.vehicle.plate_number)).toEqual([
      '桂FB0123',
      '桂FB8888',
      '桂FB0797',
    ]);
  });
});
