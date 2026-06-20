import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExpiringContract } from '@/types/legal';

const alertClass = {
  30: 'border-red-300 bg-red-50',
  60: 'border-orange-300 bg-orange-50',
  90: 'border-yellow-300 bg-yellow-50',
};

interface ContractAlertsProps {
  alerts: ExpiringContract[];
  busy: boolean;
  onAcknowledge: (contract: ExpiringContract) => void;
}

export default function ContractAlerts({ alerts, busy, onAcknowledge }: ContractAlertsProps) {
  const { t } = useTranslation();
  if (alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          {t('legal.contracts.alertTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {alerts.map((alert) => (
          <div key={alert.id} className={`rounded-lg border p-3 ${alertClass[alert.alert_level]}`}>
            <div className="font-medium">{alert.title}</div>
            <div className="text-sm text-muted-foreground">
              {t(alert.auto_renew ? 'legal.contracts.renewalDeadline' : 'legal.contracts.expiryDeadline')}
              {t('legal.contracts.daysLeft', { count: alert.effective_days_left })}
            </div>
            <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => onAcknowledge(alert)}>
              {t('legal.contracts.markHandled')}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
