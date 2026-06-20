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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, RotateCcw, AlertCircle, ClipboardCheck, Eye, X } from 'lucide-react';
import { getExpenseRecords, getAllDrivers, confirmExpenseRecord, unconfirmExpenseRecord, batchConfirmExpenseRecords, batchUpdateCommission, createOperationLog } from '@/db/api';
import type { ExpenseRecordWithDriver, DriverProfile } from '@/types/database';
import { format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import EditExpenseDialog from '@/components/expenses/EditExpenseDialog';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/common/PageHeader';
import PageErrorState from '@/components/common/PageErrorState';
import { ResponsiveTable, TableActionsCell, TableActionsHead, TableEmptyRow, TableLoadingState } from '@/components/common/DataTable';
import { firstLoadError } from '@/lib/loadError';

const ExpensesPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<ExpenseRecordWithDriver[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [supportError, setSupportError] = useState<unknown>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [batchCommissionDialogOpen, setBatchCommissionDialogOpen] = useState(false);
  const [batchCommission, setBatchCommission] = useState('');
  const [activeRecord, setActiveRecord] = useState<ExpenseRecordWithDriver | null>(null);
  const [unconfirmDialogOpen, setUnconfirmDialogOpen] = useState(false);
  const [unconfirmRecordId, setUnconfirmRecordId] = useState<number | null>(null);
  const [unconfirmReason, setUnconfirmReason] = useState('');
  const [unconfirming, setUnconfirming] = useState(false);

  // 筛选条件
  const [filters, setFilters] = useState({
    driverId: searchParams.get('driverId') || '',
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    status: '',
  });

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    loadRecords();
  }, [filters]);

  const loadDrivers = async (forceRefresh = false) => {
    setSupportError(null);
    try {
      const driverList = await getAllDrivers(true, { forceRefresh });
      setDrivers(driverList);
    } catch (error) {
      console.error('加载司机列表失败:', error);
      setSupportError(error);
      toast.error(t('toast.loadDriversFailed'));
    }
  };

  const loadRecords = async () => {
    setLoading(true);
    setLoadError(null);
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
      setLoadError(error);
      toast.error(t('toast.loadDataFailed'));
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
      toast.success(t('toast.confirmSuccess'));
      setActiveRecord(null);
      loadRecords();
    } catch (error) {
      console.error('确认失败:', error);
      toast.error(t('toast.confirmFailed'));
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
      toast.success(t('expenses.batchConfirmSuccess', { count: selectedIds.length }));
      setConfirmDialogOpen(false);
      loadRecords();
    } catch (error) {
      console.error('批量确认失败:', error);
      toast.error(t('expenses.batchConfirmFailed'));
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
      toast.success(t('expenses.batchCommissionSuccess', { count: selectedIds.length }));
      setBatchCommissionDialogOpen(false);
      loadRecords();
    } catch (error) {
      console.error('批量填写提成失败:', error);
      toast.error(t('expenses.batchCommissionFailed'));
    }
  };

  const handleOpenUnconfirm = (id: number) => {
    setUnconfirmRecordId(id);
    setUnconfirmReason('');
    setUnconfirmDialogOpen(true);
  };

  const handleConfirmUnconfirm = async () => {
    if (!unconfirmRecordId || !user) return;
    if (!unconfirmReason.trim()) {
      toast.error(t('expenses.unconfirmReasonRequired'));
      return;
    }

    setUnconfirming(true);
    try {
      await unconfirmExpenseRecord(unconfirmRecordId, user.username || user.name, unconfirmReason.trim());
      await createOperationLog({
        operator_id: user.id,
        operator_name: user.name,
        action: 'update',
        target_type: 'expense_record',
        target_id: unconfirmRecordId,
        detail: `反审核报账记录，原因：${unconfirmReason.trim()}`,
      });
      toast.success(t('expenses.unconfirmSuccess'));
      setUnconfirmDialogOpen(false);
      setUnconfirmRecordId(null);
      await loadRecords();
    } catch (error) {
      console.error('反审核失败:', error);
      toast.error(t('expenses.unconfirmFailed'));
    } finally {
      setUnconfirming(false);
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

  const pendingRecords = records.filter((record) => record.status === 'pending');
  const pageError = firstLoadError(loadError, supportError);
  const hasSelection = selectedIds.length > 0;
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

  const refreshPage = () => {
    void Promise.all([loadDrivers(true), loadRecords()]);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t('expenses.title')}
          description={t('expenses.description')}
          actions={
            <Button onClick={refreshPage} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh')}
            </Button>
          }
        />
        {pageError !== null && <PageErrorState error={pageError} onRetry={refreshPage} />}

        {/* 筛选栏 */}
        <Card className="bg-muted/10 border-dashed">
          <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>{t('common.driver')}</Label>
                <Select value={filters.driverId || 'all'} onValueChange={(value) => setFilters({ ...filters, driverId: value === 'all' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.allDrivers')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.allDrivers')}</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id.toString()}>
                        {driver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('common.startDate')}</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.endDate')}</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('common.status')}</Label>
                <Select value={filters.status || 'all'} onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="pending">{t('common.pending')}</SelectItem>
                    <SelectItem value="confirmed">{t('common.confirmed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 常驻批量操作栏 */}
        <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">
              {hasSelection
                ? t('common.selectedCount', { count: selectedIds.length })
                : t('expenses.batchToolbarTitle')}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasSelection
                ? t('expenses.batchSelectionHint')
                : t('expenses.batchEmptyHint', { count: pendingRecords.length })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {hasSelection && (
              <Button size="sm" variant="ghost" className="col-span-2 sm:col-span-1" onClick={() => setSelectedIds([])}>
                <X className="h-4 w-4" />
                {t('expenses.clearSelection')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!hasSelection}
              title={!hasSelection ? t('expenses.selectPendingFirst') : undefined}
              onClick={() => setBatchCommissionDialogOpen(true)}
            >
              {t('expenses.batchCommission')}
            </Button>
            <Button
              size="sm"
              disabled={!hasSelection}
              title={!hasSelection ? t('expenses.selectPendingFirst') : undefined}
              onClick={() => setConfirmDialogOpen(true)}
            >
              {t('expenses.batchConfirm')}
            </Button>
          </div>
        </div>

        {/* 报账记录列表 */}
        <Card>
          <CardContent className="px-0 pt-4 sm:px-6 sm:pt-6">
            {loading ? (
              <TableLoadingState label={t('common.loading')} />
            ) : (
              <ResponsiveTable minWidth="900px" className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9 px-1">
                      <Checkbox
                        aria-label={t('expenses.selectAllPending')}
                        checked={selectedIds.length === pendingRecords.length && pendingRecords.length > 0}
                        onCheckedChange={toggleSelectAll}
                        disabled={pendingRecords.length === 0}
                      />
                    </TableHead>
                    <TableHead className="w-[86px] whitespace-nowrap px-1">{t('common.date')}</TableHead>
                    <TableHead className="w-[60px] whitespace-nowrap px-1">{t('common.driver')}</TableHead>
                    <TableHead className="w-[72px] whitespace-nowrap px-1">{t('vehicles.plateNumber')}</TableHead>
                    <TableHead className="w-[100px] px-1">{t('expenses.route')}</TableHead>
                    <TableHead className="w-[72px] whitespace-nowrap text-right px-1">{t('expenses.expense')}</TableHead>
                    <TableHead className="w-[64px] whitespace-nowrap text-right px-1">{t('expenses.commission')}</TableHead>
                    <TableHead className="w-[64px] whitespace-nowrap px-1">{t('common.status')}</TableHead>
                    <TableActionsHead className="w-[220px] px-1">{t('common.actions')}</TableActionsHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableEmptyRow colSpan={9} label={t('expenses.noRecords')} />
                  ) : (
                    records.map((record, index) => (
                      <TableRow
                        key={record.id}
                        className={index % 2 === 0 ? 'bg-muted/20' : ''}
                      >
                        <TableCell className="px-1">
                          {record.status === 'pending' && (
                            <Checkbox
                              aria-label={t('expenses.selectRecord', {
                                driver: record.driver?.name || '-',
                                date: format(new Date(record.record_date), 'yyyy-MM-dd'),
                                vehicle: record.plate_number || '-',
                              })}
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
                              {t('common.pending')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-success text-success">
                              {t('common.confirmed')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableActionsCell className="px-1">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant={record.status === 'pending' ? 'default' : 'ghost'}
                              className="h-7 px-2 text-xs"
                              onClick={() => setActiveRecord(record)}
                            >
                              {record.status === 'pending' ? (
                                <>
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                  {t('expenses.review')}
                                </>
                              ) : (
                                <>
                                  <Eye className="h-3.5 w-3.5" />
                                  {t('common.view')}
                                </>
                              )}
                            </Button>
                            {record.status === 'confirmed' && isAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-orange-600 hover:bg-orange-50"
                                onClick={() => handleOpenUnconfirm(record.id)}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                {t('expenses.unconfirm')}
                              </Button>
                            )}
                            {record.status === 'confirmed' && !isAdmin && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground italic cursor-help">
                                      {t('expenses.confirmedLocked')}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('expenses.confirmedLockedTip')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableActionsCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </ResponsiveTable>
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
            <AlertDialogTitle>{t('expenses.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('expenses.confirmDescription', { count: selectedIds.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchConfirm}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量填提成对话框 */}
      <Dialog open={batchCommissionDialogOpen} onOpenChange={setBatchCommissionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.batchCommissionTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('expenses.commissionAmount')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder={t('expenses.commissionPlaceholder')}
                value={batchCommission}
                onChange={(e) => setBatchCommission(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {t('expenses.batchCommissionHint', { count: selectedIds.length })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchCommissionDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleBatchCommission}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unconfirmDialogOpen} onOpenChange={setUnconfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.unconfirmTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('expenses.unconfirmDescription')}</p>
            <div className="space-y-2">
              <Label>{t('expenses.unconfirmReason')} *</Label>
              <Textarea
                value={unconfirmReason}
                onChange={(e) => setUnconfirmReason(e.target.value)}
                placeholder={t('expenses.unconfirmReasonPlaceholder')}
                rows={3}
              />
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{t('expenses.unconfirmWarning')}</AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnconfirmDialogOpen(false)} disabled={unconfirming}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmUnconfirm}
              disabled={unconfirming || !unconfirmReason.trim()}
            >
              {unconfirming ? t('common.loading') : t('expenses.confirmUnconfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default ExpensesPage;
