import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Power, RefreshCw } from 'lucide-react';
import { getAllVehicles, createVehicle, updateVehicle, createOperationLog } from '@/db/api';
import type { Vehicle } from '@/types/database';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

const VehiclesPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState({
    plate_number: '',
    vehicle_type: 'own' as 'own' | 'affiliated' | 'rented',
    source: '',
  });

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const data = await getAllVehicles();
      setVehicles(data);
    } catch (error) {
      console.error('加载车辆列表失败:', error);
      toast.error(t('toast.loadVehiclesFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (vehicle?: Vehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setFormData({
        plate_number: vehicle.plate_number,
        vehicle_type: vehicle.vehicle_type,
        source: vehicle.source || '',
      });
    } else {
      setEditingVehicle(null);
      setFormData({
        plate_number: '',
        vehicle_type: 'own',
        source: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (!formData.plate_number) {
      toast.error(t('vehicles.plateRequired'));
      return;
    }

    if ((formData.vehicle_type === 'affiliated' || formData.vehicle_type === 'rented') && !formData.source) {
      toast.error(t('vehicles.sourceRequired'));
      return;
    }

    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, formData);
        await createOperationLog({
          operator_id: user.id,
          operator_name: user.name,
          action: 'update',
          target_type: 'vehicle',
          target_id: editingVehicle.id,
          detail: `修改车辆信息：${formData.plate_number}`,
        });
        toast.success(t('toast.updateSuccess'));
      } else {
        const newVehicle = await createVehicle({
          ...formData,
          is_active: true,
        });
        await createOperationLog({
          operator_id: user.id,
          operator_name: user.name,
          action: 'create',
          target_type: 'vehicle',
          target_id: newVehicle.id,
          detail: `新增车辆：${formData.plate_number}`,
        });
        toast.success(t('toast.createSuccess'));
      }
      setDialogOpen(false);
      loadVehicles();
    } catch (error) {
      console.error('操作失败:', error);
      toast.error(t('toast.operationFailed'));
    }
  };

  const handleToggleActive = async (vehicle: Vehicle) => {
    if (!user) return;
    try {
      await updateVehicle(vehicle.id, { is_active: !vehicle.is_active });
      await createOperationLog({
        operator_id: user.id,
        operator_name: user.name,
        action: 'update',
        target_type: 'vehicle',
        target_id: vehicle.id,
        detail: `${vehicle.is_active ? '停用' : '启用'}车辆：${vehicle.plate_number}`,
      });
      toast.success(vehicle.is_active ? t('toast.disabled') : t('toast.enabled'));
      loadVehicles();
    } catch (error) {
      console.error('操作失败:', error);
      toast.error(t('toast.operationFailed'));
    }
  };

  const getVehicleTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      own: t('vehicles.own'),
      affiliated: t('vehicles.affiliated'),
      rented: t('vehicles.rented'),
    };
    return typeMap[type] || type;
  };

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchSearch = vehicle.plate_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = !filterType || vehicle.vehicle_type === filterType;
    return matchSearch && matchType;
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold border-b pb-4 mb-6">{t('vehicles.title')}</h1>
          <div className="flex items-center gap-2">
            <Button onClick={loadVehicles} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('common.refresh')}
            </Button>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              {t('vehicles.add')}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input
                placeholder={t('common.searchPlate')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select value={filterType || 'all'} onValueChange={(value) => setFilterType(value === 'all' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.allTypes')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allTypes')}</SelectItem>
                  <SelectItem value="own">{t('vehicles.own')}</SelectItem>
                  <SelectItem value="affiliated">{t('vehicles.affiliated')}</SelectItem>
                  <SelectItem value="rented">{t('vehicles.rented')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('vehicles.plateNumber')}</TableHead>
                    <TableHead>{t('vehicles.vehicleType')}</TableHead>
                    <TableHead>{t('vehicles.source')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('common.createdAt')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVehicles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {t('common.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVehicles.map((vehicle) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">{vehicle.plate_number}</TableCell>
                        <TableCell>{getVehicleTypeName(vehicle.vehicle_type)}</TableCell>
                        <TableCell>{vehicle.source || '-'}</TableCell>
                        <TableCell>
                          {vehicle.is_active ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success">
                              {t('common.enabled')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                              {t('common.disabled')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{format(new Date(vehicle.created_at), 'yyyy-MM-dd')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenDialog(vehicle)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              {t('common.edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleToggleActive(vehicle)}
                            >
                              <Power className="h-4 w-4 mr-1" />
                              {vehicle.is_active ? t('common.disabled') : t('common.enabled')}
                            </Button>
                          </div>
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

      {/* 新增/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVehicle ? t('vehicles.edit') : t('vehicles.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('vehicles.plateNumber')}</Label>
              <Input
                value={formData.plate_number}
                onChange={(e) => setFormData({ ...formData, plate_number: e.target.value })}
                placeholder={t('vehicles.inputPlate')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('vehicles.vehicleType')}</Label>
              <Select
                value={formData.vehicle_type}
                onValueChange={(value: 'own' | 'affiliated' | 'rented') =>
                  setFormData({ ...formData, vehicle_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">{t('vehicles.own')}</SelectItem>
                  <SelectItem value="affiliated">{t('vehicles.affiliated')}</SelectItem>
                  <SelectItem value="rented">{t('vehicles.rented')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(formData.vehicle_type === 'affiliated' || formData.vehicle_type === 'rented') && (
              <div className="space-y-2">
                <Label>{t('vehicles.source')}</Label>
                <Input
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder={t('vehicles.inputSource')}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {editingVehicle ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default VehiclesPage;
