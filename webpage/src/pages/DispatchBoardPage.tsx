import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Edit, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import MainLayout from '@/components/layouts/MainLayout';
import PageErrorState from '@/components/common/PageErrorState';
import PageHeader from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { DispatchRecordWithRelations } from '@/types/database';
import {
  createDispatchRecord,
  getDispatchBoardData,
  getDispatchCustomers,
  getDispatchVehicleOptions,
  softDeleteDispatchRecord,
  updateDispatchRecord,
} from '@/features/dispatch/api';
import {
  buildDispatchBoard,
  sortDispatchRows,
  type DispatchBoardRecord,
  type DispatchBoardVehicle,
  type DispatchSortMode,
} from '@/features/dispatch/logic';

type CellTarget = {
  vehicle: DispatchBoardVehicle;
  date: string;
  records: DispatchBoardRecord[];
};

type EntryFormState = {
  mode: 'create' | 'edit';
  vehicle: DispatchBoardVehicle;
  date: string;
  record: DispatchBoardRecord | null;
  customerName: string;
  isSubstituteDriver: boolean;
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function recordAsRelation(record: DispatchBoardRecord): DispatchRecordWithRelations {
  return record as DispatchRecordWithRelations;
}

function operatorLabel(vehicle: DispatchBoardVehicle) {
  if (vehicle.operator?.trim()) return vehicle.operator;
  const fallback = [vehicle.operating_company_short_name, vehicle.asset_owner]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join('-');
  return fallback || '-';
}

function daysSinceLabel(value: number | null) {
  if (value === null) return '从未';
  if (value <= 0) return '今天';
  return `${value} 天`;
}

function recordCustomerName(record: DispatchBoardRecord) {
  return record.customer?.name || '未命名客户';
}

function recordAgentName(record: DispatchBoardRecord) {
  return record.agent?.name || `客服 #${record.agent_id}`;
}

const DispatchBoardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [month, setMonth] = React.useState(currentMonth());
  const [vehicleCategory, setVehicleCategory] = React.useState('all');
  const [vehicleModel, setVehicleModel] = React.useState('all');
  const [idleThresholdDays, setIdleThresholdDays] = React.useState(7);
  const [sortMode, setSortMode] = React.useState<DispatchSortMode>('fixed');
  const [detailCell, setDetailCell] = React.useState<CellTarget | null>(null);
  const [entryForm, setEntryForm] = React.useState<EntryFormState | null>(null);

  const optionsQuery = useQuery({
    queryKey: ['dispatch-vehicle-options'],
    queryFn: getDispatchVehicleOptions,
  });

  const boardQuery = useQuery({
    queryKey: ['dispatch-board', month, vehicleCategory, vehicleModel],
    queryFn: () => getDispatchBoardData({ month, vehicleCategory, vehicleModel }),
  });

  const customersQuery = useQuery({
    queryKey: ['dispatch-customers'],
    queryFn: () => getDispatchCustomers(),
    enabled: Boolean(entryForm),
  });

  const board = React.useMemo(() => {
    if (!boardQuery.data) return null;
    return buildDispatchBoard({
      month,
      vehicles: boardQuery.data.vehicles,
      records: boardQuery.data.records,
      idleThresholdDays,
      today: todayString(),
    });
  }, [boardQuery.data, idleThresholdDays, month]);

  const rows = React.useMemo(() => (board ? sortDispatchRows(board.rows, sortMode) : []), [board, sortMode]);
  const loadError = boardQuery.error ?? optionsQuery.error;

  const refreshBoard = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dispatch-board'] }),
      queryClient.invalidateQueries({ queryKey: ['dispatch-customers'] }),
      queryClient.invalidateQueries({ queryKey: ['dispatch-vehicle-options'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (form: EntryFormState) => {
      if (!user) throw new Error('请先登录');
      return createDispatchRecord({
        vehicleId: form.vehicle.id,
        dispatchDate: form.date,
        customerName: form.customerName,
        isSubstituteDriver: form.isSubstituteDriver,
      }, user);
    },
    onSuccess: async () => {
      toast.success('派遣记录已保存');
      setEntryForm(null);
      await refreshBoard();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存失败'),
  });

  const updateMutation = useMutation({
    mutationFn: async (form: EntryFormState) => {
      if (!user || !form.record) throw new Error('请先登录');
      return updateDispatchRecord({
        recordId: form.record.id,
        customerName: form.customerName,
        isSubstituteDriver: form.isSubstituteDriver,
        before: recordAsRelation(form.record),
      }, user, isAdmin);
    },
    onSuccess: async () => {
      toast.success('派遣记录已修改');
      setEntryForm(null);
      setDetailCell(null);
      await refreshBoard();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '修改失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (record: DispatchBoardRecord) => {
      if (!user) throw new Error('请先登录');
      return softDeleteDispatchRecord(recordAsRelation(record), user, isAdmin);
    },
    onSuccess: async () => {
      toast.success('派遣记录已删除');
      setDetailCell(null);
      await refreshBoard();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '删除失败'),
  });

  const canManageRecord = (record: DispatchBoardRecord) => Boolean(user && (isAdmin || record.agent_id === user.id));

  const openCreateDialog = (target: CellTarget) => {
    setEntryForm({
      mode: 'create',
      vehicle: target.vehicle,
      date: target.date,
      record: null,
      customerName: '',
      isSubstituteDriver: false,
    });
  };

  const openEditDialog = (record: DispatchBoardRecord, vehicle: DispatchBoardVehicle, date: string) => {
    setEntryForm({
      mode: 'edit',
      vehicle,
      date,
      record,
      customerName: recordCustomerName(record),
      isSubstituteDriver: record.is_substitute_driver,
    });
  };

  const handleCellClick = (target: CellTarget) => {
    if (target.records.length === 0) {
      openCreateDialog(target);
      return;
    }
    setDetailCell(target);
  };

  const handleSaveEntry = () => {
    if (!entryForm) return;
    if (!entryForm.customerName.trim()) {
      toast.error('请填写客户/货主名称');
      return;
    }
    const action = entryForm.mode === 'create' ? '保存' : '修改';
    if (!window.confirm(`确认${action} ${entryForm.vehicle.plate_number} 在 ${entryForm.date} 的派遣记录？`)) return;
    if (entryForm.mode === 'create') {
      createMutation.mutate(entryForm);
    } else {
      updateMutation.mutate(entryForm);
    }
  };

  const handleDeleteRecord = (record: DispatchBoardRecord) => {
    if (!window.confirm(`确认删除 ${record.dispatch_date} 的 ${recordCustomerName(record)} 派遣记录？`)) return;
    deleteMutation.mutate(record);
  };

  const customerOptions = customersQuery.data ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader
          title="车辆派遣管理表"
          actions={
            <Button onClick={() => void refreshBoard()} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          }
        />

        {loadError && <PageErrorState error={loadError} onRetry={() => void refreshBoard()} />}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="rounded-lg">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">在册车辆总数</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{board?.summary.activeVehicleCount ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">本月闲置数</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{board?.summary.neverDispatchedCount ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">本月派车总次数</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{board?.summary.dispatchRecordCount ?? 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-lg">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[150px_1fr_1fr_150px_150px]">
              <div className="space-y-2">
                <Label>月份</Label>
                <Input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} />
              </div>
              <div className="space-y-2">
                <Label>车型大类</Label>
                <Select value={vehicleCategory} onValueChange={setVehicleCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部大类</SelectItem>
                    {(optionsQuery.data?.categories ?? []).map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>具体车型</Label>
                <Select value={vehicleModel} onValueChange={setVehicleModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部车型</SelectItem>
                    {(optionsQuery.data?.models ?? []).map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>闲置阈值</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={idleThresholdDays}
                  onChange={(event) => setIdleThresholdDays(Math.max(1, Number(event.target.value) || 7))}
                />
              </div>
              <div className="flex items-end">
                <label className="flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm">
                  <span>按闲置排序</span>
                  <Switch
                    checked={sortMode === 'idle'}
                    onCheckedChange={(checked) => setSortMode(checked ? 'idle' : 'fixed')}
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-auto">
            <table className="min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-muted/80">
                  <th className="sticky left-0 z-20 w-56 min-w-56 border-b border-r bg-muted px-3 py-2 text-left font-medium">
                    车辆
                  </th>
                  {board?.days.map((day) => (
                    <th key={day.date} className="w-[76px] min-w-[76px] border-b border-r px-2 py-2 text-center font-medium">
                      <div className="tabular-nums">{day.dayOfMonth}</div>
                      <div className="text-[11px] text-muted-foreground">周{day.weekday}</div>
                    </th>
                  ))}
                  <th className="w-28 min-w-28 border-b border-r px-3 py-2 text-center font-medium">次数 / 天数</th>
                  <th className="w-32 min-w-32 border-b px-3 py-2 text-center font-medium">距上次</th>
                </tr>
              </thead>
              <tbody>
                {boardQuery.isLoading ? (
                  <tr>
                    <td className="p-6 text-muted-foreground" colSpan={(board?.days.length ?? 30) + 3}>加载中...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-muted-foreground" colSpan={(board?.days.length ?? 30) + 3}>暂无车辆</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.vehicle.id} className={cn(row.isIdle && 'bg-amber-50/80')}>
                      <td className={cn(
                        'sticky left-0 z-10 border-b border-r bg-card px-3 py-2 align-top',
                        row.isIdle && 'bg-amber-50'
                      )}>
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">{row.vehicle.plate_number}</div>
                          {row.isIdle && (
                            <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="闲置" />
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="bg-background/70">
                            {row.vehicle.vehicle_category || '未分类'}
                          </Badge>
                          <Badge variant="outline" className="bg-background/70">
                            {row.vehicle.vehicle_model_short || '未填车型'}
                          </Badge>
                          {row.vehicle.type_seq != null && (
                            <Badge variant="outline" className="bg-background/70">#{row.vehicle.type_seq}</Badge>
                          )}
                        </div>
                        <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground">{operatorLabel(row.vehicle)}</div>
                      </td>
                      {board?.days.map((day) => {
                        const cell = row.cells[day.date];
                        return (
                          <td key={day.date} className="border-b border-r p-1 align-middle">
                            <button
                              type="button"
                              onClick={() => handleCellClick({ vehicle: row.vehicle, date: day.date, records: cell.records })}
                              className={cn(
                                'flex h-11 w-full items-center justify-center rounded-md border text-xs transition hover:border-primary hover:bg-primary/5',
                                cell.records.length === 0
                                  ? 'border-transparent text-muted-foreground'
                                  : 'border-primary/20 bg-primary/10 font-medium text-primary',
                                row.isIdle && cell.records.length === 0 && 'bg-amber-100/70'
                              )}
                              title={cell.records.length === 0 ? '新增派遣记录' : '查看派遣明细'}
                            >
                              {cell.records.length === 0 ? <Plus className="h-3.5 w-3.5" /> : cell.label}
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b border-r px-3 py-2 text-center tabular-nums">
                        {row.monthDispatchCount} / {row.dispatchedDayCount}
                      </td>
                      <td className="border-b px-3 py-2 text-center">
                        {daysSinceLabel(row.daysSinceLastDispatch)}
                      </td>
                    </tr>
                  ))
                )}
                {board && (
                  <tr className="bg-muted/40">
                    <td className="sticky left-0 z-10 border-r bg-muted px-3 py-2 font-medium">
                      各时段用车时间分布
                    </td>
                    {board.days.map((day) => (
                      <td key={day.date} className="border-r px-2 py-2 text-center tabular-nums">
                        {board.dailyDispatchCounts[day.date] ?? 0}
                      </td>
                    ))}
                    <td className="border-r px-3 py-2 text-center">-</td>
                    <td className="px-3 py-2 text-center">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(detailCell)} onOpenChange={(open) => !open && setDetailCell(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detailCell?.vehicle.plate_number} · {detailCell?.date}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {detailCell?.records.map((record) => (
              <div key={record.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium">{recordCustomerName(record)}</div>
                    <Badge variant="outline">客服：{recordAgentName(record)}</Badge>
                    {record.is_substitute_driver && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">代驾</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    记录 #{record.id}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManageRecord(record)}
                    onClick={() => detailCell && openEditDialog(record, detailCell.vehicle, detailCell.date)}
                  >
                    <Edit className="mr-1 h-4 w-4" />
                    修改
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManageRecord(record) || deleteMutation.isPending}
                    onClick={() => handleDeleteRecord(record)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailCell(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(entryForm)} onOpenChange={(open) => !open && setEntryForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {entryForm?.mode === 'create' ? '新增派遣记录' : '修改派遣记录'}
            </DialogTitle>
          </DialogHeader>
          {entryForm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3 text-sm">
                <div>
                  <div className="text-muted-foreground">车辆</div>
                  <div className="mt-1 font-medium">{entryForm.vehicle.plate_number}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">日期</div>
                  <div className="mt-1 font-medium">{entryForm.date}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">当前客服</div>
                  <div className="mt-1 font-medium">{user?.name || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">车型</div>
                  <div className="mt-1 font-medium">{entryForm.vehicle.vehicle_model_short || '-'}</div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dispatch-customer">客户/货主</Label>
                <Input
                  id="dispatch-customer"
                  list="dispatch-customer-options"
                  value={entryForm.customerName}
                  onChange={(event) => setEntryForm({ ...entryForm, customerName: event.target.value })}
                  placeholder="输入客户名称"
                />
                <datalist id="dispatch-customer-options">
                  {customerOptions.map((customer) => (
                    <option key={customer.id} value={customer.name} />
                  ))}
                </datalist>
              </div>
              <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>代驾</span>
                <Switch
                  checked={entryForm.isSubstituteDriver}
                  onCheckedChange={(checked) => setEntryForm({ ...entryForm, isSubstituteDriver: checked })}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryForm(null)}>取消</Button>
            <Button onClick={handleSaveEntry} disabled={saving}>
              <CalendarDays className="mr-2 h-4 w-4" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default DispatchBoardPage;
