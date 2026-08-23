import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'brand' | 'profit' | 'loss' | 'warn';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand-ink border-brand/30',
  profit: 'bg-profit-soft text-profit border-profit/30',
  loss: 'bg-loss-soft text-loss border-loss/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
