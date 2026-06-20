import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import MainLayout from '@/components/layouts/MainLayout';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createPlaybookRule, deletePlaybookRule, getPlaybookRules, updatePlaybookRule } from '@/db/api';
import type { PlaybookRule } from '@/types/agent';

const categories = ['transport', 'lease', 'labor', 'purchase', 'service', 'other'] as const;
const emptyRule: Omit<PlaybookRule, 'id' | 'updated_at'> = {
  contract_category: 'transport', clause_topic: '', ideal_position: '', fallback_position: '',
  red_line: '', suggested_language: '', negotiation_tip: '', is_active: true,
};

export default function PlaybookPage() {
  const [rules, setRules] = useState<PlaybookRule[]>([]);
  const [editing, setEditing] = useState<PlaybookRule | null>(null);
  const [form, setForm] = useState(emptyRule);
  const [open, setOpen] = useState(false);
  const load = async () => setRules(await getPlaybookRules());
  useEffect(() => { void load().catch((error) => toast.error(error.message)); }, []);
  const edit = (rule?: PlaybookRule) => {
    setEditing(rule || null);
    setForm(rule ? { ...rule } : emptyRule);
    setOpen(true);
  };
  const save = async () => {
    if (!form.clause_topic.trim() || !form.ideal_position.trim()) return toast.error('请填写条款主题和理想立场');
    try {
      if (editing) await updatePlaybookRule(editing.id, form);
      else await createPlaybookRule(form);
      setOpen(false);
      await load();
      toast.success('Playbook 已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
  };
  const remove = async (rule: PlaybookRule) => {
    if (!window.confirm(`删除规则「${rule.clause_topic}」？`)) return;
    await deletePlaybookRule(rule.id);
    await load();
  };
  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader title="法务 Playbook" description="维护合同审查立场、红线和建议措辞，Agent 会自动引用启用中的规则。" actions={<Button onClick={() => edit()}><Plus className="mr-2 h-4 w-4" />新增规则</Button>} />
        <div className="grid gap-4 xl:grid-cols-2">
          {rules.map((rule) => (
            <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-semibold">{rule.clause_topic}</div><div className="text-xs text-muted-foreground">{rule.contract_category} · {rule.is_active ? '启用' : '停用'}</div></div>
                  <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => edit(rule)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void remove(rule)}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
                <div className="text-sm"><span className="font-medium">理想立场：</span>{rule.ideal_position}</div>
                {rule.red_line ? <div className="rounded-md bg-red-50 p-2 text-sm text-red-700"><span className="font-medium">红线：</span>{rule.red_line}</div> : null}
                {rule.suggested_language ? <div className="rounded-md bg-muted p-2 text-sm"><span className="font-medium">建议措辞：</span>{rule.suggested_language}</div> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? '编辑规则' : '新增规则'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>合同类别</Label><Select value={form.contract_category} onValueChange={(value: PlaybookRule['contract_category']) => setForm({ ...form, contract_category: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>条款主题</Label><Input value={form.clause_topic} onChange={(e) => setForm({ ...form, clause_topic: e.target.value })} /></div>
            <div><Label>理想立场</Label><Textarea value={form.ideal_position} onChange={(e) => setForm({ ...form, ideal_position: e.target.value })} /></div>
            <div><Label>可退让立场</Label><Textarea value={form.fallback_position || ''} onChange={(e) => setForm({ ...form, fallback_position: e.target.value })} /></div>
            <div><Label>红线</Label><Textarea value={form.red_line || ''} onChange={(e) => setForm({ ...form, red_line: e.target.value })} /></div>
            <div><Label>建议措辞</Label><Textarea value={form.suggested_language || ''} onChange={(e) => setForm({ ...form, suggested_language: e.target.value })} /></div>
            <div><Label>谈判提示</Label><Textarea value={form.negotiation_tip || ''} onChange={(e) => setForm({ ...form, negotiation_tip: e.target.value })} /></div>
            <div className="flex items-center justify-between"><Label>启用</Label><Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} /></div>
          </div>
          <DialogFooter><Button onClick={() => void save()}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
