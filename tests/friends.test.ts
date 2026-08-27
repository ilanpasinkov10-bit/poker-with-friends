import { describe, expect, it } from 'vitest';
import {
  isActionable,
  otherUserId,
  pairKey,
  PROFILE_RELATIONSHIP_LABEL,
  relationshipOf,
  relationshipOfSearchHit,
  RELATIONSHIP_LABEL,
  relationshipTone,
  sortFriends,
  sortRequests,
  summariseFriendships,
  type FriendshipWithPeople,
  type Relationship,
} from '@/lib/domain/friends';
import type { FriendshipRow } from '@/types/database';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('reading a pair row from one side', () => {
  it('is NONE when there is no row at all', () => {
    expect(relationshipOf(null, ME)).toBe('NONE');
    expect(relationshipOf(undefined, ME)).toBe('NONE');
  });

  it('is FRIENDS for both sides of an accepted row', () => {
    const row = { status: 'ACCEPTED' as const, requestedBy: ME };
    expect(relationshipOf(row, ME)).toBe('FRIENDS');
    expect(relationshipOf(row, THEM)).toBe('FRIENDS');
  });

  /** The whole reason this module exists: one row, two points of view. */
  it('reads one pending row as outgoing for the sender and incoming for the other', () => {
    const row = { status: 'PENDING' as const, requestedBy: ME };
    expect(relationshipOf(row, ME)).toBe('OUTGOING');
    expect(relationshipOf(row, THEM)).toBe('INCOMING');
  });

  it('shows a declined request as if nothing had happened', () => {
    const row = { status: 'DECLINED' as const, requestedBy: ME };
    // Neither side is told. The person refused simply sees "הוסף חבר" again,
    // and may ask once more.
    expect(relationshipOf(row, ME)).toBe('NONE');
    expect(relationshipOf(row, THEM)).toBe('NONE');
  });
});

describe('reading a search result', () => {
  it.each([
    ['ACCEPTED', ME, 'FRIENDS'],
    ['PENDING', ME, 'OUTGOING'],
    ['PENDING', THEM, 'INCOMING'],
    ['DECLINED', ME, 'NONE'],
    ['NONE', null, 'NONE'],
  ] as const)('maps %s requested by %s', (status, requestedBy, expected) => {
    expect(relationshipOfSearchHit({ status, requested_by: requestedBy }, ME)).toBe(expected);
  });

  it('does not trust a pending row with no requester', () => {
    expect(relationshipOfSearchHit({ status: 'PENDING', requested_by: null }, ME)).toBe('NONE');
  });
});

describe('the pair key', () => {
  it('does not depend on the order of the arguments', () => {
    expect(pairKey(ME, THEM)).toEqual(pairKey(THEM, ME));
  });

  it('always puts the smaller id first, matching the SQL constraint', () => {
    const [a, b] = pairKey(THEM, ME);
    expect(a < b).toBe(true);
  });

  it('finds the other person from either side of a row', () => {
    const row = { user_a: ME, user_b: THEM } as FriendshipRow;
    expect(otherUserId(row, ME)).toBe(THEM);
    expect(otherUserId(row, THEM)).toBe(ME);
  });
});

describe('what the button says and does', () => {
  it.each([
    ['NONE', 'הוסף חבר'],
    ['OUTGOING', 'בקשה נשלחה'],
    ['INCOMING', 'אישור בקשה'],
    ['FRIENDS', 'חברים'],
  ] as const)('labels %s as "%s"', (relationship, label) => {
    expect(RELATIONSHIP_LABEL[relationship]).toBe(label);
  });

  it('says "אשר בקשה" on a profile, where the wording is more direct', () => {
    expect(PROFILE_RELATIONSHIP_LABEL.INCOMING).toBe('אשר בקשה');
    expect(PROFILE_RELATIONSHIP_LABEL.FRIENDS).toBe('חברים');
  });

  it('has a label for every relationship, so a button can never be blank', () => {
    const all: Relationship[] = ['NONE', 'OUTGOING', 'INCOMING', 'FRIENDS'];
    for (const relationship of all) {
      expect(RELATIONSHIP_LABEL[relationship]).toBeTruthy();
      expect(PROFILE_RELATIONSHIP_LABEL[relationship]).toBeTruthy();
    }
  });

  it('only offers a tap where there is something to do', () => {
    expect(isActionable('NONE')).toBe(true);
    expect(isActionable('INCOMING')).toBe(true);
    // Both of these are statements of fact. Withdrawing a request and removing
    // a friend are separate, deliberate actions.
    expect(isActionable('OUTGOING')).toBe(false);
    expect(isActionable('FRIENDS')).toBe(false);
  });

  it('gives an incoming request the affirmative styling', () => {
    expect(relationshipTone('INCOMING')).toBe('success');
    expect(relationshipTone('NONE')).toBe('primary');
    expect(relationshipTone('OUTGOING')).toBe('secondary');
    expect(relationshipTone('FRIENDS')).toBe('secondary');
  });
});

describe('ordering', () => {
  const request = (name: string, at: string) => ({
    userId: name,
    displayName: name,
    avatarUrl: null,
    requestedAt: at,
  });

  it('puts the newest request first — a request list is a queue', () => {
    const sorted = sortRequests([
      request('שי', '2026-08-20T10:00:00.000Z'),
      request('מיכל', '2026-08-26T10:00:00.000Z'),
      request('רועי', '2026-08-24T10:00:00.000Z'),
    ]);
    expect(sorted.map((r) => r.displayName)).toEqual(['מיכל', 'רועי', 'שי']);
  });

  it('sorts friends by Hebrew name — a directory has to be scannable', () => {
    const friend = (name: string) => ({ userId: name, displayName: name, avatarUrl: null });
    const sorted = sortFriends([friend('שי'), friend('אילן'), friend('מיכל')]);
    expect(sorted.map((f) => f.displayName)).toEqual(['אילן', 'מיכל', 'שי']);
  });

  it('leaves the input alone', () => {
    const input = [request('ב', '2026-08-20T10:00:00.000Z'), request('א', '2026-08-26T10:00:00.000Z')];
    const before = [...input];
    sortRequests(input);
    expect(input).toEqual(before);
  });
});

describe('sorting a viewer’s rows into friends and requests', () => {
  const dana = { id: THEM, display_name: 'דנה', avatar_url: null };
  const me = { id: ME, display_name: 'אילן', avatar_url: null };
  const row = (over: Partial<FriendshipWithPeople> = {}): FriendshipWithPeople => ({
    user_a: ME,
    user_b: THEM,
    status: 'ACCEPTED',
    requested_by: ME,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    person_a: me,
    person_b: dana,
    ...over,
  });

  it('takes the other person, whichever side of the pair they are on', () => {
    // Rows are stored with the ids in canonical order, so the viewer is
    // sometimes user_a and sometimes user_b. Picking the wrong side would show
    // the viewer their own name in their own friends list.
    const asA = summariseFriendships([row()], ME);
    expect(asA.friends).toEqual([{ userId: THEM, displayName: 'דנה', avatarUrl: null }]);

    const asB = summariseFriendships([row()], THEM);
    expect(asB.friends).toEqual([{ userId: ME, displayName: 'אילן', avatarUrl: null }]);
  });

  it('separates a request sent from a request received', () => {
    const pending = row({ status: 'PENDING', requested_by: ME });
    expect(summariseFriendships([pending], ME).outgoing).toHaveLength(1);
    expect(summariseFriendships([pending], ME).incoming).toHaveLength(0);
    expect(summariseFriendships([pending], THEM).incoming).toHaveLength(1);
    expect(summariseFriendships([pending], THEM).outgoing).toHaveLength(0);
  });

  it('skips a row whose other side cannot be read', () => {
    // RLS hides a profile, or the account was deleted mid-flight. Better a
    // missing card than a blank one.
    const orphan = row({ person_b: null });
    expect(summariseFriendships([orphan], ME).friends).toEqual([]);
  });

  it('has nothing to say about an empty list', () => {
    expect(summariseFriendships([], ME)).toEqual({ friends: [], incoming: [], outgoing: [] });
  });
});
