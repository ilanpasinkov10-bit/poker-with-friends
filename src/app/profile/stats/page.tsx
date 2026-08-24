import { StatisticsView } from '@/components/profile/StatisticsView';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const user = await requireRegisteredUser('/profile/stats');
  const { games } = await loadPlayerHistory(user.id);
  return <StatisticsView games={games} />;
}
