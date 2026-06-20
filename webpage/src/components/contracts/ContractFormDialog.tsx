import { Loader2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ServiceStaffSession } from '@/types/database';
import type { ContractCategory } from '@/types/legal';
import type { ContractFormValues } from '@/lib/legal-contracts';
import { LEGAL_DOCUMENT_ACCEPT } from '@/lib/legal-file-upload';

export type ContractFormMode = 'create' | 'edit' | 'renew';
const categories: ContractCategory[] = ['transport', 'lease', 'labor', 'purchase', 'service', 'other'];

interface ContractFormDialogProps {
  open: boolean;
  mode: ContractFormMode;
  form: ContractFormValues;
  staff: ServiceStaffSession[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: ContractFormValues) => void;
  onRecognizeFile: (file: File) => void;
  onSubmit: () => void;
}

export default function ContractFormDialog({
  open, mode, form, staff, busy, onOpenChange, onFormChange, onRecognizeFile, onSubmit,
}: ContractFormDialogProps) {
  const { t } = useTranslation();
  const set = <K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) => onFormChange({ ...form, [key]: value });

  const fields: Array<{ key: keyof ContractFormValues; type?: string }> = [
    { key: 'title' }, { key: 'contract_no' }, { key: 'counterparty' }, { key: 'amount', type: 'number' },
    { key: 'currency' }, { key: 'sign_date', type: 'date' }, { key: 'start_date', type: 'date' },
    { key: 'end_date', type: 'date' }, { key: 'renew_notice_days', type: 'number' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(`legal.contracts.dialogTitles.${mode}`)}</DialogTitle>
          <DialogDescription>{t(`legal.contracts.dialogDescriptions.${mode}`)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          {mode === 'create' && (
            <div className="md:col-span-2">
              <Label>{t('legal.contracts.scanFile')}</Label>
              <Input type="file" accept={LEGAL_DOCUMENT_ACCEPT} onChange={(event) => event.target.files?.[0] && onRecognizeFile(event.target.files[0])} />
              {busy && <div className="mt-2 flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('legal.contracts.ocrLoading')}</div>}
            </div>
          )}
          {fields.map(({ key, type }) => (
            <div key={key}>
              <Label>{t(`legal.contracts.fields.${key}`)}</Label>
              <Input type={type || 'text'} value={String(form[key] ?? '')} onChange={(event) => set(key, event.target.value as never)} />
            </div>
          ))}
          <div>
            <Label>{t('legal.contracts.fields.category')}</Label>
            <Select value={form.category} onValueChange={(value: ContractCategory) => set('category', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{t(`legal.contracts.categories.${category}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {staff.length > 0 && (
            <div>
              <Label>{t('legal.contracts.fields.owner_staff_id')}</Label>
              <Select value={form.owner_staff_id || 'none'} onValueChange={(value) => set('owner_staff_id', value === 'none' ? '' : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.none')}</SelectItem>
                  {staff.map((person) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={form.auto_renew} onCheckedChange={(value) => set('auto_renew', value)} />
            <Label>{t('legal.contracts.fields.auto_renew')}</Label>
          </div>
          <div className="md:col-span-2">
            <Label>{t('legal.contracts.fields.remark')}</Label>
            <Textarea value={form.remark} onChange={(event) => set('remark', event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={busy}>
            {mode === 'create' && <Upload className="mr-2 h-4 w-4" />}
            {t(`legal.contracts.submit.${mode}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
