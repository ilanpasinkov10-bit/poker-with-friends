import 'server-only';

import {
  otherUserId,
  type FriendRequestSummary,
  type FriendSummary,
} from '@/lib/domain/friends';
import { createClient } from '@/lib/supabase/server';
import type { FriendshipRow, ProfileRow } from '@/types/database';

/**
 * Reading the caller's own corner of the friend graph.
 *
 * Everything here runs as the *caller*, never the service role. The RLS policy
 * on `friendships` returns only rows the caller is part of, so "my friends" is
 * literally every row this query can see — there is no user id filter here
 * doing security work that the database is not already doing.
 *
 * Profiles are fetched in a second query rather than through an embedded join,
 * because the join would be evaluated against the same policy anyway and this
 * keeps the two concerns legible: which rows exist, then who those people are.
 */

export interface FriendsOverview {
  friends: FriendSummary[];
  /** Requests waiting for the caller to answer. */
  incoming: FriendRequestSummary[];
  /** Requests the caller has sent and can still withdraw. */
  outgoing: FriendRequestSummary[];
}

const EMPTY: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

export async function loadFriendsOverview(userId: string): Promise<FriendsOverview> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('friendships')
    .select('*')
    .in('status', ['PENDING', 'ACCEPTED']);

  const friendships = (rows ?? []) as FriendshipRow[];
  if (friendships.length === 0) return EMPTY;

  const otherIds = [...new Set(friendships.map((row) => otherUserId(row, userId)))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', otherIds);

  const byId = new Map(
    ((profiles ?? []) as Pick<ProfileRow, 'id' | 'display_name' | 'avatar_url'>[]).map(
      (profile) => [profile.id, profile] as const,
    ),
  );

  const friends: FriendSummary[] = [];
  const incoming: FriendRequestSummary[] = [];
  const outgoing: FriendRequestSummary[] = [];

  for (const row of friendships) {
    const id = otherUserId(row, userId);
    const profile = byId.get(id);
    // A profile that cannot be read is a row whose other side has been
    // deleted mid-flight. Skipping it is better than rendering a blank card.
    if (!profile) continue;

    const summary: FriendSummary = {
      userId: id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
    };

    if (row.status === 'ACCEPTED') {
      friends.push(summary);
    } else if (row.requested_by === userId) {
      outgoing.push({ ...summary, requestedAt: row.updated_at });
    } else {
      incoming.push({ ...summary, requestedAt: row.updated_at });
    }
  }

  // Deliberately unordered. A list's order is a property of how it is read,
  // not of how it was stored, so each component sorts what it renders — which
  // also means a component cannot be handed an unsorted list by a caller that
  // forgot.
  return { friends, incoming, outgoing };
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
