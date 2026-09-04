'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, ok, type ActionResult } from '@/lib/action-result';
import { AppError } from '@/lib/errors';
import { loadFriends } from '@/lib/data/friends';
import { loadTableInvitationStatuses } from '@/lib/data/invitations';
import { sortFriends } from '@/lib/domain/friends';
import { inviteStateFor, type FriendInviteView } from '@/lib/domain/invitations';
import { notifyTableInvitation } from '@/lib/push/invitations';
import { createClient } from '@/lib/supabase/server';

/**
 * Sending an invitation, answering one, and the one read the sheet needs.
 *
 * None of these decides who may do what. The database functions authorise off
 * `auth.uid()` while holding a row lock: only somebody running the table can
 * invite, only a friend can be invited, and only the person invited can
 * answer. A table id or a user id arriving from the browser is therefore an
 * *argument*, never a permission — a forged one is refused by the same rule a
 * genuine one passes.
 *
 * A notification is only ever sent after the database confirms it wrote a new
 * invitation, which is what stops a double tap producing two buzzes: the
 * second call returns the invitation that already existed and reports that it
 * created nothing.
 */

const uuidSchema = z.string().uuid();

async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError('NOT_AUTHENTICATED');
  return user.id;
}

interface InviteResult {
  id: string;
  created: boolean;
  table_name: string;
  inviter_name: string | null;
}

export async function inviteFriendToTableAction(
  tableId: string,
  friendUserId: string,
): Promise<ActionResult<{ alreadyInvited: boolean }>> {
  return guard(async () => {
    const table = uuidSchema.parse(tableId);
    const friend = uuidSchema.parse(friendUserId);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('invite_friend_to_table', {
      p_table: table,
      p_friend: friend,
    });
    if (error) throw error;

    const result = data as InviteResult | null;
    if (!result?.id) throw new AppError('RPC_BAD_SHAPE');

    // The table's and the inviter's names come back with the invitation, so
    // the notification costs no further queries.
    if (result.created) {
      await notifyTableInvitation({
        inviteeId: friend,
        inviterName: result.inviter_name ?? 'מארגן השולחן',
        tableId: table,
        tableName: result.table_name,
      });
    }

    revalidatePath(`/table/${table}`);
    return ok({ alreadyInvited: !result.created });
  });
}

/**
 * Accepting or declining.
 *
 * Accepting goes through `join_table` inside the database function, so a seat
 * taken here is the same seat taken from a link — same approval rules, same
 * initial buy-in, same idempotence if the button is pressed twice.
 */
export async function respondToInvitationAction(
  invitationId: string,
  accept: boolean,
): Promise<ActionResult<{ tableId: string | null }>> {
  return guard(async () => {
    const invitation = uuidSchema.parse(invitationId);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('respond_to_table_invitation', {
      p_invitation: invitation,
      p_accept: accept,
    });
    if (error) throw error;

    const result = (data ?? {}) as { table_id?: string };
    // Declining is not announced. Being turned down is not something to push
    // to somebody's lock screen, and the admin sees the table either way.

    revalidatePath('/');
    revalidatePath('/tables');
    if (result.table_id) revalidatePath(`/table/${result.table_id}`);
    return ok({ tableId: accept ? (result.table_id ?? null) : null });
  });
}

/**
 * The caller's friends, each labelled with where they stand for one table.
 *
 * Two queries, not one per friend: the friends, and every invitation for this
 * table. Whoever is already seated is passed in by the sheet, which is
 * rendered inside a screen that already knows the players — so this adds no
 * query for them at all.
 */
export async function listFriendsForTableAction(
  tableId: string,
  seatedUserIds: string[],
): Promise<ActionResult<FriendInviteView[]>> {
  return guard(async () => {
    const table = uuidSchema.parse(tableId);
    const seated = new Set(z.array(uuidSchema).max(64).parse(seatedUserIds));
    const me = await currentUserId();

    const [friends, invitations] = await Promise.all([
      loadFriends(me),
      loadTableInvitationStatuses(table),
    ]);

    return ok(
      sortFriends(friends).map((friend) => ({
        userId: friend.userId,
        displayName: friend.displayName,
        avatarUrl: friend.avatarUrl,
        state: inviteStateFor(friend.userId, seated, invitations),
      })),
    );
  });
}
