import 'server-only';

import {
  summariseFriendships,
  type FriendsOverview,
  type FriendshipWithPeople,
  type FriendSummary,
} from '@/lib/domain/friends';
import { createClient } from '@/lib/supabase/server';

/**
 * Reading the caller's own corner of the friend graph.
 *
 * Everything here runs as the *caller*, never the service role. The RLS policy
 * on `friendships` returns only rows the caller is part of, so "my friends" is
 * literally every row this query can see — there is no user id filter here
 * doing security work that the database is not already doing.
 *
 * Profiles come back embedded rather than from a second query. The second
 * query could not start until the first had returned the ids to ask about, so
 * it cost a full network leg in the middle of the screen's load. The embed is
 * evaluated against the same `profiles` policies the separate select was, so
 * the same people are visible and the same ones are not.
 *
 * Both foreign keys point at `profiles`, so each is named explicitly —
 * PostgREST cannot pick between two paths to the same table on its own.
 */
const WITH_PEOPLE =
  '*, person_a:profiles!friendships_user_a_fkey(id, display_name, avatar_url),' +
  ' person_b:profiles!friendships_user_b_fkey(id, display_name, avatar_url)';

/**
 * The rows themselves, without knowing yet who is asking.
 *
 * The RLS policy returns only rows the caller is part of, so there is no user
 * id filter here doing security work — which means this read can start before
 * the session check has finished rather than after it.
 */
export async function loadFriendshipRows(): Promise<FriendshipWithPeople[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('friendships')
    .select(WITH_PEOPLE)
    .in('status', ['PENDING', 'ACCEPTED']);
  return (data ?? []) as unknown as FriendshipWithPeople[];
}

export async function loadFriendsOverview(userId: string): Promise<FriendsOverview> {
  return summariseFriendships(await loadFriendshipRows(), userId);
}

/** Just the accepted friends — what the table's invite sheet needs. */
export async function loadFriends(userId: string): Promise<FriendSummary[]> {
  const { friends } = await loadFriendsOverview(userId);
  return friends;
}

/** How many requests are waiting, for the badge on the Profile entry point. */
export async function countIncomingRequests(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('friendships')
    .select('requested_by')
    .eq('status', 'PENDING');
  return ((data ?? []) as { requested_by: string }[]).filter(
    (row) => row.requested_by !== userId,
  ).length;
}
