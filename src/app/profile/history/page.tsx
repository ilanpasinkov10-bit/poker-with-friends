import Link from 'next/link';
import { GameHistoryList } from '@/components/profile/GameHistoryList';
import { SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';
import { gamesWord } from '@/lib/labels';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const user = await requireRegisteredUser('/profile/history');
  const { games, hasMore } = await loadPlayerHistory(user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE);

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
