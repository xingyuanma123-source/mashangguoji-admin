import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RefreshCw, Inbox } from 'lucide-react';
import { getExpenseRecords, getAllDrivers, confirmExpenseRecord, batchConfirmExpenseRecords, batchUpdateCommission, createOperationLog } from '@/db/api';
import type { ExpenseRecordWithDriver, Driver } from '@/types/database';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import EditExpenseDialog from '@/components/expenses/EditExpenseDialog';

const ExpensesPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<ExpenseRecordWithDriver[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [batchCommissionDialogOpen, setBatchCommissionDialogOpen] = useState(false);
  const [batchCommission, setBatchCommission] = useState('');
  const [activeRecord, setActiveRecord] = useState<ExpenseRecordWithDriver | null>(null);

  // 筛选条件
  const [filters, setFilters] = useState({
    driverId: searchParams.get('driverId') || '',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'pending',
  });

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    loadRecords();
  }, [filters]);

  const loadDrivers = async () => {
    try {
      const driverList = await getAllDrivers(true);
      setDrivers(driverList);
    } catch (error) {
      console.error('加载司机列表失败:', error);
      toast.error('加载司机列表失败');
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await getExpenseRecords({
        driverId: filters.driverId ? Number(filters.driverId) : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        status: filters.status as 'pending' | 'confirmed' | undefined,
      });
      setRecords(data);
      setSelectedIds([]);
    } catch (error) {
      console.error('加载报账记录失败:', error);
      toast.error('加载报账记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSingle = async (id: number) => {
    if (!user) return;
    try {
      await confirmExpenseRecord(id, user.name);
      await createOperationLog({
        operator_id: user.id,
        operator_name: user.name,
        action: 'confirm',
        target_type: 'expense_record',
        target_id: id,
        detail: '确认报账记录',
      });
      toast.success('确认成功');
      setActiveRecord(null);
      loadRecords();
    } catch (error) {
      console.error('确认失败:', error);
      toast.error('确认失败，请重试');
    }
  };

  const handleBatchConfirm = async () => {
    if (!user || selectedIds.length === 0) return;
    try {
      await batchConfirmExpenseRecords(selectedIds, user.name);
      for (const id of selectedIds) {
        await createOperationLog({
          operator_id: user.id,
          operator_name: user.name,
          action: 'confirm',
          target_type: 'expense_record',
          target_id: id,
          detail: '批量确认报账记录',
        });
      }
      toast.success(`成功确认 ${selectedIds.length} 条记录`);
      setConfirmDialogOpen(false);
      loadRecords();
    } catch (error) {
      console.error('批量确认失败:', error);
      toast.error('批量确认失败，请重试');
    }
  };

  const handleBatchCommission = async () => {
    if (!user || selectedIds.length === 0) return;
    try {
      await batchUpdateCommission(selectedIds, Number(batchCommission));
      for (const id of selectedIds) {
        await createOperationLog({
          operator_id: user.id,
          operator_name: user.name,
          action: 'edit',
          target_type: 'expense_record',
          target_id: id,
          detail: `批量填写提成：¥${batchCommission}`,
        });
      }
      toast.success(`成功填写 ${selectedIds.length} 条记录的提成`);
      setBatchCommissionDialogOpen(false);
      loadRecords();
    } catch (error) {
      console.error('批量填写提成失败:', error);
      toast.error('批量填写提成失败，请重试');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === records.filter(r => r.status === 'pending').length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.filter(r => r.status === 'pending').map(r => r.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const activeRecordIndex = activeRecord ? records.findIndex((item) => item.id === activeRecord.id) : -1;
  const hasPrevRecord = activeRecordIndex > 0;
  const hasNextRecord = activeRecordIndex >= 0 && activeRecordIndex < records.length - 1;

  const goPrevRecord = () => {
    if (!hasPrevRecord) return;
    setActiveRecord(records[activeRecordIndex - 1]);
  };

  const goNextRecord = () => {
    if (!hasNextRecord) return;
    setActiveRecord(records[activeRecordIndex + 1]);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold border-b pb-4 mb-6">报账管理</h1>
          <Button onClick={loadRecords} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {/* 筛选栏 */}
        <Card className="bg-muted/10 border-dashed">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[180px] flex-1">
                <Label>司机</Label>
                <Select value={filters.driverId || 'all'} onValueChange={(value) => setFilters({ ...filters, driverId: value === 'all' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="全部司机" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部司机</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id.toString()}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-[180px]">
                <Label>开始日期</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2 min-w-[180px]">
                <Label>结束日期</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2 min-w-[160px]">
                <Label>状态</Label>
                <Select value={filters.status || 'all'} onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="pending">待确认</SelectItem>
                    <SelectItem value="confirmed">已确认</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 批量操作按钮 */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">已选择 {selectedIds.length} 条</span>
            <Button size="sm" onClick={() => setBatchCommissionDialogOpen(true)}>
              批量填提成
            </Button>
            <Button size="sm" onClick={() => setConfirmDialogOpen(true)}>
              批量确认
            </Button>
          </div>
        )}

        {/* 报账记录列表 */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : (
              <Table className="w-full table-auto text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9 px-1">
                      <Checkbox
                        checked={selectedIds.length === records.filter(r => r.status === 'pending').length && records.filter(r => r.status === 'pending').length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[86px] whitespace-nowrap px-1">日期</TableHead>
                    <TableHead className="w-[60px] whitespace-nowrap px-1">司机</TableHead>
                    <TableHead className="w-[72px] whitespace-nowrap px-1">车牌号</TableHead>
                    <TableHead className="w-[100px] px-1">路线/地点</TableHead>
                    <TableHead className="w-[72px] whitespace-nowrap text-right px-1">支出</TableHead>
                    <TableHead className="w-[64px] whitespace-nowrap text-right px-1">提成</TableHead>
                    <TableHead className="w-[64px] whitespace-nowrap px-1">状态</TableHead>
                    <TableHead className="w-[78px] whitespace-nowrap px-1">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2 py-6">
                          <Inbox className="h-6 w-6 text-muted-foreground" />
                          <span>暂无报账记录</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((record, index) => (
                      <TableRow
                        key={record.id}
                        className={index % 2 === 0 ? 'bg-muted/20' : ''}
                      >
                        <TableCell className="px-1">
                          {record.status === 'pending' && (
                            <Checkbox
                              checked={selectedIds.includes(record.id)}
                              onCheckedChange={() => toggleSelect(record.id)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-1">{format(new Date(record.record_date), 'yyyy-MM-dd')}</TableCell>
                        <TableCell className="px-1">{record.driver?.name}</TableCell>
                        <TableCell className="whitespace-nowrap px-1">{record.plate_number}</TableCell>
                        <TableCell className="break-all leading-5 px-1">{record.route || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap text-right px-1">¥{Number(record.total_expense).toFixed(2)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right px-1">¥{Number(record.commission).toFixed(2)}</TableCell>
                        <TableCell className="whitespace-nowrap px-1">
                          {record.status === 'pending' ? (
                            <Badge variant="outline" className="border-warning text-warning">
                              待确认
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-success text-success">
                              已确认
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setActiveRecord(record)}
                          >
                            查看
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 编辑对话框 */}
      <EditExpenseDialog
        open={!!activeRecord}
        onOpenChange={(open) => !open && setActiveRecord(null)}
        record={activeRecord}
        onSuccess={loadRecords}
        onConfirm={handleConfirmSingle}
        hasPrev={hasPrevRecord}
        hasNext={hasNextRecord}
        onPrev={goPrevRecord}
        onNext={goNextRecord}
      />

      {/* 批量确认对话框 */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>
              确定要确认选中的 {selectedIds.length} 条报账记录吗？确认后将无法修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchConfirm}>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量填提成对话框 */}
      <Dialog open={batchCommissionDialogOpen} onOpenChange={setBatchCommissionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量填写提成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>提成金额</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="请输入提成金额"
                value={batchCommission}
                onChange={(e) => setBatchCommission(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              将为选中的 {selectedIds.length} 条记录填写提成
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchCommissionDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchCommission}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default ExpensesPage;
