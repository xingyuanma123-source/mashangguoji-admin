import { type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Check, CheckCircle2, FileText, ImagePlus, ListTodo, Loader2, Plus, RefreshCw, SendHorizonal, Sparkles, XCircle, X } from 'lucide-react';
import { toast } from 'sonner';

import MainLayout from '@/components/layouts/MainLayout';
import ApprovalCard from '@/components/agent/ApprovalCard';
import DraftEditor from '@/components/agent/DraftEditor';
import RunStream, { type StreamItem } from '@/components/agent/RunStream';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { approveAgentRun, rejectAgentRun, startAgentRun } from '@/lib/agent';
import { isSessionExpiredError } from '@/lib/proxySession';
import { ACCEPTED_IMAGE_TYPES } from '@/lib/ocr';
import { useOcrAttachments } from '@/hooks/use-ocr-attachments';
import { createMatter, getLegalDocuments, getMatterDrafts, getMatterRuns, getMatterTasks, getMatters, updateLegalTask } from '@/db/api';
import type { AgentStreamEvent, LegalDraft, LegalTask, Matter, MatterType } from '@/types/agent';

const MATTER_TYPE_LABELS: Record<MatterType, string> = {
  claim: '货损索赔', contract_review: '合同审查', collection: '欠款催收',
  consult: '法律咨询', dispute: '纠纷处理', other: '其他',
};

const STATUS_LABELS: Record<Matter['status'], string> = {
  open: '待处理', in_progress: '进行中', awaiting: '等待回应', resolved: '已解决', closed: '已结案',
};

const PRIORITY_DOT: Record<Matter['priority'], string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', normal: 'bg-emerald-500', low: 'bg-slate-400',
};

const QUICK_PROMPTS = [
  '客户索赔货损，帮我立案并分析向分包商追偿的依据',
  '帮我审查一份运输合同的风险条款',
  '这笔运费拖欠 3 个月了，下一步怎么处理？',
];

function daysUntil(date?: string | null) {
  if (!date) return null;
  return Math.ceil((Date.parse(`${date}T00:00:00`) - Date.now()) / 86_400_000);
}

export default function AgentConsolePage() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<number | null>(null);
  const [items, setItems] = useState<StreamItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{ runId: number; call: { name: string; arguments: Record<string, unknown> } } | null>(null);
  const [drafts, setDrafts] = useState<LegalDraft[]>([]);
  const [tasks, setTasks] = useState<LegalTask[]>([]);
  const [matterDialog, setMatterDialog] = useState(false);
  const [newMatter, setNewMatter] = useState({ type: 'claim' as MatterType, title: '', counterparty: '', amount: '' });
  const [previewDraft, setPreviewDraft] = useState<LegalDraft | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialMattersLoaded = useRef(false);

  const [statusFilter, setStatusFilter] = useState('active');
  const [searchParams] = useSearchParams();
  const { attachments, addFiles, removeAttachment, clearAttachments, recognizing, composeMessage } = useOcrAttachments();

  // 文件库「向 AI 提问」跳转：?docId= 预填提问模板
  useEffect(() => {
    const docId = Number(searchParams.get('docId'));
    if (!docId) return;
    void getLegalDocuments().then((documents) => {
      const target = documents.find((document) => document.id === docId);
      setInput(target ? `请基于文件库文档《${target.title}》回答：` : `请基于文件库文档 #${docId} 回答：`);
    }).catch(() => setInput(`请基于文件库文档 #${docId} 回答：`));
  }, [searchParams]);

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) || null,
    [matters, selectedMatterId]
  );

  const visibleMatters = useMemo(() => matters.filter((matter) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'closed') return matter.status === 'closed' || matter.status === 'resolved';
    return matter.status !== 'closed' && matter.status !== 'resolved';
  }), [matters, statusFilter]);

  const loadMatters = useCallback(async () => {
    try {
      setMatters(await getMatters());
    } catch (error) {
      if (!isSessionExpiredError(error)) {
        toast.error(error instanceof Error ? error.message : '加载事项失败');
      }
    }
  }, []);

  const loadContext = useCallback(async (matterId: number) => {
    try {
      const [matterDrafts, matterTasks] = await Promise.all([getMatterDrafts(matterId), getMatterTasks(matterId)]);
      setDrafts(matterDrafts);
      setTasks(matterTasks);
    } catch {
      setDrafts([]); setTasks([]);
    }
  }, []);

  useEffect(() => {
    if (initialMattersLoaded.current) return;
    initialMattersLoaded.current = true;
    void loadMatters();
  }, [loadMatters]);

  // 切换事项：回放历史运行 + 加载上下文
  useEffect(() => {
    setItems([]); setPendingApproval(null); setDrafts([]); setTasks([]);
    if (!selectedMatterId) return;
    void loadContext(selectedMatterId);
    void getMatterRuns(selectedMatterId).then((runs) => {
      const history: StreamItem[] = [];
      for (const run of runs) {
        history.push({ kind: 'user', text: run.user_message });
        for (const step of run.steps || []) {
          history.push({ kind: 'tool', name: step.tool, status: step.rejected_by ? 'rejected' : 'done', digest: step.result_digest });
        }
        if (run.final_text) history.push({ kind: 'final', text: run.final_text });
        if (run.status === 'suspended' && run.pending_approval) {
          setPendingApproval({ runId: run.id, call: { name: run.pending_approval.name, arguments: run.pending_approval.arguments } });
        }
      }
      setItems(history);
    }).catch(() => setItems([]));
  }, [selectedMatterId, loadContext]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [items, pendingApproval]);

  const handleEvent = useCallback((event: AgentStreamEvent) => {
    if (event.type === 'tool_start') {
      setItems((current) => [...current, { kind: 'tool', name: event.name, status: 'running' }]);
    } else if (event.type === 'tool_result') {
      setItems((current) => {
        const next = [...current];
        for (let index = next.length - 1; index >= 0; index--) {
          const item = next[index];
          if (item.kind === 'tool' && item.name === event.name && item.status === 'running') {
            next[index] = { ...item, status: 'done', digest: event.result_digest };
            break;
          }
        }
        return next;
      });
    } else if (event.type === 'tool_rejected') {
      setItems((current) => [...current, { kind: 'tool', name: event.name, status: 'rejected' }]);
    } else if (event.type === 'approval_required') {
      setPendingApproval({ runId: event.run_id, call: event.call });
    } else if (event.type === 'delta') {
      setItems((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.kind === 'final' && last.streaming) {
          next[next.length - 1] = { ...last, text: last.text + event.text };
        } else {
          next.push({ kind: 'final', text: event.text, streaming: true });
        }
        return next;
      });
    } else if (event.type === 'final') {
      setItems((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.kind === 'final' && last.streaming) {
          next[next.length - 1] = { kind: 'final', text: event.text };
          return next;
        }
        return [...current, { kind: 'final', text: event.text }];
      });
    } else if (event.type === 'error') {
      setItems((current) => [...current, { kind: 'error', text: event.error }]);
    }
  }, []);

  const afterRun = useCallback(async () => {
    await loadMatters();
    if (selectedMatterId) await loadContext(selectedMatterId);
  }, [loadMatters, loadContext, selectedMatterId]);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    const readyAttachments = attachments.filter((item) => item.status === 'done');
    if ((!question && readyAttachments.length === 0) || busy) return;
    if (pendingApproval) return toast.info('请先处理待审批操作');
    if (recognizing) return toast.info('附件识别中，请稍候');
    const message = composeMessage(question);
    const displayText = readyAttachments.length > 0
      ? `${question || '（分析附件内容）'} 📎${readyAttachments.length}个附件`
      : question;
    setInput('');
    clearAttachments();
    setItems((current) => [...current, { kind: 'user', text: message, displayText }]);
    setBusy(true);
    try {
      await startAgentRun({ message, matterId: selectedMatterId }, handleEvent);
      await afterRun();
    } catch (error) {
      setItems((current) => [...current, { kind: 'error', text: error instanceof Error ? error.message : '请求失败' }]);
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  };

  const decide = async (approved: boolean) => {
    if (!pendingApproval || busy) return;
    const { runId } = pendingApproval;
    setPendingApproval(null);
    setBusy(true);
    try {
      await (approved ? approveAgentRun(runId, handleEvent) : rejectAgentRun(runId, handleEvent));
      await afterRun();
    } catch (error) {
      setItems((current) => [...current, { kind: 'error', text: error instanceof Error ? error.message : '请求失败' }]);
    } finally {
      setBusy(false);
    }
  };

  const saveMatter = async () => {
    if (!newMatter.title.trim()) return toast.error('请填写事项标题');
    try {
      const matter = await createMatter({
        type: newMatter.type, title: newMatter.title.trim(),
        counterparty: newMatter.counterparty.trim() || null,
        amount: newMatter.amount ? Number(newMatter.amount) : null,
      });
      setMatterDialog(false);
      setNewMatter({ type: 'claim', title: '', counterparty: '', amount: '' });
      await loadMatters();
      setSelectedMatterId(matter.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败');
    }
  };

  const completeTask = async (task: LegalTask) => {
    try {
      const updated = await updateLegalTask(task.id, { status: 'done' });
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      toast.success('待办已完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新待办失败');
    }
  };

  const deadlineDays = daysUntil(selectedMatter?.statute_deadline);

  return (
    <MainLayout>
      <div className="grid h-[calc(100vh-130px)] gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        {/* 左栏：事项列表 */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <span className="text-sm font-semibold">法务事项</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void loadMatters()}><RefreshCw className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMatterDialog(true)}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="border-b px-3 py-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">进行中（含待处理）</SelectItem>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="closed">已结案/已解决</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <button
              type="button"
              className={cn('flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm transition hover:bg-primary/5', selectedMatterId === null && 'bg-primary/10')}
              onClick={() => setSelectedMatterId(null)}
            >
              <Sparkles className="h-4 w-4 text-primary" />
              快速咨询（不挂事项）
            </button>
            {visibleMatters.map((matter) => (
              <button
                key={matter.id}
                type="button"
                className={cn('w-full border-b px-3 py-2.5 text-left transition hover:bg-primary/5', selectedMatterId === matter.id && 'bg-primary/10')}
                onClick={() => setSelectedMatterId(matter.id)}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[matter.priority])} />
                  <span className="truncate text-sm font-medium">{matter.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{MATTER_TYPE_LABELS[matter.type]}</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{STATUS_LABELS[matter.status]}</Badge>
                </div>
              </button>
            ))}
            {visibleMatters.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">暂无事项，直接对话即可由 Agent 立案</p>
            ) : null}
          </ScrollArea>
        </Card>

        {/* 中栏：对话 + 执行流 */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">{selectedMatter ? selectedMatter.title : '法务 Agent'}</span>
            {deadlineDays != null ? (
              <Badge variant={deadlineDays <= 30 ? 'destructive' : 'secondary'} className="ml-auto">
                时效剩 {deadlineDays} 天
              </Badge>
            ) : null}
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            {items.length === 0 && !pendingApproval ? (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <Bot className="h-10 w-10 text-primary/40" />
                <p className="text-sm text-muted-foreground">描述你的法务问题，Agent 会自动检索合同、分析责任、起草文书</p>
                <div className="flex max-w-md flex-col gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="rounded-lg border bg-background px-4 py-2.5 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => void send(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <RunStream items={items} busy={busy} />
                {pendingApproval ? (
                  <ApprovalCard
                    call={pendingApproval.call}
                    busy={busy}
                    onApprove={() => void decide(true)}
                    onReject={() => void decide(false)}
                  />
                ) : null}
              </div>
            )}
          </div>
          <div className="border-t p-3">
            {attachments.length > 0 ? (
              <div className="mb-2 flex gap-2 overflow-x-auto rounded-lg border bg-muted/20 p-2">
                {attachments.map((item) => (
                  <div key={item.id} className="relative w-20 shrink-0">
                    {item.file.type.startsWith('image/')
                      ? <img src={item.previewUrl} alt={item.file.name} className="h-16 w-16 rounded-md border object-cover" />
                      : <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-background text-[10px] text-muted-foreground">PDF</div>}
                    <button
                      type="button"
                      className="absolute -right-1 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-destructive"
                      onClick={() => removeAttachment(item.id)}
                      aria-label="移除附件"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground" title={item.error}>
                      {item.status === 'recognizing' ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : null}
                      {item.status === 'done' ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : null}
                      {item.status === 'failed' ? <XCircle className="h-3 w-3 text-destructive" /> : null}
                      <span className="truncate">{item.status === 'recognizing' ? '识别中' : item.status === 'done' ? '已识别' : '失败'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={selectedMatter ? `就「${selectedMatter.title}」继续向 Agent 下达任务…` : '描述法务问题或任务，可粘贴货损照片/合同截图，Enter 发送…'}
                className="min-h-[44px] max-h-32 resize-none"
                disabled={busy}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 self-end"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="上传图片/PDF（OCR 后随消息发送）"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button onClick={() => void send()} disabled={busy || recognizing || (!input.trim() && attachments.every((item) => item.status !== 'done'))} className="shrink-0 self-end">
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">AI 分析仅供内部参考，重大事项请咨询执业律师；写操作均需人工批准。</p>
          </div>
        </Card>

        {/* 右栏：上下文面板 */}
        <Card className="hidden min-h-0 flex-col overflow-hidden lg:flex">
          <div className="border-b px-3 py-2.5 text-sm font-semibold">上下文</div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 p-3">
              {selectedMatter ? (
                <div className="space-y-2 text-xs">
                  <div className="text-sm font-medium">{selectedMatter.title}</div>
                  <div className="text-muted-foreground">类型：{MATTER_TYPE_LABELS[selectedMatter.type]} · {STATUS_LABELS[selectedMatter.status]}</div>
                  {selectedMatter.counterparty ? <div className="text-muted-foreground">对方：{selectedMatter.counterparty}</div> : null}
                  {selectedMatter.amount != null ? <div className="text-muted-foreground">金额：¥{Number(selectedMatter.amount).toLocaleString()}</div> : null}
                  {selectedMatter.statute_deadline ? <div className="text-muted-foreground">时效截止：{selectedMatter.statute_deadline}</div> : null}
                  {selectedMatter.summary ? (
                    <div className="rounded-md border bg-muted/30 p-2 leading-5 text-muted-foreground">{selectedMatter.summary}</div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">选择左侧事项查看上下文，或直接快速咨询。</p>
              )}

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><FileText className="h-3.5 w-3.5" />文书草稿（{drafts.length}）</div>
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    className="mb-1.5 w-full rounded-md border px-2.5 py-2 text-left text-xs transition hover:border-primary/40"
                    onClick={() => setPreviewDraft(draft)}
                  >
                    <div className="truncate font-medium">{draft.title}</div>
                    <div className="mt-0.5 text-muted-foreground">
                      {draft.status === 'draft' ? '草稿（待定稿）' : draft.status === 'approved' ? '已定稿' : draft.status}
                    </div>
                  </button>
                ))}
                {drafts.length === 0 ? <p className="text-xs text-muted-foreground">暂无</p> : null}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><ListTodo className="h-3.5 w-3.5" />待办（{tasks.filter((task) => task.status === 'open').length}）</div>
                {tasks.filter((task) => task.status === 'open').map((task) => (
                  <div key={task.id} className="mb-1.5 rounded-md border px-2.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 font-medium">{task.title}</div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="标记完成" onClick={() => void completeTask(task)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {task.due_date ? <div className="mt-0.5 text-muted-foreground">截止 {task.due_date}</div> : null}
                  </div>
                ))}
                {tasks.filter((task) => task.status === 'open').length === 0 ? <p className="text-xs text-muted-foreground">暂无</p> : null}
              </div>
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* 新建事项 */}
      <Dialog open={matterDialog} onOpenChange={setMatterDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>新建法务事项</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>类型</Label>
              <Select value={newMatter.type} onValueChange={(value: MatterType) => setNewMatter({ ...newMatter, type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MATTER_TYPE_LABELS) as MatterType[]).map((type) => (
                    <SelectItem key={type} value={type}>{MATTER_TYPE_LABELS[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>标题</Label><Input value={newMatter.title} onChange={(event) => setNewMatter({ ...newMatter, title: event.target.value })} placeholder="如：越A12345 货损索赔（宏远物流）" /></div>
            <div><Label>对方单位（可选）</Label><Input value={newMatter.counterparty} onChange={(event) => setNewMatter({ ...newMatter, counterparty: event.target.value })} /></div>
            <div><Label>争议金额（可选）</Label><Input type="number" value={newMatter.amount} onChange={(event) => setNewMatter({ ...newMatter, amount: event.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => void saveMatter()}>创建</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 草稿查看/编辑/定稿 */}
      <DraftEditor
        draft={previewDraft}
        onClose={() => setPreviewDraft(null)}
        onUpdated={(updated) => {
          setPreviewDraft(updated);
          setDrafts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        }}
      />
    </MainLayout>
  );
}
