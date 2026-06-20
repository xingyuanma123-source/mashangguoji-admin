import { ShieldQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toolLabel } from '@/components/agent/RunStream';

interface ApprovalCardProps {
  call: { name: string; arguments: Record<string, unknown> };
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}

// 写操作审批卡：展示 agent 想做什么 + 参数明细，等待用户批准/拒绝
export default function ApprovalCard({ call, busy, onApprove, onReject }: ApprovalCardProps) {
  const entries = Object.entries(call.arguments).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return (
    <Card className="border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldQuestion className="h-4 w-4 text-amber-600" />
          Agent 请求执行：{toolLabel(call.name)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-background/80 p-3 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="mb-1 flex gap-2 last:mb-0">
              <span className="shrink-0 font-medium text-muted-foreground">{key}</span>
              <span className="whitespace-pre-wrap break-all">{typeof value === 'string' ? value : JSON.stringify(value)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onApprove} disabled={busy}>批准执行</Button>
          <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>拒绝</Button>
        </div>
      </CardContent>
    </Card>
  );
}
