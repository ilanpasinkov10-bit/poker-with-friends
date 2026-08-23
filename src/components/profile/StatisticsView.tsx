import { PerGameChart } from '@/components/charts/ProfitCharts';
import { RecordsList } from '@/components/profile/RecordsList';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { buildProfitSeries, computeLifetimeStats, computeRecords } from '@/lib/domain/stats';
import type { CompletedGameRecord } from '@/lib/domain/stats';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';

/** Presentational body of /profile/stats. */
export function StatisticsView({ games }: { games: CompletedGameRecord[] }) {
  if (games.length === 0) {
    return (
      <EmptyState
        emoji="📊"
        title="אין עדיין סטטיסטיקות"
        description="הסטטיסטיקות מחושבות מהמשחקים שהסתיימו."
      />
    );
  }

  const stats = computeLifetimeStats(games);
  const records = computeRecords(games);
  const series = buildProfitSeries(games);

  // `numeric: false` marks values that mix Hebrew with a number — those must
  // stay in the RTL flow rather than being isolated left-to-right.
  const rows: {
    label: string;
    value: string;
    tone?: 'profit' | 'loss';
    numeric?: boolean;
  }[] = [
    { label: 'משחקים ששוחקו', value: String(stats.gamesPlayed) },
    {
      label: 'מאזן כולל',
      value: formatSignedMoney(stats.netAgorot),
      tone: stats.netAgorot >= 0 ? 'profit' : 'loss',
    },
    { label: 'סך הכניסות', value: String(stats.totalBuyIns) },
    { label: 'סך ההשקעה', value: formatMoney(stats.totalInvestedAgorot) },
    { label: 'שווי סופי מצטבר', value: formatMoney(stats.lifetimeFinalValueAgorot) },
    {
      label: 'רווח ממוצע למשחק',
      value: formatSignedMoney(stats.averageResultAgorot),
      tone: stats.averageResultAgorot >= 0 ? 'profit' : 'loss',
    },
    { label: 'אחוז משחקים ברווח', value: `${stats.winRatePercent}%` },
    { label: 'ממוצע כניסות למשחק', value: String(stats.averageBuyInsPerGame) },
    {
      label: 'הרווח הגדול ביותר',
      value: formatSignedMoney(stats.biggestWinAgorot),
      tone: 'profit',
    },
    {
      label: 'ההפסד הגדול ביותר',
      value: formatSignedMoney(stats.biggestLossAgorot),
      tone: 'loss',
    },
    {
      label: 'רצף חיובי ארוך ביותר',
      value: gamesWord(stats.longestWinStreak),
      numeric: false,
    },
    {
      label: 'רצף נוכחי',
      value:
        stats.currentStreak === 0
          ? '—'
          : stats.currentStreak > 0
            ? `${stats.currentStreak} ברווח`
            : `${Math.abs(stats.currentStreak)} בהפסד`,
      tone: stats.currentStreak > 0 ? 'profit' : stats.currentStreak < 0 ? 'loss' : undefined,
      numeric: false,
    },
  ];

  return (
    <div className="grid gap-6">
      <section>
        <SectionTitle>סטטיסטיקות</SectionTitle>
        <Card className="divide-y divide-line-soft p-0">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm text-ink-muted">{row.label}</span>
              <span
                className={
                  'text-base font-bold ' +
                  (row.tone === 'profit'
                    ? 'text-profit'
                    : row.tone === 'loss'
                      ? 'text-loss'
                      : 'text-ink')
                }
              >
                {row.numeric === false ? row.value : <Num>{row.value}</Num>}
              </span>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>שיאים</SectionTitle>
        <RecordsList records={records} />
      </section>

      <section>
        <SectionTitle>תוצאה לכל משחק</SectionTitle>
        <Card>
          <PerGameChart points={series} />
        </Card>
      </section>
    </div>
  );
}
