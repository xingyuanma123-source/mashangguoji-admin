import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

const PageHeader = ({ title, description, actions, className }: PageHeaderProps) => (
  <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && (
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
        {actions}
      </div>
    )}
  </header>
);

export default PageHeader;
