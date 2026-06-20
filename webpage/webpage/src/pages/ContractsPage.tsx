import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import ContractAlerts from '@/components/contracts/ContractAlerts';
import ContractDetailSheet from '@/components/contracts/ContractDetailSheet';
import ContractFormDialog, { type ContractFormMode } from '@/components/contracts/ContractFormDialog';
import ContractTable from '@/components/contracts/ContractTable';
import MainLayout from '@/components/layouts/MainLayout';
import PageErrorState from '@/components/common/PageErrorState';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  acknowledgeContractAlert, createContract, createContractFile, createContractReview, createOperationLog,
  getAllServiceStaff, getContractFiles, getContractReviews, getContracts, getExpiringContracts,
  getLegalDocuments, getLegalFileUrl, renewContract, updateContract, uploadLegalFile,
} from '@/db/api';
import { extractContractFields, scanContractRisk } from '@/lib/contract-extract';
import { parseLegalFile } from '@/lib/fileParsers';
import { getLegalFileProcessingMode, validateLegalDocumentFile } from '@/lib/legal-file-upload';
import {
  buildRenewalDraft, contractToForm, emptyContractForm, formToContractPatch, getChangedContractFields,
  getEffectiveContractStatus, type ContractFormValues, type EffectiveContractStatus,
} from '@/lib/legal-contracts';
import { recognizeImage } from '@/lib/ocr';
import type { ServiceStaffSession } from '@/types/database';
import type { Contract, ContractFile, ContractReviewRecord, ExpiringContract, LegalDocument } from '@/types/legal';

const reviewModel = 'mimo-v2.5-pro';

export default function ContractsPage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [alerts, setAlerts] = useState<ExpiringContract[]>([]);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [reviews, setReviews] = useState<ContractReviewRecord[]>([]);
  const [files, setFiles] = useState<ContractFile[]>([]);
  const [staff, setStaff] = useState<ServiceStaffSession[]>([]);
  const [form, setForm] = useState<ContractFormValues>(emptyContractForm);
  const [formMode, setFormMode] = useState<ContractFormMode>('create');
  const [formOpen, setFormOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [templates, setTemplates] = useState<LegalDocument[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | EffectiveContractStatus>('all');

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, expiring] = await Promise.all([getContracts(), getExpiringContracts()]);
      setContracts(rows);
      setAlerts(expiring);
      setSelected((current) => current ? rows.find((row) => row.id === current.id) || current : null);
    } catch (error) {
      setLoadError(error);
      toast.error(error instanceof Error ? error.message : t('legal.contracts.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      setStaff([user]);
      return;
    }
    void getAllServiceStaff().then(setStaff).catch(() => setStaff([]));
  }, [isAdmin, user]);
  useEffect(() => {
    if (!selected) {
      setReviews([]);
      setFiles([]);
      return;
    }
    void Promise.all([getContractReviews(selected.id), getContractFiles(selected.id)])
      .then(([nextReviews, nextFiles]) => { setReviews(nextReviews); setFiles(nextFiles); })
      .catch((error) => toast.error(error instanceof Error ? error.message : t('legal.contracts.detailLoadFailed')));
  }, [selected?.id]);

  const visible = useMemo(() => contracts.filter((contract) => {
    const matchesStatus = status === 'all' || getEffectiveContractStatus(contract) === status;
    const haystack = `${contract.title} ${contract.counterparty} ${contract.contract_no || ''}`.toLocaleLowerCase();
    return matchesStatus && haystack.includes(search.trim().toLocaleLowerCase());
  }), [contracts, search, status]);

  const renewedFrom = selected?.renewed_from_id ? contracts.find((contract) => contract.id === selected.renewed_from_id) : undefined;
  const renewedTo = selected ? contracts.find((contract) => contract.renewed_from_id === selected.id) : undefined;

  const openForm = (mode: ContractFormMode) => {
    setFormMode(mode);
    setPendingFile(null);
    if (mode === 'create') setForm({ ...emptyContractForm, owner_staff_id: user ? String(user.id) : '' });
    if (mode === 'edit' && selected) setForm(contractToForm(selected));
    if (mode === 'renew' && selected) setForm(buildRenewalDraft(selected));
    setFormOpen(true);
  };

  const handleFile = async (file: File) => {
    const validation = validateLegalDocumentFile(file);
    if (validation) return toast.error(validation === 'too_large' ? t('legal.contracts.fileTooLarge') : t('legal.contracts.invalidFile'));
    setPendingFile(file);
    const mode = getLegalFileProcessingMode(file);
    if (mode === 'attachment') {
      toast.info(t('legal.contracts.attachmentOnly'));
      return;
    }
    setBusy(true);
    try {
      const text = mode === 'ocr' ? (await recognizeImage(file)).text : (await parseLegalFile(file)).text;
      const extracted = await extractContractFields(text);
      setForm((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(extracted).filter(([, value]) => value != null)),
        ocr_text: text,
      } as ContractFormValues));
      toast.success(t('legal.contracts.ocrComplete'));
    } catch (error) {
      toast.error(t('legal.contracts.ocrFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }));
    } finally {
      setBusy(false);
    }
  };

  const saveForm = async () => {
    if (!user || !form.title.trim() || !form.counterparty.trim()) return toast.error(t('legal.contracts.requiredFields'));
    if (formMode === 'renew' && (!form.start_date || !form.end_date)) return toast.error(t('legal.contracts.renewDatesRequired'));
    setBusy(true);
    try {
      const patch = formToContractPatch(form);
      if (formMode === 'create') {
        const row = await createContract({
          ...patch,
          status: 'active',
          renewed_from_id: null,
          owner_staff_id: patch.owner_staff_id || user.id,
          created_by: user.id,
          ocr_text: form.ocr_text || null,
          extracted: null,
        });
        if (pendingFile) {
          const path = `${row.id}/${Date.now()}-${pendingFile.name}`;
          await uploadLegalFile('contracts', path, pendingFile);
          await createContractFile({ contract_id: row.id, storage_path: path, file_name: pendingFile.name, mime_type: pendingFile.type, file_size: pendingFile.size });
        }
        await createOperationLog({ operator_id: user.id, operator_name: user.name, action: 'create', target_type: 'contract', target_id: row.id, detail: `${row.title} · ${row.counterparty}` });
        toast.success(t('legal.contracts.created'));
      } else if (formMode === 'edit' && selected) {
        const changed = getChangedContractFields(selected, form);
        const updated = await updateContract(selected.id, patch);
        await createOperationLog({ operator_id: user.id, operator_name: user.name, action: 'update', target_type: 'contract', target_id: selected.id, detail: changed.join(', ') || t('legal.contracts.noFieldChanges') });
        setSelected(updated);
        toast.success(t('legal.contracts.updated'));
      } else if (formMode === 'renew' && selected) {
        const renewed = await renewContract(selected.id, patch, user);
        setSelected(renewed);
        toast.success(t('legal.contracts.renewedSuccess'));
      }
      setFormOpen(false);
      setPendingFile(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.contracts.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const runReview = async (template?: LegalDocument) => {
    if (!selected?.ocr_text || !user) return toast.error(t('legal.contracts.noOcrText'));
    if (template && !template.current_version?.content_text) return toast.error(t('legal.contracts.templateNoText'));
    setBusy(true);
    try {
      const result = await scanContractRisk(selected.ocr_text, template?.current_version?.content_text);
      await createContractReview({
        contract_id: selected.id,
        review_type: template ? 'template_diff' : 'risk_scan',
        template_version_id: template?.current_version_id || null,
        model: reviewModel,
        ...result,
        created_by: user.id,
      });
      setReviews(await getContractReviews(selected.id));
      setTemplateOpen(false);
      toast.success(t(template ? 'legal.contracts.templateDiffComplete' : 'legal.contracts.riskScanComplete'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.contracts.reviewFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openTemplateDialog = async () => {
    setBusy(true);
    try {
      const rows = await getLegalDocuments('template');
      setTemplates(rows);
      setTemplateId(rows[0] ? String(rows[0].id) : '');
      setTemplateOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.contracts.templateLoadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const terminate = async () => {
    if (!selected || !user || !window.confirm(t('legal.contracts.terminateConfirm'))) return;
    setBusy(true);
    try {
      await updateContract(selected.id, { status: 'terminated' });
      await createOperationLog({ operator_id: user.id, operator_name: user.name, action: 'terminate', target_type: 'contract', target_id: selected.id, detail: selected.title });
      setSelected(null);
      await load();
      toast.success(t('legal.contracts.terminatedSuccess'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.contracts.terminateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t('legal.contracts.title')}
          description={t('legal.contracts.description')}
          actions={<>
            <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />{t('common.refresh')}</Button>
            <Button onClick={() => openForm('create')}><Plus className="mr-2 h-4 w-4" />{t('legal.contracts.add')}</Button>
          </>}
        />
        {loadError !== null && <PageErrorState error={loadError} onRetry={() => void load()} />}
        <ContractAlerts
          alerts={alerts}
          busy={busy}
          onAcknowledge={(alert) => void (async () => {
            setBusy(true);
            try { await acknowledgeContractAlert(alert.id, alert.alert_level, user?.id); await load(); }
            finally { setBusy(false); }
          })()}
        />
        <Card><CardContent className="pt-6"><ContractTable contracts={visible} loading={loading} search={search} status={status} onSearchChange={setSearch} onStatusChange={setStatus} onSelect={setSelected} /></CardContent></Card>
        <ContractFormDialog open={formOpen} mode={formMode} form={form} staff={staff} busy={busy} onOpenChange={setFormOpen} onFormChange={setForm} onRecognizeFile={(file) => void handleFile(file)} onSubmit={() => void saveForm()} />
        <ContractDetailSheet
          contract={selected}
          renewedFrom={renewedFrom}
          renewedTo={renewedTo}
          files={files}
          reviews={reviews}
          isAdmin={isAdmin}
          busy={busy}
          onClose={() => setSelected(null)}
          onSelectContract={setSelected}
          onOpenFile={(file) => void getLegalFileUrl('contracts', file.storage_path).then((url) => window.open(url, '_blank'))}
          onRiskScan={() => void runReview()}
          onTemplateDiff={() => void openTemplateDialog()}
          onEdit={() => openForm('edit')}
          onRenew={() => openForm('renew')}
          onTerminate={() => void terminate()}
        />
        <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('legal.contracts.selectTemplate')}</DialogTitle>
              <DialogDescription>{t('legal.contracts.templateDialogDescription')}</DialogDescription>
            </DialogHeader>
            {templates.length === 0 ? <p className="text-sm text-muted-foreground">{t('legal.contracts.noTemplates')}</p> : (
              <div><Label>{t('legal.contracts.template')}</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.id} value={String(template.id)}>{template.title}</SelectItem>)}</SelectContent></Select></div>
            )}
            <DialogFooter><Button disabled={busy || !templateId} onClick={() => void runReview(templates.find((template) => String(template.id) === templateId))}>{t('legal.contracts.startTemplateDiff')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
