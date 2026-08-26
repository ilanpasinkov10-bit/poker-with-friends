'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
import { isUuid } from '@/lib/domain/ids';
import type { Relationship } from '@/lib/domain/friends';
import { pairKey, relationshipOf, relationshipOfSearchHit } from '@/lib/domain/friends';
import { notifyFriendAccepted, notifyFriendRequest } from '@/lib/push/friend-events';
import { loadFriends } from '@/lib/data/friends';
import type { FriendSummary } from '@/lib/domain/friends';
import { createClient } from '@/lib/supabase/server';

/**
 * Every friendship write, and the one read that has to reach past RLS.
 *
 * None of these decides who may do what — that is settled inside the database
 * functions, which authorise off `auth.uid()` and hold a row lock while they
 * do it. These wrap the call, translate the machine code into Hebrew, and
 * decide whether the moment is worth a notification.
 *
 * A notification is only ever sent after the database has *confirmed* the
 * transition, which is what stops a double tap producing two buzzes: the
 * second call raises REQUEST_ALREADY_SENT and never reaches the push.
 */

async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('NOT_AUTHENTICATED');
  return user.id;
}

const userIdSchema = z.string().uuid();

export async function sendFriendRequestAction(
  targetUserId: string,
): Promise<ActionResult<{ relationship: Relationship }>> {
  return guard(async () => {
    const target = userIdSchema.parse(targetUserId);
    const me = await currentUserId();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('send_friend_request', { p_target: target });
    if (error) throw error;

    // The function returns the status the pair ended up in. Asking somebody
    // who had already asked you accepts instead of creating a second request,
    // and that is an acceptance as far as the other person is concerned.
    const status = String(data);
    if (status === 'ACCEPTED') {
      await notifyFriendAccepted(me, target);
      revalidatePath('/profile/friends');
      return ok<{ relationship: Relationship }>({ relationship: 'FRIENDS' });
    }

    await notifyFriendRequest(me, target);
    revalidatePath('/profile/friends');
    return ok<{ relationship: Relationship }>({ relationship: 'OUTGOING' });
  });
}

export async function respondToFriendRequestAction(
  fromUserId: string,
  accept: boolean,
): Promise<ActionResult<{ relationship: Relationship }>> {
  return guard(async () => {
    const from = userIdSchema.parse(fromUserId);
    const me = await currentUserId();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('respond_to_friend_request', {
      p_from: from,
      p_accept: accept,
    });
    if (error) throw error;

    // Only an acceptance is announced. Being declined is not something to
    // push to somebody's lock screen, and silence keeps the refusal private.
    if (String(data) === 'ACCEPTED') await notifyFriendAccepted(me, from);

    revalidatePath('/profile/friends');
    return ok<{ relationship: Relationship }>({ relationship: accept ? 'FRIENDS' : 'NONE' });
  });
}

export async function cancelFriendRequestAction(targetUserId: string): Promise<ActionResult> {
  return guard(async () => {
    const target = userIdSchema.parse(targetUserId);
    const supabase = await createClient();
    const { error } = await supabase.rpc('cancel_friend_request', { p_target: target });
    if (error) throw error;
    revalidatePath('/profile/friends');
    return ok();
  });
}

/**
 * Ends a friendship. One row is deleted and nothing else: every game the two
 * played together is keyed by table and user and is untouched by this.
 */
export async function removeFriendAction(targetUserId: string): Promise<ActionResult> {
  return guard(async () => {
    const target = userIdSchema.parse(targetUserId);
    const supabase = await createClient();
    const { error } = await supabase.rpc('remove_friend', { p_target: target });
    if (error) throw error;
    revalidatePath('/profile/friends');
    return ok();
  });
}


/**
 * Where the caller and one other user currently stand.
 *
 * Reads the pair row directly: RLS returns it only if the caller is one of the
 * two, so a probe for somebody else's friendships comes back empty rather than
 * answered. Used to label the button on a player's profile.
 */
export async function fetchRelationshipAction(
  otherUserId: string,
): Promise<ActionResult<{ relationship: Relationship }>> {
  return guard(async () => {
    const other = userIdSchema.parse(otherUserId);
    const me = await currentUserId();
    if (other === me) return ok<{ relationship: Relationship }>({ relationship: 'NONE' });

    const [a, b] = pairKey(me, other);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('friendships')
      .select('status, requested_by')
      .eq('user_a', a)
      .eq('user_b', b)
      .maybeSingle();
    if (error) throw error;

    return ok<{ relationship: Relationship }>({
      relationship: relationshipOf(
        data ? { status: data.status, requestedBy: data.requested_by } : null,
        me,
      ),
    });
  });
}

/**
 * The caller's accepted friends. Backs the table's invite sheet, which is a
 * client component and so cannot read the database directly.
 */
export async function listFriendsAction(): Promise<ActionResult<FriendSummary[]>> {
  return guard(async () => {
    const me = await currentUserId();
    return ok(await loadFriends(me));
  });
}

export interface UserSearchHit {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  relationship: Relationship;
}

interface RawHit {
  id: string;
  display_name: string;
  avatar_url: string | null;
  status: string;
  requested_by: string | null;
}

/**
 * Finds registered users by display name, or by a pasted user id.
 *
 * `profiles` is not readable for strangers and must not become so, so this
 * goes through `search_users`, which is the one narrow exception: it returns a
 * name, an avatar, and where the two of you already stand — and reads no other
 * column, so nothing private can leak through it. Guests are excluded and the
 * caller never appears in their own results.
 */
export async function searchUsersAction(query: string): Promise<ActionResult<UserSearchHit[]>> {
  return guard(async () => {
    const text = z.string().max(120).parse(query).trim();
    if (text.length < 2) return ok([]);

    const me = await currentUserId();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('search_users', { p_query: text });
    if (error) throw error;

    const rows = (Array.isArray(data) ? data : []) as RawHit[];
    return ok(
      rows
        .filter((row) => isUuid(row.id))
        .map((row) => ({
          userId: row.id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          relationship: relationshipOfSearchHit(row, me),
        })),
    );
  });
}
