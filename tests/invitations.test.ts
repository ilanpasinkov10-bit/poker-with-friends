import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptsInvitations,
  INVITE_STATE_LABEL,
  inviteStateFor,
  relativeDayLabel,
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

describe('relativeDayLabel', () => {
  it('says היום for a game tonight', () => {
    expect(relativeDayLabel('2026-08-28', '2026-08-28')).toBe('היום');
  });

  it('says מחר for tomorrow', () => {
    expect(relativeDayLabel('2026-08-29', '2026-08-28')).toBe('מחר');
  });

  it('leaves any other day to be written out as a date', () => {
    expect(relativeDayLabel('2026-08-30', '2026-08-28')).toBeNull();
    expect(relativeDayLabel('2026-08-27', '2026-08-28')).toBeNull();
  });

  it('crosses a month and a year without arithmetic going wrong', () => {
    expect(relativeDayLabel('2026-09-01', '2026-08-31')).toBe('מחר');
    expect(relativeDayLabel('2027-01-01', '2026-12-31')).toBe('מחר');
    // A leap day is a real tomorrow.
    expect(relativeDayLabel('2028-02-29', '2028-02-28')).toBe('מחר');
    expect(relativeDayLabel('2027-03-01', '2027-02-28')).toBe('מחר');
  });

  it('is unbothered by a malformed reference day', () => {
    expect(relativeDayLabel('2026-08-28', '')).toBeNull();
  });
});

describe('the invitation notification rides on the existing push path', () => {
  // `src/lib/push/invitations.ts` is `server-only`, so it cannot be imported
  // here. What matters is architectural rather than behavioural anyway: that
  // there is no *second* delivery path — no VAPID keys of its own, no query
  // against the subscription table, no per-user settings check duplicated from
  // `send.ts`, which already honours all of that.
  const source = readFileSync(
    join(import.meta.dirname, '..', 'src', 'lib', 'push', 'invitations.ts'),
    'utf8',
  );

  it('delivers through notifyUsers, like every other notification', () => {
    expect(source).toMatch(/import \{ notifyUsers \} from '\.\/send'/);
  });

  it('builds no delivery machinery of its own', () => {
    for (const forbidden of ['web-push', 'webpush', 'push_subscriptions', 'vapid', 'createAdminClient']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('sends one kind, and points it at a screen the invitee can actually open', () => {
    // Not the table: they cannot see it until they have accepted.
    expect(source).toContain("kind: 'TABLE_INVITATION'");
    expect(source).toContain('url: siteUrl()');
    expect(source).toMatch(/tag: `table-invitation-\$\{tableId\}`/);
  });

  it('announces the invitation and nothing else', () => {
    // No push for an answer: a buzz for every friend who said no would be
    // noise, and the admin is looking at the table either way.
    expect(source.match(/notifyUsers\(/g)?.length ?? 0).toBe(1);
  });
});

describe('the service worker forwards a push to open tabs', () => {
  const sw = readFileSync(join(import.meta.dirname, '..', 'public', 'sw.js'), 'utf8');

  it('posts the push to any window that is already open', () => {
    expect(sw).toContain("client.postMessage({ source: 'pwf-push'");
  });

  it('still shows the notification itself', () => {
    expect(sw).toContain('showNotification');
  });
});
