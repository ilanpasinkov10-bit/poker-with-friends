import { HistoryView } from '@/components/profile/HistoryView';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';

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

  return <HistoryView games={games} page={page} hasMore={hasMore} />;
}
