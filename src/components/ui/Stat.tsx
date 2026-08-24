import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Num } from './Num';

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
  numeric = true,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'profit' | 'loss' | 'brand';
  className?: string;
  /** Set false for values that mix Hebrew with a number. */
  numeric?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-line-soft bg-surface-2 px-3 py-2.5', className)}>
      <div className="text-[0.7rem] font-medium text-ink-faint">{label}</div>
      <div
        className={cn(
          'mt-0.5 text-lg font-bold leading-tight',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          tone === 'brand' && 'text-brand-ink',
        )}
      >
        {numeric ? <Num>{value}</Num> : value}
      </div>
      {sub ? <div className="mt-0.5 text-[0.7rem] text-ink-faint">{sub}</div> : null}
    </div>
  );
}
