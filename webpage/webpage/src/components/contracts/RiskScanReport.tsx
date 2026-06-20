import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ContractReviewRecord } from '@/types/legal';

export default function RiskScanReport({ reviews }: { reviews: ContractReviewRecord[] }) {
  const { t } = useTranslation();

  if (reviews.length === 0) return <p className="text-sm text-muted-foreground">{t('legal.contracts.noReports')}</p>;

  return reviews.map((review) => (
    <Card key={review.id} className="mb-3">
      <CardHeader>
        <CardTitle className="text-base">
          {t(`legal.contracts.reviewTypes.${review.review_type}`)} · {review.risk_level ? t(`legal.contracts.riskLevels.${review.risk_level}`) : t('legal.unrated')}
        </CardTitle>
        {review.summary && <p className="text-sm text-muted-foreground">{review.summary}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {review.findings?.map((finding, index) => (
          <div key={`${review.id}-${index}`} className="rounded border p-3 text-sm">
            <Badge>{t(`legal.contracts.riskLevels.${finding.severity}`)}</Badge>
            {finding.clause && <p className="mt-2 text-xs text-muted-foreground">{finding.clause}</p>}
            <p className="mt-2 font-medium">{finding.risk}</p>
            <p className="mt-1 text-muted-foreground">{finding.suggestion}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  ));
}
