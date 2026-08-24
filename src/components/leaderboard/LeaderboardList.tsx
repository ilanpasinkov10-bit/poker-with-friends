'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';
import type { LeaderboardEntry } from '@/lib/domain/leaderboard';
import { PublicProfileSheet } from '@/components/profile/PublicProfileSheet';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Ranked players. Tapping one opens their public profile. */
export function LeaderboardList({ rows }: { rows: LeaderboardEntry[] }) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  if (rows.length === 0) {
    // The board is opt-in, so "empty" usually means nobody has joined it yet
    // rather than that something is broken. Say so, and offer the switch.
    return (
      <EmptyState
        emoji="🏆"
        title="לוח ההישגים ריק"
        description="ההצטרפות ללוח היא בבחירה. מי שמפעיל את האפשרות בהגדרות הפרופיל יופיע כאן, אחרי משחק אחד שהסתיים."
        action={
          <Link
            href="/profile/settings"
            className="inline-flex h-11 items-center rounded-xl bg-brand px-5 font-semibold text-on-brand"
          >
            הצטרפו ללוח ההישגים
          </Link>
        }
      />
    );
  }

  return (
    <>
      <ul className="grid gap-2">
        {rows.map((row, index) => (
          <li key={row.user_id}>
            <button
              type="button"
              onClick={() => setOpenUserId(row.user_id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line-soft bg-surface p-3.5 text-start transition-colors hover:border-line active:bg-surface-2"
            >
              <span className="w-7 shrink-0 text-center text-lg font-black text-ink-faint">
                {MEDALS[index] ?? <Num>{index + 1}</Num>}
              </span>

              <Avatar name={row.display_name} src={row.avatar_url} ring={index === 0} />

              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink">{row.display_name}</span>
                <span className="block text-[0.7rem] text-ink-faint">
                  {gamesWord(row.games_played)} · ממוצע{' '}
                  <Num>{formatSignedMoney(row.average_agorot)}</Num>
                </span>
              </span>

              <span
                className={cn(
                  'shrink-0 text-lg font-black',
                  row.net_agorot > 0 && 'text-profit',
                  row.net_agorot < 0 && 'text-loss',
                  row.net_agorot === 0 && 'text-ink-muted',
                )}
              >
                <Num>{row.net_agorot === 0 ? formatMoney(0) : formatSignedMoney(row.net_agorot)}</Num>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <PublicProfileSheet
        userId={openUserId}
        open={openUserId !== null}
        onClose={() => setOpenUserId(null)}
      />
    </>
  );
}
