import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import type { LeaderboardRow } from '@/lib/data/profile';
import { formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Presentational body of the table/group ranking screen. */
export function LeaderboardView({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        emoji="🏆"
        title="אין עדיין דירוג"
        description="הדירוג מחושב ממשחקים שהסתיימו בלבד."
      />
    );
  }

  return (
    <ul className="grid gap-2">
      {rows.map((row, index) => (
        <li
          key={row.key}
          className="flex items-center gap-3 rounded-2xl border border-line-soft bg-surface p-4"
        >
          <span className="w-7 shrink-0 text-center text-lg font-black text-ink-faint">
            {MEDALS[index] ?? <Num>{index + 1}</Num>}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink">{row.display_name}</p>
            <p className="text-[0.7rem] text-ink-faint">
              {gamesWord(row.games_played)} ·{' '}
              <Num>
                {row.games_played > 0
                  ? Math.round((row.winning_games / row.games_played) * 100)
                  : 0}
                %
              </Num>{' '}
              ברווח
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 text-lg font-black',
              row.net_agorot >= 0 ? 'text-profit' : 'text-loss',
            )}
          >
            <Num>{formatSignedMoney(row.net_agorot)}</Num>
          </span>
        </li>
      ))}
    </ul>
  );
}
