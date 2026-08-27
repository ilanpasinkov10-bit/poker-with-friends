import type { ReactNode } from 'react';

export function EmptyState({
  emoji = '🃏',
  title,
  description,
  action,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-10 text-center">
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {description ? <p className="max-w-xs text-sm text-ink-faint">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = 'טוען…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-faint">
      <span className="size-4 animate-spin rounded-full border-2 border-ink-faint border-t-transparent" />
      {label}
    </div>
  );
}
