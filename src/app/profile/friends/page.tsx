import { FriendsScreen } from '@/components/friends/FriendsScreen';
import { requireRegisteredUser } from '@/lib/auth';
import { loadFriendsOverview } from '@/lib/data/friends';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'חברים' };

/**
 * Sits outside the profile route group for the same reason settings does: it
 * is a place you go to *from* the profile and come back from, so it gets its
 * own header and back action rather than the summary card and the tab strip.
 */
export default async function FriendsPage() {
  const user = await requireRegisteredUser('/profile/friends');
  const { friends, incoming, outgoing } = await loadFriendsOverview(user.id);

  return <FriendsScreen friends={friends} incoming={incoming} outgoing={outgoing} />;
}
