import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Power, RefreshCw } from 'lucide-react';
import { getAllFeeTypes, createFeeType, updateFeeType, createOperationLog } from '@/db/api';
import type { FeeType } from '@/types/database';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PageHeader from '@/components/common/PageHeader';
import { ResponsiveTable, TableActionsCell, TableActionsHead, TableEmptyRow, TableLoadingState } from '@/components/common/DataTable';
import PageErrorState from '@/components/common/PageErrorState';

const FeeTypesPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeeType, setEditingFeeType] = useState<FeeType | null>(null);
  const [formData, setFormData] = useState({
    field_name: '',
    display_name: '',
    sort_order: 0,
  });

  useEffect(() => {
    loadFeeTypes();
  }, []);

  const loadFeeTypes = async (forceRefresh = false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAllFeeTypes(false, { forceRefresh });
      setFeeTypes(data);
    } catch (error) {
      console.error('加载费用类型失败:', error);
      setLoadError(error);
      toast.error(t('toast.loadFeeTypesFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (feeType?: FeeType) => {
    if (feeType) {
      setEditingFeeType(feeType);
      setFormData({
        field_name: feeType.field_name,
        display_name: feeType.display_name,
        sort_order: feeType.sort_order,
      });
    } else {
      setEditingFeeType(null);
      setFormData({
        field_name: '',
        display_name: '',
        sort_order: 0,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (!formData.field_name || !formData.display_name) {
      toast.error(t('toast.fillRequired'));
      return;
    }

    try {
      if (editingFeeType) {
        await updateFeeType(editingFeeType.id, {
          display_name: formData.display_name,
          sort_order: formData.sort_order,
        });
        await createOperationLog({
          operator_id: user.id,
          operator_name: user.name,
          action: 'update',
          target_type: 'fee_type',
          target_id: editingFeeType.id,
          detail: `修改费用类型：${formData.display_name}`,
        });
        toast.success(t('toast.updateSuccess'));
      } else {
        const newFeeType = await createFeeType({
          ...formData,
          is_active: true,
        });
        await createOperationLog({
          operator_id: user.id,
          operator_name: user.name,
          action: 'create',
          target_type: 'fee_type',
          target_id: newFeeType.id,
          detail: `新增费用类型：${formData.display_name}`,
        });
        toast.success(t('toast.createSuccess'));
      }
      setDialogOpen(false);
      loadFeeTypes();
    } catch (error) {
      console.error('操作失败:', error);
      toast.error(t('toast.operationFailed'));
    }
  };

  const handleToggleActive = async (feeType: FeeType) => {
    if (!user) return;

    if (feeType.field_name === 'other') {
      toast.error(t('feeTypes.otherCannotDisable'));
      return;
    }

    try {
      await updateFeeType(feeType.id, { is_active: !feeType.is_active });
      await createOperationLog({
        operator_id: user.id,
        operator_name: user.name,
        action: 'update',
        target_type: 'fee_type',
        target_id: feeType.id,
        detail: `${feeType.is_active ? '停用' : '启用'}费用类型：${feeType.display_name}`,
      });
      toast.success(feeType.is_active ? t('toast.disabled') : t('toast.enabled'));
      loadFeeTypes();
    } catch (error) {
      console.error('操作失败:', error);
      toast.error(t('toast.operationFailed'));
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t('feeTypes.title')}
          description={t('feeTypes.description')}
          actions={
            <>
            <Button onClick={() => loadFeeTypes(true)} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh')}
            </Button>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('feeTypes.add')}
            </Button>
            </>
          }
        />
        {loadError !== null && <PageErrorState error={loadError} onRetry={() => loadFeeTypes(true)} />}

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <TableLoadingState label={t('common.loading')} />
            ) : (
              <ResponsiveTable minWidth="720px">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.fieldName')}</TableHead>
                    <TableHead>{t('common.displayName')}</TableHead>
                    <TableHead>{t('common.sortOrder')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableActionsHead>{t('common.actions')}</TableActionsHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeTypes.length === 0 ? (
                    <TableEmptyRow colSpan={5} label={t('common.noData')} />
                  ) : (
                    feeTypes.map((feeType) => (
                      <TableRow key={feeType.id}>
                        <TableCell className="font-mono text-sm">{feeType.field_name}</TableCell>
                        <TableCell className="font-medium">{feeType.display_name}</TableCell>
                        <TableCell>{feeType.sort_order}</TableCell>
                        <TableActionsCell>
                          {feeType.is_active ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success">
                              {t('common.enabled')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                              {t('common.disabled')}
                            </Badge>
                          )}
                        </TableActionsCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(feeType)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              {t('common.edit')}
                            </Button>
                            {feeType.field_name === 'other' ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0}>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled
                                        className="opacity-50 cursor-not-allowed"
                                      >
                                        <Power className="h-4 w-4 mr-1" />
                                        {t('common.disabled')}
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('feeTypes.otherCannotDisableTip')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleToggleActive(feeType)}
                              >
                                <Power className="h-4 w-4 mr-1" />
                                {feeType.is_active ? t('common.disabled') : t('common.enabled')}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </ResponsiveTable>
            )}
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground">
          <p>{t('feeTypes.note')}</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>{t('feeTypes.fieldImmutable')}</li>
            <li>{t('feeTypes.otherProtected')}</li>
            <li>{t('feeTypes.dbFieldRequired')}</li>
          </ul>
        </div>
      </div>

      {/* 新增/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFeeType ? t('feeTypes.edit') : t('feeTypes.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('feeTypes.fieldNameEn')}</Label>
              <Input
                value={formData.field_name}
                onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
                placeholder={t('feeTypes.fieldPlaceholder')}
                disabled={!!editingFeeType}
              />
              {!editingFeeType && (
                <p className="text-xs text-muted-foreground">
                  {t('feeTypes.fieldImmutableHint')}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('feeTypes.displayNameZh')}</Label>
              <Input
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                placeholder={t('feeTypes.displayPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('common.sortOrder')}</Label>
              <Input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: Number(e.target.value) })}
                placeholder={t('feeTypes.sortPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingFeeType ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default FeeTypesPage;
