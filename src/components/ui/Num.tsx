import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Wraps numeric content so it renders left-to-right and with tabular figures
 * even inside RTL Hebrew text. Use for money, chips, codes, times and counts.
 */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn('ltr-num', className)}>
      {children}
    </span>
  );
}
