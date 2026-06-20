import { useTranslation } from 'react-i18next';

import { TableEmptyRow, TableSkeletonRows } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getEffectiveContractStatus, type EffectiveContractStatus } from '@/lib/legal-contracts';
import type { Contract } from '@/types/legal';

interface ContractTableProps {
  contracts: Contract[];
  loading: boolean;
  search: string;
  status: 'all' | EffectiveContractStatus;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: 'all' | EffectiveContractStatus) => void;
  onSelect: (contract: Contract) => void;
}

const statuses: EffectiveContractStatus[] = ['active', 'expired', 'renewed', 'terminated'];

export default function ContractTable({
  contracts, loading, search, status, onSearchChange, onStatusChange, onSelect,
}: ContractTableProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          placeholder={t('legal.contracts.searchPlaceholder')}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <Select value={status} onValueChange={(value) => onStatusChange(value as 'all' | EffectiveContractStatus)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('legal.contracts.allStatus')}</SelectItem>
            {statuses.map((item) => <SelectItem key={item} value={item}>{t(`legal.contracts.statuses.${item}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('legal.contracts.fields.title')}</TableHead>
                <TableHead>{t('legal.contracts.fields.counterparty')}</TableHead>
                <TableHead>{t('legal.contracts.fields.category')}</TableHead>
                <TableHead>{t('legal.contracts.fields.amount')}</TableHead>
                <TableHead>{t('legal.contracts.period')}</TableHead>
                <TableHead>{t('legal.contracts.fields.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableSkeletonRows columns={6} /> : contracts.length === 0 ? <TableEmptyRow colSpan={6} label={t('legal.contracts.empty')} /> : contracts.map((contract) => {
                const effectiveStatus = getEffectiveContractStatus(contract);
                return (
                  <TableRow key={contract.id} className="cursor-pointer" onClick={() => onSelect(contract)}>
                    <TableCell className="font-medium">
                      {contract.title}
                      <div className="text-xs text-muted-foreground">{contract.contract_no}</div>
                    </TableCell>
                    <TableCell>{contract.counterparty}</TableCell>
                    <TableCell>{t(`legal.contracts.categories.${contract.category}`)}</TableCell>
                    <TableCell>{contract.amount == null ? '-' : `${contract.currency} ${Number(contract.amount).toLocaleString()}`}</TableCell>
                    <TableCell>{contract.start_date || '-'} / {contract.end_date || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={effectiveStatus === 'active' ? 'default' : effectiveStatus === 'expired' ? 'destructive' : 'secondary'}>
                        {t(`legal.contracts.statuses.${effectiveStatus}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
        </Table>
      </div>
    </div>
  );
}
