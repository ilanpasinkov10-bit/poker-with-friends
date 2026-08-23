import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageShell({
  children,
  withNav = false,
  className,
}: {
  children: ReactNode;
  withNav?: boolean;
  className?: string;
}) {
  return (
    <main className={cn('app-shell px-4 pt-4', withNav ? 'pb-28' : 'pb-10', className)}>
      {children}
    </main>
  );
}
