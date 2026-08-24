import Link from 'next/link';
import { CumulativeChart, PerGameChart } from '@/components/charts/ProfitCharts';
import { GameHistoryList } from '@/components/profile/GameHistoryList';
import { RecordsList } from '@/components/profile/RecordsList';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stat } from '@/components/ui/Stat';
import { buildProfitSeries, computeLifetimeStats, computeRecords } from '@/lib/domain/stats';
import type { CompletedGameRecord } from '@/lib/domain/stats';
import { formatMoney, formatSignedMoney } from '@/lib/format';

/** Presentational body of /profile. All figures derive from completed games. */
export function ProfileOverview({ games }: { games: CompletedGameRecord[] }) {
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
  const records = computeRecords(games).filter((record) => record.gameLabel !== null);
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
          <RecordsList records={records} />
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
