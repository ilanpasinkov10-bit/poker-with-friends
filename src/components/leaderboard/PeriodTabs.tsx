'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { LEADERBOARD_PERIODS, type LeaderboardPeriod } from '@/lib/domain/leaderboard';

export function PeriodTabs({ current }: { current: LeaderboardPeriod }) {
  return (
    <nav aria-label="טווח זמן" className="flex gap-1.5">
      {LEADERBOARD_PERIODS.map((period) => {
        const active = period.value === current;
        return (
          <Link
            key={period.value}
            href={period.value === 'ALL' ? '/leaderboard' : `/leaderboard?period=${period.value}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 flex-1 items-center justify-center rounded-full text-sm font-semibold transition-colors',
              active
                ? 'bg-brand text-on-brand'
                : 'border border-line bg-surface-2 text-ink-muted hover:text-ink',
            )}
          >
            {period.label}
          </Link>
        );
      })}
    </nav>
  );
}
