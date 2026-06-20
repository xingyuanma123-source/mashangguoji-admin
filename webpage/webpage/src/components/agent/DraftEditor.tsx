import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Pencil, Save, Send, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { updateLegalDraft } from '@/db/api';
import type { LegalDraft } from '@/types/agent';

const STATUS_LABELS: Record<LegalDraft['status'], string> = {
  draft: '草稿（待定稿）', approved: '已定稿', sent: '已发出', void: '已作废',
};

interface DraftEditorProps {
  draft: LegalDraft | null;
  onClose: () => void;
  onUpdated: (draft: LegalDraft) => void;
}

// 文书草稿查看/编辑/定稿/下载。编辑与定稿仅 admin（db-proxy 同样强制）。
export default function DraftEditor({ draft, onClose, onUpdated }: DraftEditorProps) {
  const { user, isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditing(false);
    setContent(draft?.content ?? '');
  }, [draft]);

  if (!draft) return null;

  const download = () => {
    const blob = new Blob([draft.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${draft.title}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveEdit = async () => {
    if (!content.trim()) return toast.error('内容不能为空');
    setBusy(true);
    try {
      const updated = await updateLegalDraft(draft.id, { content });
      onUpdated(updated);
      setEditing(false);
      toast.success('草稿已更新');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const finalize = async () => {
    setBusy(true);
    try {
      const updated = await updateLegalDraft(draft.id, { status: 'approved', approved_by: user?.id ?? null });
      onUpdated(updated);
      toast.success('文书已定稿');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '定稿失败');
    } finally {
      setBusy(false);
    }
  };

  // 线下发出（邮件/快递）后回来标记；雷达据 sent_at 跟进 7/30 天无回应提醒
  const markSent = async () => {
    setBusy(true);
    try {
      const updated = await updateLegalDraft(draft.id, { status: 'sent', sent_at: new Date().toISOString() });
      onUpdated(updated);
      toast.success('已标记发出，雷达将跟进回应情况');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标记失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft.title}
            <Badge variant={draft.status === 'approved' ? 'default' : 'secondary'}>{STATUS_LABELS[draft.status]}</Badge>
          </DialogTitle>
        </DialogHeader>
        {editing ? (
          <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-[400px] font-mono text-sm leading-6" />
        ) : (
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-4 text-sm leading-7">{draft.content}</pre>
        )}
        <DialogFooter className="gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setContent(draft.content); }} disabled={busy}>
                <X className="mr-1 h-4 w-4" />取消
              </Button>
              <Button onClick={() => void saveEdit()} disabled={busy}>
                <Save className="mr-1 h-4 w-4" />保存
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={download}>
                <Download className="mr-1 h-4 w-4" />下载
              </Button>
              {isAdmin && draft.status === 'draft' ? (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="mr-1 h-4 w-4" />编辑
                  </Button>
                  <Button onClick={() => void finalize()} disabled={busy}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />定稿
                  </Button>
                </>
              ) : null}
              {isAdmin && draft.status === 'approved' ? (
                <Button onClick={() => void markSent()} disabled={busy}>
                  <Send className="mr-1 h-4 w-4" />标记已发出
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
