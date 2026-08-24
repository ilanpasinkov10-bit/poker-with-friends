import { BottomNav } from '@/components/layout/BottomNav';
import { PageShell } from '@/components/layout/PageShell';
import { LeaderboardList } from '@/components/leaderboard/LeaderboardList';
import { PeriodTabs } from '@/components/leaderboard/PeriodTabs';
import { requireAnyUser } from '@/lib/auth';
import { loadGlobalLeaderboard } from '@/lib/data/leaderboard';
import { isLeaderboardPeriod } from '@/lib/domain/leaderboard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'לוח הישגים' };

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = isLeaderboardPeriod(params.period) ? params.period : 'ALL';

  await requireAnyUser('/leaderboard');
  const rows = await loadGlobalLeaderboard(period);

  return (
    <>
      <PageShell withNav>
        <div className="pt-2">
          <h1 className="text-2xl font-black tracking-tight text-ink">לוח הישגים</h1>
          <p className="mt-0.5 text-xs text-ink-faint">
            דירוג לפי רווח מצטבר ממשחקים שהסתיימו בלבד
          </p>
        </div>

        <div className="mt-4">
          <PeriodTabs current={period} />
        </div>

        <div className="mt-5">
          <LeaderboardList rows={rows} />
        </div>

        <p className="mt-6 text-center text-[0.7rem] text-ink-faint">
          מוצגים משתמשים רשומים בלבד. אפשר להסתיר את עצמכם בהגדרות הפרופיל.
        </p>
      </PageShell>
      <BottomNav />
    </>
  );
}
