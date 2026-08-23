import { PerGameChart } from '@/components/charts/ProfitCharts';
import { Card, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Num } from '@/components/ui/Num';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';
import { buildProfitSeries, computeLifetimeStats, computeRecords } from '@/lib/domain/stats';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { gamesWord } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const user = await requireRegisteredUser('/profile/stats');
  const { games } = await loadPlayerHistory(user.id);

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

  const rows: { label: string; value: string; tone?: 'profit' | 'loss' }[] = [
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
    { label: 'רצף חיובי ארוך ביותר', value: gamesWord(stats.longestWinStreak) },
    {
      label: 'רצף נוכחי',
      value:
        stats.currentStreak === 0
          ? '—'
          : stats.currentStreak > 0
            ? `${stats.currentStreak} ברווח`
            : `${Math.abs(stats.currentStreak)} בהפסד`,
      tone: stats.currentStreak > 0 ? 'profit' : stats.currentStreak < 0 ? 'loss' : undefined,
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
                <Num>{row.value}</Num>
              </span>
            </div>
          ))}
        </Card>
      </section>

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
                <p className="truncate text-[0.7rem] text-ink-faint">
                  {record.gameLabel ?? 'עדיין אין נתונים'}
                </p>
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

      <section>
        <SectionTitle>תוצאה לכל משחק</SectionTitle>
        <Card>
          <PerGameChart points={series} />
        </Card>
      </section>
    </div>
  );
}
