import { FriendsScreen } from '@/components/friends/FriendsScreen';
import { requireRegisteredUserId } from '@/lib/auth';
import { loadFriendshipRows } from '@/lib/data/friends';
import { summariseFriendships } from '@/lib/domain/friends';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'חברים' };

/**
 * Sits outside the profile route group for the same reason settings does: it
 * is a place you go to *from* the profile and come back from, so it gets its
 * own header and back action rather than the summary card and the tab strip.
 */
export default async function FriendsPage() {
  // The rows the caller may see are decided by RLS, not by an id passed in, so
  // the read runs alongside the session check rather than behind it. Which of
  // them are friends and which are requests still needs the id, and that is
  // pure shaping once both have arrived.
  const [user, rows] = await Promise.all([
    requireRegisteredUserId('/profile/friends'),
    loadFriendshipRows(),
  ]);
  const { friends, incoming, outgoing } = summariseFriendships(rows, user.id);

  return <FriendsScreen friends={friends} incoming={incoming} outgoing={outgoing} />;
}
