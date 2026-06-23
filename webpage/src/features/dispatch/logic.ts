export interface DispatchBoardVehicle {
  id: number;
  plate_number: string;
  vehicle_model_short?: string | null;
  vehicle_category?: string | null;
  type_seq?: number | null;
  operator?: string | null;
  operating_company_short_name?: string | null;
  asset_owner?: string | null;
  is_active: boolean;
}

export interface DispatchBoardCustomer {
  id: number;
  name: string;
}

export interface DispatchBoardAgent {
  id: number;
  name: string;
}

export interface DispatchBoardRecord {
  id: number;
  vehicle_id: number;
  dispatch_date: string;
  customer_id: number;
  agent_id: number;
  is_substitute_driver: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  customer?: DispatchBoardCustomer | null;
  agent?: DispatchBoardAgent | null;
}

export interface DispatchMonthDay {
  date: string;
  dayOfMonth: number;
  weekday: string;
}

export interface DispatchCell {
  date: string;
  label: string;
  records: DispatchBoardRecord[];
}

export interface DispatchBoardRow {
  vehicle: DispatchBoardVehicle;
  cells: Record<string, DispatchCell>;
  monthDispatchCount: number;
  dispatchedDayCount: number;
  lastDispatchDate: string | null;
  daysSinceLastDispatch: number | null;
  isNeverDispatchedThisMonth: boolean;
  isIdle: boolean;
  originalIndex: number;
}

export interface DispatchBoard {
  days: DispatchMonthDay[];
  rows: DispatchBoardRow[];
  summary: {
    activeVehicleCount: number;
    neverDispatchedCount: number;
    dispatchRecordCount: number;
  };
  dailyDispatchCounts: Record<string, number>;
}

export type DispatchSortMode = 'fixed' | 'idle';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function parseMonth(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error(`Invalid month: ${month}`);
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return { year, monthIndex };
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateAtLocalNoon(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function dayDiff(from: string, to: string) {
  const ms = dateAtLocalNoon(to).getTime() - dateAtLocalNoon(from).getTime();
  return Math.floor(ms / 86_400_000);
}

function firstCustomerName(records: DispatchBoardRecord[]) {
  return records[0]?.customer?.name?.trim() || '未命名客户';
}

function vehicleTypeKey(vehicle: DispatchBoardVehicle) {
  return vehicle.vehicle_model_short?.trim() || '未分类';
}

export function getMonthDays(month: string): DispatchMonthDay[] {
  const { year, monthIndex } = parseMonth(month);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(year, monthIndex, index + 1);
    return {
      date: toDateString(date),
      dayOfMonth: index + 1,
      weekday: WEEKDAYS[date.getDay()],
    };
  });
}

export function buildDispatchBoard({
  month,
  vehicles,
  records,
  idleThresholdDays,
  today = toDateString(new Date()),
}: {
  month: string;
  vehicles: DispatchBoardVehicle[];
  records: DispatchBoardRecord[];
  idleThresholdDays: number;
  today?: string;
}): DispatchBoard {
  const days = getMonthDays(month);
  const daySet = new Set(days.map((day) => day.date));
  const activeVehicles = vehicles.filter((vehicle) => vehicle.is_active);
  const activeVehicleIds = new Set(activeVehicles.map((vehicle) => vehicle.id));
  const activeRecords = records.filter((record) => (
    !record.is_deleted
    && activeVehicleIds.has(record.vehicle_id)
    && daySet.has(record.dispatch_date)
  ));

  const recordsByVehicleAndDate = new Map<string, DispatchBoardRecord[]>();
  const dailyDispatchCounts: Record<string, number> = Object.fromEntries(days.map((day) => [day.date, 0]));

  for (const record of activeRecords) {
    const key = `${record.vehicle_id}:${record.dispatch_date}`;
    const bucket = recordsByVehicleAndDate.get(key) ?? [];
    bucket.push(record);
    recordsByVehicleAndDate.set(key, bucket);
    dailyDispatchCounts[record.dispatch_date] = (dailyDispatchCounts[record.dispatch_date] ?? 0) + 1;
  }

  const rows = activeVehicles.map((vehicle, originalIndex) => {
    const cells = Object.fromEntries(days.map((day) => {
      const cellRecords = (recordsByVehicleAndDate.get(`${vehicle.id}:${day.date}`) ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
      const label = cellRecords.length === 0
        ? ''
        : cellRecords.length === 1
          ? firstCustomerName(cellRecords)
          : `${firstCustomerName(cellRecords)} +${cellRecords.length - 1}`;
      return [day.date, { date: day.date, label, records: cellRecords }];
    }));

    const vehicleRecords = activeRecords
      .filter((record) => record.vehicle_id === vehicle.id)
      .sort((a, b) => a.dispatch_date.localeCompare(b.dispatch_date) || a.id - b.id);
    const dispatchedDayCount = new Set(vehicleRecords.map((record) => record.dispatch_date)).size;
    const lastDispatchDate = vehicleRecords.length > 0
      ? vehicleRecords[vehicleRecords.length - 1].dispatch_date
      : null;
    const daysSinceLastDispatch = lastDispatchDate ? dayDiff(lastDispatchDate, today) : null;
    const isNeverDispatchedThisMonth = vehicleRecords.length === 0;
    const isIdle = isNeverDispatchedThisMonth
      || (daysSinceLastDispatch !== null && daysSinceLastDispatch >= idleThresholdDays);

    return {
      vehicle,
      cells,
      monthDispatchCount: vehicleRecords.length,
      dispatchedDayCount,
      lastDispatchDate,
      daysSinceLastDispatch,
      isNeverDispatchedThisMonth,
      isIdle,
      originalIndex,
    };
  });

  return {
    days,
    rows,
    summary: {
      activeVehicleCount: activeVehicles.length,
      neverDispatchedCount: rows.filter((row) => row.isNeverDispatchedThisMonth).length,
      dispatchRecordCount: activeRecords.length,
    },
    dailyDispatchCounts,
  };
}

export function sortDispatchRows(rows: DispatchBoardRow[], mode: DispatchSortMode): DispatchBoardRow[] {
  if (mode === 'idle') {
    return [...rows].sort((a, b) => {
      if (a.monthDispatchCount !== b.monthDispatchCount) {
        return a.monthDispatchCount - b.monthDispatchCount;
      }
      if (a.lastDispatchDate === null && b.lastDispatchDate !== null) return -1;
      if (a.lastDispatchDate !== null && b.lastDispatchDate === null) return 1;
      if (a.lastDispatchDate !== b.lastDispatchDate) {
        return String(a.lastDispatchDate).localeCompare(String(b.lastDispatchDate));
      }
      return a.originalIndex - b.originalIndex;
    });
  }

  const typeOrder = new Map<string, number>();
  for (const row of rows) {
    const key = vehicleTypeKey(row.vehicle);
    if (!typeOrder.has(key)) typeOrder.set(key, typeOrder.size);
  }

  return [...rows].sort((a, b) => {
    const aTypeOrder = typeOrder.get(vehicleTypeKey(a.vehicle)) ?? Number.MAX_SAFE_INTEGER;
    const bTypeOrder = typeOrder.get(vehicleTypeKey(b.vehicle)) ?? Number.MAX_SAFE_INTEGER;
    if (aTypeOrder !== bTypeOrder) return aTypeOrder - bTypeOrder;

    const aSeq = a.vehicle.type_seq ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.vehicle.type_seq ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) return aSeq - bSeq;

    return a.vehicle.plate_number.localeCompare(b.vehicle.plate_number, 'zh-Hans-CN');
  });
}
