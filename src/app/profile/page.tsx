import Link from 'next/link';
import { CumulativeChart, PerGameChart } from '@/components/charts/ProfitCharts';
import { GameHistoryList } from '@/components/profile/GameHistoryList';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { Stat } from '@/components/ui/Stat';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';
import { buildProfitSeries, computeLifetimeStats, computeRecords } from '@/lib/domain/stats';
import { formatMoney, formatSignedMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProfileOverviewPage() {
  const user = await requireRegisteredUser('/profile');
  const { games } = await loadPlayerHistory(user.id);

  if (games.length === 0) {
    return (
      <EmptyState
        emoji="🎲"
        title="עוד לא שיחקתם משחק"
        description="אחרי המשחק המסודר הראשון תופיע כאן ההיסטוריה, הסטטיסטיקות והגרפים."
        action={
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-xl bg-brand px-5 font-semibold text-white"
          >
            לפתיחת שולחן
          </Link>
        }
      />
    );
  }

  const stats = computeLifetimeStats(games);
  const series = buildProfitSeries(games);
  const records = computeRecords(games).filter((r) => r.gameLabel !== null);
  const recent = games.slice(0, 3);

  return (
    <div className="grid gap-6">
      <section>
        <SectionTitle>היסטוריית רווחים</SectionTitle>
        <Card className="grid gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold text-ink-muted">מאזן מצטבר</p>
            <CumulativeChart points={series} />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-ink-muted">תוצאה לכל משחק</p>
            <PerGameChart points={series} />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>במבט מהיר</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="מאזן כולל"
            value={formatSignedMoney(stats.netAgorot)}
            tone={stats.netAgorot >= 0 ? 'profit' : 'loss'}
          />
          <Stat label="רווח ממוצע למשחק" value={formatSignedMoney(stats.averageResultAgorot)} />
          <Stat label="סך ההשקעה" value={formatMoney(stats.totalInvestedAgorot)} />
          <Stat label="ממוצע כניסות למשחק" value={stats.averageBuyInsPerGame} />
        </div>
      </section>

      {records.length > 0 ? (
        <section>
          <SectionTitle>שיאים</SectionTitle>
          <ul className="grid gap-2">
            {records.map((record) => (
              <li
                key={record.key}
                className="flex items-center gap-3 rounded-2xl border border-line-soft bg-surface p-3.5"
              >
                <span className="text-2xl" aria-hidden>
                  {record.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{record.title}</p>
                  <p className="truncate text-[0.7rem] text-ink-faint">{record.gameLabel}</p>
                </div>
                <span className="shrink-0 text-base font-black text-brand-ink">
                  <Num>
                    {record.valueAgorot !== undefined
                      ? formatSignedMoney(record.valueAgorot)
                      : (record.valueNumber ?? '—')}
                  </Num>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionTitle
          action={
            <Link href="/profile/history" className="text-xs font-semibold text-brand-ink">
              לכל ההיסטוריה
            </Link>
          }
        >
          משחקים אחרונים
        </SectionTitle>
        <GameHistoryList games={recent} />
      </section>
    </div>
  );
}
