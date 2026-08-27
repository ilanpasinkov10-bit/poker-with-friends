import { GroupsView } from '@/components/profile/GroupsView';
import { requireRegisteredUserId } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';

export default async function MyGroupsPage() {
  const user = await requireRegisteredUserId('/profile/tables');
  const { games } = await loadPlayerHistory(user.id);
  return <GroupsView games={games} />;
}
