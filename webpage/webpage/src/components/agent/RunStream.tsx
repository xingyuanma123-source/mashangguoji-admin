import ReactMarkdown from 'react-markdown';
import { Bot, CheckCircle2, Loader2, UserRound, Wrench, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

// 对话流中的展示单元：用户消息 / 工具步骤 / 最终回答 / 错误
export type StreamItem =
  | { kind: 'user'; text: string; displayText?: string }
  | { kind: 'tool'; name: string; status: 'running' | 'done' | 'rejected'; digest?: string }
  | { kind: 'final'; text: string; streaming?: boolean }
  | { kind: 'error'; text: string };

const TOOL_LABELS: Record<string, string> = {
  search_contracts: '检索合同台账',
  get_contract: '读取合同条款',
  search_knowledge: '检索法律文件库',
  list_matters: '查看事项列表',
  get_matter: '读取事项上下文',
  compute_deadline: '计算时效期限',
  link_matter: '关联事项材料',
  draft_document: '起草法律文书',
  create_matter: '创建法务事项',
  update_matter: '更新事项',
  create_task: '派发待办任务',
  register_obligation: '注册履约义务',
  finalize_document: '文书定稿',
};

export function toolLabel(name: string) {
  return TOOL_LABELS[name] || name;
}

export default function RunStream({ items, busy }: { items: StreamItem[]; busy: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => {
        if (item.kind === 'user') {
          return (
            <div key={index} className="flex justify-end">
              <div className="flex max-w-[85%] gap-2 rounded-2xl bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-sm">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="whitespace-pre-wrap">{item.displayText || item.text}</div>
              </div>
            </div>
          );
        }
        if (item.kind === 'tool') {
          return (
            <div key={index} className="flex justify-start">
              <div className={cn(
                'flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground',
                item.status === 'rejected' && 'border-destructive/40 text-destructive'
              )}>
                {item.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  : item.status === 'rejected' ? <XCircle className="h-3.5 w-3.5" />
                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                <Wrench className="h-3.5 w-3.5" />
                <span className="font-medium">{toolLabel(item.name)}</span>
                {item.digest ? <span className="max-w-[360px] truncate">{item.digest}</span> : null}
              </div>
            </div>
          );
        }
        if (item.kind === 'error') {
          return (
            <div key={index} className="flex justify-start">
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {item.text}
              </div>
            </div>
          );
        }
        return (
          <div key={index} className="flex justify-start">
            <div className="flex max-w-[90%] gap-3 rounded-2xl border bg-card px-4 py-3 text-sm leading-7 shadow-sm">
              <Bot className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold">
                <ReactMarkdown>{item.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        );
      })}
      {busy ? (
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          正在执行…
        </div>
      ) : null}
    </div>
  );
}
