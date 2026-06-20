import { useEffect, useRef, useState } from 'react';
import { Bot, Download, FilePlus2, Search, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { TableEmptyRow, TableSkeletonRows } from '@/components/common/DataTable';
import MainLayout from '@/components/layouts/MainLayout';
import PageErrorState from '@/components/common/PageErrorState';
import PageHeader from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import {
  archiveLegalDocument, createLegalDocument, createLegalDocumentVersion, createOperationLog,
  getLegalDocumentVersions, getLegalFileUrl, searchLegalDocuments, uploadLegalFile,
} from '@/db/api';
import { useDebounce } from '@/hooks/use-debounce';
import { parseLegalFile } from '@/lib/fileParsers';
import { splitSearchHighlight } from '@/lib/legal-search';
import type { LegalDocument, LegalDocumentType, LegalDocumentVersion } from '@/types/legal';

const types: LegalDocumentType[] = ['template', 'policy', 'regulation', 'litigation', 'authorization', 'other'];

function HighlightedExcerpt({ text, keyword }: { text: string; keyword: string }) {
  return (
    <p className="mt-1 max-w-xl text-xs text-muted-foreground">
      {splitSearchHighlight(text, keyword).map((part, index) => part.match
        ? <mark key={index} className="rounded bg-yellow-200 px-0.5 text-foreground">{part.text}</mark>
        : <span key={index}>{part.text}</span>)}
    </p>
  );
}

export default function LegalLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [selected, setSelected] = useState<LegalDocument | null>(null);
  const [versions, setVersions] = useState<LegalDocumentVersion[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [type, setType] = useState<'all' | LegalDocumentType>('all');
  const [dialog, setDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<LegalDocumentType>('other');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const requestId = useRef(0);

  const load = async (keyword = debouncedSearch, selectedType = type) => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await searchLegalDocuments(keyword, selectedType === 'all' ? undefined : selectedType);
      if (id !== requestId.current) return;
      setDocuments(rows);
      setSelected((current) => current ? rows.find((document) => document.id === current.id) || current : null);
    } catch (error) {
      if (id !== requestId.current) return;
      setLoadError(error);
      toast.error(error instanceof Error ? error.message : t('legal.library.loadFailed'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => { void load(debouncedSearch, type); }, [debouncedSearch, type]);
  useEffect(() => {
    if (!selected) {
      setVersions([]);
      return;
    }
    void getLegalDocumentVersions(selected.id).then(setVersions).catch((error) => toast.error(error instanceof Error ? error.message : t('legal.library.versionLoadFailed')));
  }, [selected?.id]);

  const parseFile = async (source: File) => {
    let contentText = '';
    let textStatus: LegalDocumentVersion['text_status'] = 'done';
    try {
      if (source.type.startsWith('text/') || /\.(txt|md)$/i.test(source.name)) contentText = await source.text();
      else if (/\.docx?$/i.test(source.name)) textStatus = 'pending';
      else contentText = (await parseLegalFile(source)).text;
    } catch {
      textStatus = 'failed';
    }
    return { contentText, textStatus };
  };

  const upload = async () => {
    if (!user || !file || !title.trim()) return toast.error(t('legal.library.requiredFields'));
    setBusy(true);
    try {
      const document = await createLegalDocument({ title: title.trim(), doc_type: docType, tags: tags.split(',').map((item) => item.trim()).filter(Boolean), created_by: user.id });
      const path = `${document.id}/v1-${Date.now()}-${file.name}`;
      await uploadLegalFile('legal-library', path, file);
      const { contentText, textStatus } = await parseFile(file);
      await createLegalDocumentVersion({ document_id: document.id, version_no: 1, storage_path: path, file_name: file.name, mime_type: file.type, file_size: file.size, content_text: contentText, text_status: textStatus, note: null, created_by: user.id });
      await createOperationLog({ operator_id: user.id, operator_name: user.name, action: 'create', target_type: 'legal_document', target_id: document.id, detail: `${document.title} · ${t(`legal.library.types.${document.doc_type}`)}` });
      setDialog(false);
      setTitle('');
      setTags('');
      setFile(null);
      await load();
      toast.success(t('legal.library.uploaded'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.library.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const uploadVersion = async (versionFile: File) => {
    if (!selected || !isAdmin || !user) return;
    setBusy(true);
    try {
      const nextVersion = Math.max(0, ...versions.map((version) => version.version_no)) + 1;
      const path = `${selected.id}/v${nextVersion}-${Date.now()}-${versionFile.name}`;
      await uploadLegalFile('legal-library', path, versionFile);
      const { contentText, textStatus } = await parseFile(versionFile);
      await createLegalDocumentVersion({ document_id: selected.id, version_no: nextVersion, storage_path: path, file_name: versionFile.name, mime_type: versionFile.type, file_size: versionFile.size, content_text: contentText, text_status: textStatus, note: null, created_by: user.id });
      await createOperationLog({ operator_id: user.id, operator_name: user.name, action: 'update', target_type: 'legal_document', target_id: selected.id, detail: `v${nextVersion}` });
      setVersions(await getLegalDocumentVersions(selected.id));
      await load();
      toast.success(t('legal.library.versionPublished'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.library.versionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!selected || !user || !window.confirm(t('legal.library.deleteConfirm'))) return;
    setBusy(true);
    try {
      await archiveLegalDocument(selected.id);
      await createOperationLog({ operator_id: user.id, operator_name: user.name, action: 'delete', target_type: 'legal_document', target_id: selected.id, detail: selected.title });
      setSelected(null);
      await load();
      toast.success(t('legal.library.deleted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('legal.library.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader
          title={t('legal.library.title')}
          description={t('legal.library.description')}
          actions={<Button onClick={() => setDialog(true)}><FilePlus2 className="mr-2 h-4 w-4" />{t('legal.library.upload')}</Button>}
        />
        {loadError !== null && <PageErrorState error={loadError} onRetry={() => void load()} />}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('legal.library.searchPlaceholder')} />
              </div>
              <Select value={type} onValueChange={(value) => setType(value as 'all' | LegalDocumentType)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('legal.library.allTypes')}</SelectItem>
                  {types.map((item) => <SelectItem key={item} value={item}>{t(`legal.library.types.${item}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <Table>
                  <TableHeader><TableRow><TableHead>{t('legal.library.fields.title')}</TableHead><TableHead>{t('legal.library.fields.type')}</TableHead><TableHead>{t('legal.library.fields.tags')}</TableHead><TableHead>{t('legal.library.fields.version')}</TableHead><TableHead>{t('legal.library.fields.updatedAt')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {loading ? <TableSkeletonRows columns={5} /> : documents.length === 0 ? <TableEmptyRow colSpan={5} label={t('legal.library.empty')} /> : documents.map((document) => (
                      <TableRow key={document.id} className="cursor-pointer" onClick={() => setSelected(document)}>
                        <TableCell className="font-medium">{document.title}{document.excerpt && <HighlightedExcerpt text={document.excerpt} keyword={debouncedSearch} />}</TableCell>
                        <TableCell>{t(`legal.library.types.${document.doc_type}`)}</TableCell>
                        <TableCell className="space-x-1">{document.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</TableCell>
                        <TableCell>v{document.current_version?.version_no || '-'}</TableCell>
                        <TableCell>{new Date(document.updated_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('legal.library.uploadTitle')}</DialogTitle>
              <DialogDescription>{t('legal.library.uploadDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div><Label>{t('legal.library.fields.title')}</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div>
              <div><Label>{t('legal.library.fields.type')}</Label><Select value={docType} onValueChange={(value: LegalDocumentType) => setDocType(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{types.map((item) => <SelectItem key={item} value={item}>{t(`legal.library.types.${item}`)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>{t('legal.library.fields.tagsHint')}</Label><Input value={tags} onChange={(event) => setTags(event.target.value)} /></div>
              <div><Label>{t('legal.library.fields.file')}</Label><Input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
            </div>
            <DialogFooter><Button onClick={() => void upload()} disabled={busy}><Upload className="mr-2 h-4 w-4" />{t('legal.library.upload')}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
            <SheetHeader><SheetTitle>{selected?.title}</SheetTitle></SheetHeader>
            <div className="mt-6 space-y-3">
              {selected && <Button variant="outline" onClick={() => navigate(`/legal/agent?docId=${selected.id}`)}><Bot className="mr-2 h-4 w-4" />{t('legal.library.askAi')}</Button>}
              {isAdmin && <div><Input id="new-version-file" type="file" className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) void uploadVersion(next); event.target.value = ''; }} /><Button variant="outline" disabled={busy} onClick={() => document.getElementById('new-version-file')?.click()}><Upload className="mr-2 h-4 w-4" />{t('legal.library.newVersion')}</Button></div>}
              {versions.length === 0 ? <p className="text-sm text-muted-foreground">{t('legal.library.noVersions')}</p> : versions.map((version) => <Card key={version.id}><CardContent className="flex items-center justify-between pt-5"><div><div className="font-medium">v{version.version_no} · {version.file_name}</div><div className="text-xs text-muted-foreground">{t(`legal.library.textStatuses.${version.text_status}`)} · {new Date(version.created_at).toLocaleString()}</div></div><Button variant="outline" size="sm" onClick={() => void getLegalFileUrl('legal-library', version.storage_path).then((url) => window.open(url, '_blank'))}><Download className="h-4 w-4" /></Button></CardContent></Card>)}
              {isAdmin && selected && <Button variant="destructive" disabled={busy} onClick={() => void archive()}><Trash2 className="mr-2 h-4 w-4" />{t('legal.library.delete')}</Button>}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </MainLayout>
  );
}
