import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { getOperationLogs, getAllServiceStaff } from '@/db/api';
import type { OperationLog, ServiceStaffSession } from '@/types/database';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/common/PageHeader';
import { ResponsiveTable, TableEmptyRow, TableLoadingState } from '@/components/common/DataTable';
import PageErrorState from '@/components/common/PageErrorState';
import { firstLoadError } from '@/lib/loadError';

const LogsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [staff, setStaff] = useState<ServiceStaffSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [supportError, setSupportError] = useState<unknown>(null);
  const [filters, setFilters] = useState({
    operatorId: '',
    action: '',
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      void loadStaff();
      return;
    }

    setStaff([user]);
    setFilters((current) => ({ ...current, operatorId: String(user.id) }));
  }, [isAdmin, user]);

  useEffect(() => {
    loadLogs();
  }, [filters]);

  const loadStaff = async (forceRefresh = false) => {
    setSupportError(null);
    try {
      const data = await getAllServiceStaff({ forceRefresh });
      setStaff(data);
    } catch (error) {
      console.error('加载客服列表失败:', error);
      setSupportError(error);
      toast.error(t('toast.loadStaffFailed'));
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getOperationLogs({
        operatorId: filters.operatorId ? Number(filters.operatorId) : undefined,
        action: filters.action || undefined,
        startDate: `${filters.startDate}T00:00:00`,
        endDate: `${filters.endDate}T23:59:59`,
        limit: 100,
      });
      setLogs(data);
    } catch (error) {
      console.error('加载操作日志失败:', error);
      setLoadError(error);
      toast.error(t('toast.loadLogsFailed'));
    } finally {
      setLoading(false);
    }
  };

  const getActionName = (action: string) => {
    const actionMap: Record<string, string> = {
      confirm: t('logs.actions.confirm'),
      edit: t('logs.actions.edit'),
      create: t('logs.actions.create'),
      update: t('logs.actions.update'),
      delete: t('logs.actions.delete'),
      renew: t('logs.actions.renew'),
      terminate: t('logs.actions.terminate'),
    };
    return actionMap[action] || action;
  };

  const getTargetTypeName = (targetType: string) => {
    const typeMap: Record<string, string> = {
      expense_record: t('logs.targets.expense_record'),
      driver: t('logs.targets.driver'),
      vehicle: t('logs.targets.vehicle'),
      advance_fund: t('logs.targets.advance_fund'),
      fee_type: t('logs.targets.fee_type'),
      staff: t('logs.targets.staff'),
      contract: t('logs.targets.contract'),
      legal_document: t('logs.targets.legal_document'),
    };
    return typeMap[targetType] || targetType;
  };

  const pageError = firstLoadError(loadError, supportError);
  const refreshPage = () => {
    void Promise.all([loadLogs(), ...(isAdmin ? [loadStaff(true)] : [])]);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t('logs.title')}
          description={t('logs.description')}
          actions={
            <Button onClick={refreshPage} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh')}
            </Button>
          }
        />
        {pageError !== null && <PageErrorState error={pageError} onRetry={refreshPage} />}

        {/* 筛选栏 */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>{t('logs.operator')}</Label>
                <Select
                  value={filters.operatorId || 'all'}
                  disabled={!isAdmin}
                  onValueChange={(value) => setFilters({ ...filters, operatorId: value === 'all' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    {isAdmin && <SelectItem value="all">{t('common.all')}</SelectItem>}
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('logs.actionType')}</Label>
                <Select value={filters.action || 'all'} onValueChange={(value) => setFilters({ ...filters, action: value === 'all' ? '' : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="confirm">{t('logs.actions.confirm')}</SelectItem>
                    <SelectItem value="edit">{t('logs.actions.edit')}</SelectItem>
                    <SelectItem value="create">{t('logs.actions.create')}</SelectItem>
                    <SelectItem value="update">{t('logs.actions.update')}</SelectItem>
                    <SelectItem value="delete">{t('logs.actions.delete')}</SelectItem>
                    <SelectItem value="renew">{t('logs.actions.renew')}</SelectItem>
                    <SelectItem value="terminate">{t('logs.actions.terminate')}</SelectItem>
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
            </div>
          </CardContent>
        </Card>

        {/* 日志列表 */}
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <TableLoadingState label={t('common.loading')} />
            ) : (
              <ResponsiveTable minWidth="860px">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('logs.time')}</TableHead>
                    <TableHead>{t('logs.operator')}</TableHead>
                    <TableHead>{t('logs.action')}</TableHead>
                    <TableHead>{t('logs.target')}</TableHead>
                    <TableHead>{t('logs.detail')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableEmptyRow colSpan={5} label={t('common.noData')} />
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                        <TableCell>{log.operator_name}</TableCell>
                        <TableCell>{getActionName(log.action)}</TableCell>
                        <TableCell>
                          {getTargetTypeName(log.target_type)} #{log.target_id}
                        </TableCell>
                        <TableCell className="max-w-md truncate">{log.detail || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </ResponsiveTable>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default LogsPage;
