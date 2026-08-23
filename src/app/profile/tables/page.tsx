import { GroupsView } from '@/components/profile/GroupsView';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';

export default async function MyGroupsPage() {
  const user = await requireRegisteredUser('/profile/tables');
  const { games } = await loadPlayerHistory(user.id);
  return <GroupsView games={games} />;
}
