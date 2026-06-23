import { supabase } from '@/lib/supabase';
import type {
  Customer,
  DispatchOperationLog,
  DispatchRecordWithRelations,
  ServiceStaffSession,
  VehicleSortedRow,
} from '@/types/database';
import type { DispatchBoardRecord, DispatchBoardVehicle } from './logic';
import { getMonthDays } from './logic';

const DISPATCH_VEHICLE_FIELDS = [
  'id',
  'plate_number',
  'is_active',
  'vehicle_model_short',
  'vehicle_category',
  'type_seq',
  'operator',
  'operating_company_short_name',
  'asset_owner',
].join(',');

const DISPATCH_RECORD_FIELDS = [
  'id',
  'vehicle_id',
  'dispatch_date',
  'customer_id',
  'agent_id',
  'is_substitute_driver',
  'is_deleted',
  'created_at',
  'updated_at',
  'customer:customers!dispatch_records_customer_id_fkey(id,name)',
  'agent:service_staff!dispatch_records_agent_id_fkey(id,name)',
].join(',');

export interface DispatchBoardFilters {
  month: string;
  vehicleCategory: string;
  vehicleModel: string;
}

export interface DispatchBoardData {
  vehicles: DispatchBoardVehicle[];
  records: DispatchBoardRecord[];
}

export interface DispatchVehicleOptions {
  categories: string[];
  models: string[];
}

export interface CreateDispatchRecordInput {
  vehicleId: number;
  dispatchDate: string;
  customerName: string;
  isSubstituteDriver: boolean;
}

export interface UpdateDispatchRecordInput {
  recordId: number;
  customerName: string;
  isSubstituteDriver: boolean;
  before?: DispatchRecordWithRelations | null;
}

function monthRange(month: string) {
  const days = getMonthDays(month);
  return {
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
  };
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function normalizeCustomerName(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error('请填写客户/货主名称');
  }
  return normalized;
}

function toDispatchVehicle(row: VehicleSortedRow): DispatchBoardVehicle {
  return {
    id: row.id,
    plate_number: row.plate_number,
    vehicle_model_short: row.vehicle_model_short,
    vehicle_category: row.vehicle_category,
    type_seq: row.type_seq ?? null,
    operator: row.operator ?? null,
    operating_company_short_name: row.operating_company_short_name ?? null,
    asset_owner: row.asset_owner ?? null,
    is_active: row.is_active,
  };
}

function toDispatchRecord(row: DispatchRecordWithRelations): DispatchBoardRecord {
  return {
    ...row,
    customer: row.customer ?? null,
    agent: row.agent ?? null,
  };
}

async function insertDispatchLog(log: Omit<DispatchOperationLog, 'id' | 'created_at'>) {
  const { error } = await supabase
    .from('dispatch_operation_logs')
    .insert(log);

  if (error) throw error;
}

async function findCustomerByName(name: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('id,name,created_at,created_by')
    .eq('name', name)
    .maybeSingle();

  if (error) throw error;
  return data as Customer | null;
}

export async function findOrCreateDispatchCustomer(name: string, user: ServiceStaffSession): Promise<Customer> {
  const customerName = normalizeCustomerName(name);
  const existing = await findCustomerByName(customerName);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name: customerName,
      created_by: user.id,
    })
    .select('id,name,created_at,created_by')
    .single();

  if (error) {
    const afterRace = await findCustomerByName(customerName);
    if (afterRace) return afterRace;
    throw error;
  }
  return data as Customer;
}

export async function getDispatchVehicleOptions(): Promise<DispatchVehicleOptions> {
  const { data, error } = await supabase
    .from('vehicles_sorted')
    .select('vehicle_category,vehicle_model_short')
    .eq('is_active', true);

  if (error) throw error;
  const rows = (data ?? []) as Pick<VehicleSortedRow, 'vehicle_category' | 'vehicle_model_short'>[];
  return {
    categories: uniqueSorted(rows.map((row) => row.vehicle_category)),
    models: uniqueSorted(rows.map((row) => row.vehicle_model_short)),
  };
}

export async function getDispatchBoardData(filters: DispatchBoardFilters): Promise<DispatchBoardData> {
  const { startDate, endDate } = monthRange(filters.month);
  let vehiclesQuery = supabase
    .from('vehicles_sorted')
    .select(DISPATCH_VEHICLE_FIELDS)
    .eq('is_active', true)
    .order('vehicle_model_short', { ascending: true })
    .order('type_seq', { ascending: true, nullsFirst: false })
    .order('plate_number', { ascending: true });

  if (filters.vehicleCategory !== 'all') {
    vehiclesQuery = vehiclesQuery.eq('vehicle_category', filters.vehicleCategory);
  }
  if (filters.vehicleModel !== 'all') {
    vehiclesQuery = vehiclesQuery.eq('vehicle_model_short', filters.vehicleModel);
  }

  const { data: vehicleData, error: vehicleError } = await vehiclesQuery;
  if (vehicleError) throw vehicleError;

  const vehicles = ((vehicleData ?? []) as unknown as VehicleSortedRow[]).map(toDispatchVehicle);
  if (vehicles.length === 0) {
    return { vehicles, records: [] };
  }

  const { data: recordData, error: recordError } = await supabase
    .from('dispatch_records')
    .select(DISPATCH_RECORD_FIELDS)
    .eq('is_deleted', false)
    .gte('dispatch_date', startDate)
    .lte('dispatch_date', endDate)
    .in('vehicle_id', vehicles.map((vehicle) => vehicle.id))
    .order('dispatch_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (recordError) throw recordError;

  return {
    vehicles,
    records: ((recordData ?? []) as unknown as DispatchRecordWithRelations[]).map(toDispatchRecord),
  };
}

export async function getDispatchCustomers(search = ''): Promise<Customer[]> {
  let query = supabase
    .from('customers')
    .select('id,name,created_at,created_by')
    .order('name', { ascending: true })
    .limit(100);

  const keyword = search.trim();
  if (keyword) {
    query = query.ilike('name', `%${keyword}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export async function createDispatchRecord(
  input: CreateDispatchRecordInput,
  user: ServiceStaffSession,
): Promise<DispatchRecordWithRelations> {
  const customer = await findOrCreateDispatchCustomer(input.customerName, user);
  const { data, error } = await supabase
    .from('dispatch_records')
    .insert({
      vehicle_id: input.vehicleId,
      dispatch_date: input.dispatchDate,
      customer_id: customer.id,
      agent_id: user.id,
      is_substitute_driver: input.isSubstituteDriver,
    })
    .select(DISPATCH_RECORD_FIELDS)
    .single();

  if (error) throw error;
  const record = data as unknown as DispatchRecordWithRelations;
  await insertDispatchLog({
    record_id: record.id,
    action: 'create',
    operator_id: user.id,
    detail: { after: record },
  });
  return record;
}

export async function updateDispatchRecord(
  input: UpdateDispatchRecordInput,
  user: ServiceStaffSession,
  isAdmin: boolean,
): Promise<DispatchRecordWithRelations> {
  const customer = await findOrCreateDispatchCustomer(input.customerName, user);
  let query = supabase
    .from('dispatch_records')
    .update({
      customer_id: customer.id,
      is_substitute_driver: input.isSubstituteDriver,
    })
    .eq('id', input.recordId);

  if (!isAdmin) {
    query = query.eq('agent_id', user.id);
  }

  const { data, error } = await query
    .select(DISPATCH_RECORD_FIELDS)
    .single();

  if (error) throw error;
  const record = data as unknown as DispatchRecordWithRelations;
  await insertDispatchLog({
    record_id: record.id,
    action: 'update',
    operator_id: user.id,
    detail: {
      before: input.before ?? null,
      after: record,
    },
  });
  return record;
}

export async function softDeleteDispatchRecord(
  record: DispatchRecordWithRelations,
  user: ServiceStaffSession,
  isAdmin: boolean,
): Promise<DispatchRecordWithRelations> {
  let query = supabase
    .from('dispatch_records')
    .update({ is_deleted: true })
    .eq('id', record.id);

  if (!isAdmin) {
    query = query.eq('agent_id', user.id);
  }

  const { data, error } = await query
    .select(DISPATCH_RECORD_FIELDS)
    .single();

  if (error) throw error;
  const deleted = data as unknown as DispatchRecordWithRelations;
  await insertDispatchLog({
    record_id: deleted.id,
    action: 'delete',
    operator_id: user.id,
    detail: {
      before: record,
      after: deleted,
    },
  });
  return deleted;
}
