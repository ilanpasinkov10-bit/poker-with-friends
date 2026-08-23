import Link from 'next/link';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';
import { summariseByGroup } from '@/lib/domain/stats';
import { formatDate, formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function MyGroupsPage() {
  const user = await requireRegisteredUser('/profile/tables');
  const { games } = await loadPlayerHistory(user.id);
  const groups = summariseByGroup(games);

  if (groups.length === 0) {
    return (
      <EmptyState
        emoji="🎴"
        title="עוד לא שיחקתם בשום שולחן"
        description="אחרי שמשחק יסתיים, השולחן יופיע כאן עם הסיכום שלכם."
      />
    );
  }

  // The most recent game at each group, so the ranking link has a table to open.
  const latestTableByGroup = new Map<string, string>();
  for (const game of games) {
    const key = game.groupId ?? `table:${game.tableId}`;
    if (!latestTableByGroup.has(key)) latestTableByGroup.set(key, game.tableId);
  }

  return (
    <div>
      <SectionTitle>השולחנות שלי</SectionTitle>
      <ul className="grid gap-2">
        {groups.map((group) => (
          <Card as="li" key={group.key}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{group.name}</p>
                <p className="mt-0.5 text-[0.7rem] text-ink-faint">
                  {gamesWord(group.gamesPlayed)} · מ־
                  <Num>{formatDate(group.firstPlayedAt)}</Num> עד{' '}
                  <Num>{formatDate(group.lastPlayedAt)}</Num>
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-lg font-black',
                  group.netAgorot >= 0 ? 'text-profit' : 'text-loss',
                )}
              >
                <Num>{formatSignedMoney(group.netAgorot)}</Num>
              </span>
            </div>

            <Link
              href={`/table/${latestTableByGroup.get(group.key)}/leaderboard`}
              className="mt-3 inline-flex h-9 items-center rounded-lg border border-line bg-surface-2 px-3 text-xs font-semibold text-ink-muted"
            >
              דירוג השולחן
            </Link>
          </Card>
        ))}
      </ul>
    </div>
  );
}
