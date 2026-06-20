import { AlertCircle, LockKeyhole, RefreshCw, ServerCrash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { classifyLoadError } from '@/lib/loadError';

interface PageErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

const PageErrorState = ({ error, onRetry }: PageErrorStateProps) => {
  const { t } = useTranslation();
  const kind = classifyLoadError(error);
  const Icon = kind === 'permission' ? LockKeyhole : kind === 'service' ? ServerCrash : AlertCircle;

  return (
    <Alert variant="destructive" className="bg-destructive/5">
      <Icon className="h-4 w-4" />
      <AlertTitle>{t(`errors.${kind}.title`)}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{t(`errors.${kind}.description`)}</span>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('errors.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
};

export default PageErrorState;
