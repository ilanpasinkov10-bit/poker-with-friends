import { ProfileOverview } from '@/components/profile/ProfileOverview';
import { requireRegisteredUser } from '@/lib/auth';
import { loadPlayerHistory } from '@/lib/data/profile';

export const dynamic = 'force-dynamic';

export default async function ProfileOverviewPage() {
  const user = await requireRegisteredUser('/profile');
  const { games } = await loadPlayerHistory(user.id);
  return <ProfileOverview games={games} />;
}
