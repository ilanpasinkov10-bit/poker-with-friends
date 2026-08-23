import Link from 'next/link';
import type { ReactNode } from 'react';

/** RTL-aware header: the back chevron points right, on the right-hand side. */
export function AppBar({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: ReactNode;
}) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-line-soft bg-base/90 backdrop-blur">
      <div className="app-shell flex items-center gap-3 px-4 py-3">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="חזרה"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
              <path
                d="M9 5l7 7-7 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-ink">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-ink-faint">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}
