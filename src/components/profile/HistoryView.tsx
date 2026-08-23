import Link from 'next/link';
import { GameHistoryList } from '@/components/profile/GameHistoryList';
import { SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import type { CompletedGameRecord } from '@/lib/domain/stats';
import { gamesWord } from '@/lib/labels';

/** Presentational body of /profile/history, including its pager. */
export function HistoryView({
  games,
  page,
  hasMore,
}: {
  games: CompletedGameRecord[];
  page: number;
  hasMore: boolean;
}) {
  if (games.length === 0) {
    return (
      <EmptyState
        emoji="📜"
        title="אין משחקים להצגה"
        description={page > 1 ? 'הגעתם לסוף הרשימה.' : 'המשחקים שיסתיימו יופיעו כאן.'}
      />
    );
  }

  return (
    <div>
      <SectionTitle
        action={<span className="text-xs text-ink-faint">{gamesWord(games.length)} בעמוד</span>}
      >
        היסטוריית משחקים
      </SectionTitle>

      <GameHistoryList games={games} />

      <nav className="mt-5 flex items-center justify-between gap-2">
        {page > 1 ? (
          <Link
            href={`/profile/history?page=${page - 1}`}
            className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-semibold text-ink"
          >
            הקודם
          </Link>
        ) : (
          <span />
        )}
        <span className="text-xs text-ink-faint">
          עמוד <Num>{page}</Num>
        </span>
        {hasMore ? (
          <Link
            href={`/profile/history?page=${page + 1}`}
            className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-semibold text-ink"
          >
            הבא
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
