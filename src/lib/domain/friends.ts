/**
 * What two users are to each other, and what the button should therefore say.
 *
 * The database stores one row per pair with the ids in canonical order, which
 * is what makes duplicates and self-friendship impossible (see migration 0013).
 * The cost of that shape is that a row on its own does not tell you whether
 * *you* sent the request or received it — that depends on who is looking. This
 * module is the one place that turns a row plus a viewer into a relationship,
 * so no screen has to work it out again and get it subtly wrong.
 *
 * Pure: no React, no Supabase, no clock. Every rule below is testable directly.
 */

import type { FriendshipRow, FriendshipStatus } from '@/types/database';

/**
 * The relationship from one person's point of view.
 *
 * `DECLINED` is deliberately absent. A declined request collapses to `NONE`:
 * the person who was turned down is not told about it — they simply see "הוסף
 * חבר" again, exactly as if they had never asked — and asking again is allowed.
 * Reporting a refusal would be both unkind and a small privacy leak.
 */
export type Relationship = 'NONE' | 'OUTGOING' | 'INCOMING' | 'FRIENDS';

export interface FriendshipFacts {
  status: FriendshipStatus;
  requestedBy: string;
}

/** Reads a stored pair row from the viewer's side. */
export function relationshipOf(
  friendship: FriendshipFacts | null | undefined,
  viewerId: string,
): Relationship {
  if (!friendship) return 'NONE';
  if (friendship.status === 'ACCEPTED') return 'FRIENDS';
  if (friendship.status === 'DECLINED') return 'NONE';
  return friendship.requestedBy === viewerId ? 'OUTGOING' : 'INCOMING';
}

/** The same, for the flat shape `search_users` returns. */
export function relationshipOfSearchHit(
  hit: { status: string; requested_by: string | null },
  viewerId: string,
): Relationship {
  if (hit.status === 'ACCEPTED') return 'FRIENDS';
  if (hit.status !== 'PENDING' || !hit.requested_by) return 'NONE';
  return hit.requested_by === viewerId ? 'OUTGOING' : 'INCOMING';
}

/** The other person in a pair row. */
export function otherUserId(row: Pick<FriendshipRow, 'user_a' | 'user_b'>, viewerId: string): string {
  return row.user_a === viewerId ? row.user_b : row.user_a;
}

/**
 * The canonical pair key, matching `public.friend_pair` exactly.
 *
 * Kept in step with the SQL so the client can address a row without a round
 * trip; the tests assert both orderings agree.
 */
export function pairKey(one: string, two: string): [string, string] {
  return one < two ? [one, two] : [two, one];
}

/** What the primary button reads, per relationship. */
export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  NONE: 'הוסף חבר',
  OUTGOING: 'בקשה נשלחה',
  INCOMING: 'אישור בקשה',
  FRIENDS: 'חברים',
};

/** The same on a player's profile, where the wording is a shade more direct. */
export const PROFILE_RELATIONSHIP_LABEL: Record<Relationship, string> = {
  ...RELATIONSHIP_LABEL,
  INCOMING: 'אשר בקשה',
};

/**
 * Whether pressing the button does anything.
 *
 * "בקשה נשלחה" is a statement, not an offer — cancelling is a separate,
 * secondary action, so the primary button is inert. "חברים" is likewise a
 * fact; removing a friend lives behind a confirmation, never one tap away
 * from the button that says you are friends.
 */
export function isActionable(relationship: Relationship): boolean {
  return relationship === 'NONE' || relationship === 'INCOMING';
}

/** How the button should look. */
export function relationshipTone(relationship: Relationship): 'primary' | 'secondary' | 'success' {
  if (relationship === 'INCOMING') return 'success';
  if (relationship === 'NONE') return 'primary';
  return 'secondary';
}

export interface FriendSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FriendRequestSummary extends FriendSummary {
  /** When the request arrived, so the newest can be shown first. */
  requestedAt: string;
}

/**
 * Newest first for requests, alphabetical for friends.
 *
 * A request list is a queue and reads best in the order it arrived; a friends
 * list is a directory, and a directory that reorders itself as people are
 * added is one nobody can scan.
 */
export function sortRequests<T extends FriendRequestSummary>(requests: readonly T[]): T[] {
  return [...requests].sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
}

export function sortFriends<T extends FriendSummary>(friends: readonly T[]): T[] {
  return [...friends].sort((a, b) => a.displayName.localeCompare(b.displayName, 'he'));
}

/** A friendship row with both sides' profiles attached, as the query returns it. */
export interface FriendshipWithPeople extends FriendshipRow {
  person_a: Person | null;
  person_b: Person | null;
}

export interface Person {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

const NO_FRIENDS: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

export interface FriendsOverview {
  friends: FriendSummary[];
  /** Requests waiting for the caller to answer. */
  incoming: FriendRequestSummary[];
  /** Requests the caller has sent and can still withdraw. */
  outgoing: FriendRequestSummary[];
}

/**
 * Sorts the caller's rows into friends, requests received and requests sent.
 *
 * Both profiles arrive attached to the row, one per side of the pair, so which
 * of them is "the other person" is decided here rather than by a lookup — and
 * it depends on the viewer, which is exactly why it cannot be decided by the
 * query.
 */
export function summariseFriendships(
  rows: readonly FriendshipWithPeople[],
  userId: string,
): FriendsOverview {
  if (rows.length === 0) return NO_FRIENDS;

  const friends: FriendSummary[] = [];
  const incoming: FriendRequestSummary[] = [];
  const outgoing: FriendRequestSummary[] = [];

  for (const row of rows) {
    const id = otherUserId(row, userId);
    const profile = row.user_a === id ? row.person_a : row.person_b;
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
