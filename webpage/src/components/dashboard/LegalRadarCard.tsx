import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Radar } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getOpenLegalTasks, updateLegalTask } from '@/db/api';
import type { LegalTask } from '@/types/agent';

const SOURCE_LABELS: Record<LegalTask['source'], string> = {
  radar: '雷达', agent: 'Agent', manual: '手动',
};

// 法务雷达卡片：未完成待办（雷达告警 + agent 派发）
export default function LegalRadarCard() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<LegalTask[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  useEffect(() => { void getOpenLegalTasks().then(setTasks).catch(() => setTasks([])); }, []);

  const completeTask = async (task: LegalTask) => {
    setBusyId(task.id);
    try {
      await updateLegalTask(task.id, { status: 'done' });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      toast.success('待办已完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新待办失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className={tasks.length ? 'border-blue-300' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-blue-500" />
            法务雷达
            {tasks.length > 0 ? <Badge variant="secondary">{tasks.length}</Badge> : null}
          </span>
          <Button variant="link" size="sm" onClick={() => navigate('/legal/agent')}>打开工作台</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无未处理的法务待办</p>
        ) : (
          <div className="space-y-2">
            {tasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{task.title}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{SOURCE_LABELS[task.source]}</Badge>
                  {task.due_date || ''}
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busyId === task.id} title="标记完成" onClick={() => void completeTask(task)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            ))}
            {tasks.length > 5 ? <p className="text-xs text-muted-foreground">还有 {tasks.length - 5} 条…</p> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
