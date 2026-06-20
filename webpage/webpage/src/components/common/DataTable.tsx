import type { ComponentProps, ReactNode } from 'react';
import { Inbox, LoaderCircle } from 'lucide-react';
import { Table, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type ResponsiveTableProps = ComponentProps<typeof Table> & {
  minWidth?: string;
};

export const ResponsiveTable = ({ className, minWidth = '720px', style, ...props }: ResponsiveTableProps) => (
  <Table
    className={cn('text-sm', className)}
    style={{ minWidth, ...style }}
    {...props}
  />
);

export const TableLoadingState = ({ label }: { label: ReactNode }) => (
  <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
    <LoaderCircle className="h-5 w-5 animate-spin" />
    <span>{label}</span>
  </div>
);

export const TableEmptyRow = ({ colSpan, label }: { colSpan: number; label: ReactNode }) => (
  <TableRow>
    <TableCell colSpan={colSpan}>
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <Inbox className="h-5 w-5" />
        <span>{label}</span>
      </div>
    </TableCell>
  </TableRow>
);

export const TableSkeletonRows = ({ columns, rows = 4 }: { columns: number; rows?: number }) => (
  <>
    {Array.from({ length: rows }, (_, row) => (
      <TableRow key={row}>
        {Array.from({ length: columns }, (_, column) => (
          <TableCell key={column}><Skeleton className="h-5 w-full max-w-36" /></TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

export const TableActionsHead = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <TableHead
    className={cn('sticky right-0 z-10 whitespace-nowrap bg-card shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]', className)}
    {...props}
  />
);

export const TableActionsCell = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell
    className={cn('sticky right-0 bg-card shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)]', className)}
    {...props}
  />
);
