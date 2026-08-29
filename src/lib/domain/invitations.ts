/**
 * What an invitation is *to the person looking at it*.
 *
 * The database stores one row per (table, person) with a status. What the
 * admin's sheet should offer next depends on that status *and* on whether the
 * friend is already sitting at the table — a person can arrive by link while
 * their invitation is still pending, and the sheet must then say "הצטרף", not
 * offer to invite them again.
 *
 * Deriving that here, once, is what stops the sheet and the home screen
 * disagreeing about the same row. Pure: no React, no Supabase, no clock.
 */

import type { InvitationStatus, TableStatus } from '@/types/database';

/**
 * The state of one friend, from the admin's side.
 *
 *  · `CAN_INVITE` — nothing has happened yet; the button invites.
 *  · `INVITED`    — asked, not yet answered.
 *  · `JOINED`     — at the table, however they got there.
 *  · `DECLINED`   — said no. The button stays disabled: being asked again
 *                   after saying no is the thing this most easily gets wrong,
 *                   and the database refuses it anyway.
 */
export type InviteState = 'CAN_INVITE' | 'INVITED' | 'JOINED' | 'DECLINED';

export const INVITE_STATE_LABEL: Record<InviteState, string> = {
  CAN_INVITE: 'הזמן',
  INVITED: 'הוזמן',
  JOINED: 'הצטרף',
  DECLINED: 'דחה',
};

/** A table that can still be joined, and so can still be invited to. */
export function acceptsInvitations(status: TableStatus): boolean {
  return status === 'WAITING' || status === 'ACTIVE';
}

/**
 * Sitting at the table wins over any invitation: it is the later fact, and it
 * is the one the admin can see on the screen behind the sheet.
 */
export function inviteStateFor(
  friendUserId: string,
  seatedUserIds: ReadonlySet<string>,
  invitations: ReadonlyMap<string, InvitationStatus>,
): InviteState {
  if (seatedUserIds.has(friendUserId)) return 'JOINED';
  const status = invitations.get(friendUserId);
  if (status === 'ACCEPTED') return 'JOINED';
  if (status === 'DECLINED') return 'DECLINED';
  if (status === 'PENDING') return 'INVITED';
  return 'CAN_INVITE';
}

/** One friend, ready to render. */
export interface FriendInviteView {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  state: InviteState;
}

/** An invitation waiting for an answer, as the home screen shows it. */
export interface PendingInvitationView {
  id: string;
  tableId: string;
  tableName: string;
  gameDate: string;
  buyInAgorot: number;
  inviterName: string;
  inviterAvatarUrl: string | null;
}
