import { describe, expect, it } from 'vitest';
import {
  acceptsInvitations,
  INVITE_STATE_LABEL,
  inviteStateFor,
  type InviteState,
} from '@/lib/domain/invitations';
import { toHebrewError } from '@/lib/errors';
import type { InvitationStatus, TableStatus } from '@/types/database';

const ME = 'a0000000-0000-4000-8000-000000000001';
const FRIEND = 'a0000000-0000-4000-8000-000000000002';

function state(
  seated: string[],
  invitations: [string, InvitationStatus][] = [],
  who = FRIEND,
): InviteState {
  return inviteStateFor(who, new Set(seated), new Map(invitations));
}

describe('inviteStateFor', () => {
  it('offers to invite a friend nothing has happened with yet', () => {
    expect(state([])).toBe('CAN_INVITE');
  });

  it('shows an unanswered invitation as sent', () => {
    expect(state([], [[FRIEND, 'PENDING']])).toBe('INVITED');
  });

  it('shows somebody who accepted as at the table', () => {
    expect(state([], [[FRIEND, 'ACCEPTED']])).toBe('JOINED');
  });

  it('shows somebody who said no, and does not offer to ask again', () => {
    expect(state([], [[FRIEND, 'DECLINED']])).toBe('DECLINED');
  });

  it('treats a seat as the later fact, whatever the invitation says', () => {
    // Somebody can arrive by link while their invitation is still pending, or
    // after declining it and changing their mind at the door. The sheet must
    // not then offer to invite a person who is sitting at the table.
    expect(state([FRIEND], [[FRIEND, 'PENDING']])).toBe('JOINED');
    expect(state([FRIEND], [[FRIEND, 'DECLINED']])).toBe('JOINED');
    expect(state([FRIEND])).toBe('JOINED');
  });

  it("keeps one friend's state out of another's", () => {
    const seated = new Set([ME]);
    const invitations = new Map<string, InvitationStatus>([[ME, 'ACCEPTED']]);
    expect(inviteStateFor(FRIEND, seated, invitations)).toBe('CAN_INVITE');
  });

  it('labels every state in Hebrew', () => {
    expect(INVITE_STATE_LABEL.CAN_INVITE).toBe('הזמן');
    expect(INVITE_STATE_LABEL.INVITED).toBe('הוזמן');
    expect(INVITE_STATE_LABEL.JOINED).toBe('הצטרף');
    expect(INVITE_STATE_LABEL.DECLINED).toBe('דחה');
  });
});

describe('acceptsInvitations', () => {
  it('accepts exactly the statuses join_table accepts', () => {
    // Kept in step with `join_table`, which is what actually refuses the rest.
    const open: TableStatus[] = ['WAITING', 'ACTIVE'];
    const closed: TableStatus[] = ['COUNTING', 'COMPLETED', 'CANCELLED'];
    for (const status of open) expect(acceptsInvitations(status)).toBe(true);
    for (const status of closed) expect(acceptsInvitations(status)).toBe(false);
  });
});

describe('invitation refusals reach the user in Hebrew', () => {
  it('translates every code the invitation functions raise', () => {
    for (const code of [
      'CANNOT_INVITE_SELF',
      'NOT_FRIENDS',
      'ALREADY_AT_TABLE',
      'INVITATION_ALREADY_ANSWERED',
      'INVITATION_NOT_FOUND',
      'TABLE_CLOSED',
      'NOT_AUTHORIZED',
      'NAME_TAKEN',
    ]) {
      const { code: mapped, message } = toHebrewError(new Error(code));
      expect(mapped).toBe(code);
      expect(message).toMatch(/[֐-׿]/);
      expect(message).not.toContain(code);
    }
  });
});
