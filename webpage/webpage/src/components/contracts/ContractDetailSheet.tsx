import { FileSearch, GitCompareArrows, Pencil, RefreshCcw, ScanLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import RiskScanReport from './RiskScanReport';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getEffectiveContractStatus } from '@/lib/legal-contracts';
import type { Contract, ContractFile, ContractReviewRecord } from '@/types/legal';

interface ContractDetailSheetProps {
  contract: Contract | null;
  renewedFrom?: Contract;
  renewedTo?: Contract;
  files: ContractFile[];
  reviews: ContractReviewRecord[];
  isAdmin: boolean;
  busy: boolean;
  onClose: () => void;
  onSelectContract: (contract: Contract) => void;
  onOpenFile: (file: ContractFile) => void;
  onRiskScan: () => void;
  onTemplateDiff: () => void;
  onEdit: () => void;
  onRenew: () => void;
  onTerminate: () => void;
}

export default function ContractDetailSheet({
  contract, renewedFrom, renewedTo, files, reviews, isAdmin, busy, onClose, onSelectContract,
  onOpenFile, onRiskScan, onTemplateDiff, onEdit, onRenew, onTerminate,
}: ContractDetailSheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={Boolean(contract)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{contract?.title}</SheetTitle></SheetHeader>
        {contract && (
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>{t('legal.contracts.fields.counterparty')}：{contract.counterparty}</div>
              <div>{t('legal.contracts.fields.contract_no')}：{contract.contract_no || '-'}</div>
              <div>{t('legal.contracts.fields.status')}：{t(`legal.contracts.statuses.${getEffectiveContractStatus(contract)}`)}</div>
              <div>{t('legal.contracts.fields.end_date')}：{contract.end_date || '-'}</div>
            </div>
            {(renewedFrom || renewedTo) && (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                {renewedFrom && <button className="block text-primary hover:underline" onClick={() => onSelectContract(renewedFrom)}>{t('legal.contracts.renewedFrom', { title: renewedFrom.title })}</button>}
                {renewedTo && <button className="block text-primary hover:underline" onClick={() => onSelectContract(renewedTo)}>{t('legal.contracts.renewedTo', { title: renewedTo.title })}</button>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={onRiskScan} disabled={busy || !contract.ocr_text}><ScanLine className="mr-2 h-4 w-4" />{t('legal.contracts.riskScan')}</Button>
              <Button variant="outline" onClick={onTemplateDiff} disabled={busy || !contract.ocr_text}><GitCompareArrows className="mr-2 h-4 w-4" />{t('legal.contracts.templateDiff')}</Button>
              {isAdmin && <Button variant="outline" onClick={onEdit} disabled={busy}><Pencil className="mr-2 h-4 w-4" />{t('legal.contracts.edit')}</Button>}
              {isAdmin && contract.status === 'active' && <Button variant="outline" onClick={onRenew} disabled={busy}><RefreshCcw className="mr-2 h-4 w-4" />{t('legal.contracts.renew')}</Button>}
              {isAdmin && contract.status === 'active' && <Button variant="destructive" onClick={onTerminate} disabled={busy}>{t('legal.contracts.terminate')}</Button>}
            </div>
            <div>
              <h3 className="mb-2 font-semibold">{t('legal.contracts.attachments')}</h3>
              {files.length === 0 ? <p className="text-sm text-muted-foreground">{t('legal.contracts.noAttachments')}</p> : files.map((file) => (
                <Button key={file.id} variant="link" onClick={() => onOpenFile(file)}><FileSearch className="mr-2 h-4 w-4" />{file.file_name}</Button>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-semibold">{t('legal.contracts.reports')}</h3>
              <RiskScanReport reviews={reviews} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
