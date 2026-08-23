import { notFound } from 'next/navigation';
import { AppBar } from '@/components/layout/AppBar';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { cn } from '@/lib/cn';
import { requireAnyUser } from '@/lib/auth';
import { loadTableLeaderboard } from '@/lib/data/profile';
import { createClient } from '@/lib/supabase/server';
import { formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDALS = ['🥇', '🥈', '🥉'];

export default async function LeaderboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  await requireAnyUser(`/table/${id}/leaderboard`);

  const supabase = await createClient();
  const { data: table } = await supabase
    .from('poker_tables')
    .select('id, name, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!table) notFound();

  const { scope, rows } = await loadTableLeaderboard(id);

  return (
    <>
      <AppBar
        title="דירוג השולחן"
        subtitle={scope === 'GROUP' ? `כל המשחקים של ${table.name}` : table.name}
        backHref={`/table/${id}`}
      />
      <PageShell>
        {rows.length === 0 ? (
          <EmptyState
            emoji="🏆"
            title="אין עדיין דירוג"
            description="הדירוג מחושב ממשחקים שהסתיימו בלבד."
          />
        ) : (
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
        )}
      </PageShell>
    </>
  );
}
