import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getExpiringContracts } from '@/db/api';
import type { ExpiringContract } from '@/types/legal';

export default function ContractExpiryCard() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExpiringContract[]>([]);
  useEffect(() => { void getExpiringContracts().then(setRows).catch(() => setRows([])); }, []);
  return <Card className={rows.length ? 'border-orange-300' : ''}><CardHeader><CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />合同到期预警</span><Button variant="link" size="sm" onClick={() => navigate('/legal/contracts')}>查看台账</Button></CardTitle></CardHeader><CardContent>{rows.length === 0 ? <p className="text-sm text-muted-foreground">未来 90 天暂无未处理预警</p> : <div className="space-y-2">{rows.slice(0, 5).map((row) => <div key={row.id} className="flex justify-between text-sm"><span className="truncate">{row.title}</span><Badge days={row.effective_days_left} /></div>)}</div>}</CardContent></Card>;
}

function Badge({ days }: { days: number }) {
  return <span className={days <= 30 ? 'text-red-600' : days <= 60 ? 'text-orange-600' : 'text-yellow-700'}>{days} 天</span>;
}
