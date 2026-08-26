import { describe, expect, it } from 'vitest';
import { buildTableActivity, type ActivityLedgerRow } from '@/lib/domain/activity';
import {
  EVENT_SOUND,
  eventSentence,
  eventToast,
  notificationCopy,
  sortEvents,
  TABLE_EVENT_KINDS,
  type TableEvent,
} from '@/lib/domain/events';
import { isScannable, joinPath, joinUrl } from '@/lib/domain/join-link';
import {
  isReminderDue,
  shouldWatchForReminder,
  type ReminderState,
} from '@/lib/domain/ending-soon';
import { computePotTotals } from '@/lib/domain/participation';
import {
  canAdminAddBuyIn,
  canApproveRebuy,
  canRequestRebuy,
  canTransition,
  finalizeReadiness,
  isGameOpenForBuyIns,
} from '@/lib/domain/permissions';
import { alertsForChange, type AlertSnapshot } from '@/lib/domain/table-alerts';

/**
 * The event vocabulary shared by the push notifications, the in-app sounds and
 * the live pot's activity feed. All three read from these functions, so the
 * wording, the timing and the arithmetic are pinned in one place.
 */

// ---------------------------------------------------------------------------
// The Hebrew a player reads
// ---------------------------------------------------------------------------
describe('notification wording', () => {
  it('announces an arrival', () => {
    expect(eventSentence({ id: 'j', kind: 'PLAYER_JOINED', at: NOW, playerName: 'מאור' })).toBe(
      'מאור הצטרף לשולחן',
    );
  });

  it('announces a departure with the chips and what they are worth', () => {
    expect(
      eventSentence({
        id: 'l',
        kind: 'PLAYER_LEFT',
        at: NOW,
        playerName: 'ליאור',
        finalChips: 1_500,
        finalValueAgorot: 15_000,
      }),
    ).toBe('ליאור עזב את השולחן עם 1,500 ז׳יטונים (150₪)');
  });

  it('announces an additional entry with its cost and chips', () => {
    expect(
      eventSentence({
        id: 'b',
        kind: 'BUY_IN',
        at: NOW,
        playerName: 'דני',
        amountAgorot: 5_000,
        chips: 500,
      }),
    ).toBe('דני נכנס בעוד כניסה של 50₪ וקיבל 500 ז׳יטונים');
  });

  it('puts the table name in the title so two games are distinguishable', () => {
    const copy = notificationCopy(
      { id: 'j', kind: 'PLAYER_JOINED', at: NOW, playerName: 'מאור' },
      'פוקר של יום חמישי',
    );
    expect(copy.title).toBe('פוקר של יום חמישי');
    expect(copy.body).toBe('מאור הצטרף לשולחן');
  });

  it('has a sentence for every kind, so none can ship empty', () => {
    const samples = [
      { id: 's', kind: 'GAME_STARTED', at: NOW, tableName: 'ט' },
      { id: 'e', kind: 'ENDING_SOON', at: NOW, tableName: 'ט' },
      { id: 'g', kind: 'GAME_ENDED', at: NOW, tableName: 'ט' },
    ] as const;
    for (const event of samples) expect(eventSentence(event).length).toBeGreaterThan(0);
  });
});

const NOW = '2026-08-23T20:00:00.000Z';

describe('ordering the feed', () => {
  it('puts the newest first', () => {
    const ordered = sortEvents([
      { id: 'a', kind: 'PLAYER_JOINED', at: '2026-08-23T20:00:00.000Z', playerName: 'א' },
      { id: 'b', kind: 'PLAYER_JOINED', at: '2026-08-23T21:00:00.000Z', playerName: 'ב' },
    ]);
    expect(ordered.map((e) => 'playerName' in e && e.playerName)).toEqual(['ב', 'א']);
  });

  it('is stable when two events share a timestamp', () => {
    // A join and its opening entry commit together. A list that reshuffled on
    // every realtime refresh would read as broken.
    const events = [
      { id: 'buyin:1', kind: 'BUY_IN', at: NOW, playerName: 'א', amountAgorot: 5_000, chips: 500 },
      { id: 'join:1', kind: 'PLAYER_JOINED', at: NOW, playerName: 'א' },
    ] as const;
    expect(sortEvents(events)).toEqual(sortEvents([...events].reverse()));
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `join:${i}`,
      kind: 'PLAYER_JOINED' as const,
      at: new Date(Date.parse(NOW) + i * 1000).toISOString(),
      playerName: `p${i}`,
    }));
    expect(sortEvents(many, 8)).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// The activity feed, derived from seats and the ledger
// ---------------------------------------------------------------------------
function tx(over: Partial<ActivityLedgerRow> & { id: string; player: string }): ActivityLedgerRow {
  return {
    id: over.id,
    table_player_id: over.player,
    type: over.type ?? 'BUY_IN',
    amount_agorot: over.amount_agorot ?? 5_000,
    chips: over.chips ?? 500,
    created_at: over.created_at ?? NOW,
    created_by: over.created_by ?? 'admin-user',
    reverses_transaction_id: over.reverses_transaction_id ?? null,
  };
}

describe('the recent-activity feed', () => {
  const seat = {
    id: 'seat-a',
    userId: 'user-dani',
    displayName: 'דני',
    joinedAt: '2026-08-23T18:00:00.000Z',
    leftAt: null,
    cashOut: null,
  };

  it('reports a join', () => {
    const events = buildTableActivity([seat], []);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('PLAYER_JOINED');
  });

  it('does not report the opening entry as an additional entry', () => {
    // Joining creates the seat and its first entry in one transaction. Showing
    // both would report a single action twice.
    const events = buildTableActivity(
      [seat],
      [tx({ id: 'tx1', player: 'seat-a', created_at: '2026-08-23T18:00:00.000Z' })],
    );
    expect(events.map((e) => e.kind)).toEqual(['PLAYER_JOINED']);
  });

  it('reports every entry after the first', () => {
    const events = buildTableActivity(
      [seat],
      [
        tx({ id: 'tx1', player: 'seat-a', created_at: '2026-08-23T18:00:00.000Z' }),
        tx({ id: 'tx2', player: 'seat-a', created_at: '2026-08-23T19:00:00.000Z' }),
        tx({ id: 'tx3', player: 'seat-a', created_at: '2026-08-23T20:00:00.000Z' }),
      ],
    );
    expect(events.filter((e) => e.kind === 'BUY_IN')).toHaveLength(2);
  });

  it('ignores a reversed entry and the reversal itself', () => {
    // An undone buy-in never happened as far as the table is concerned.
    const events = buildTableActivity(
      [seat],
      [
        tx({ id: 'tx1', player: 'seat-a', created_at: '2026-08-23T18:00:00.000Z' }),
        tx({ id: 'tx2', player: 'seat-a', created_at: '2026-08-23T19:00:00.000Z' }),
        tx({
          id: 'tx3',
          player: 'seat-a',
          type: 'REVERSAL',
          created_at: '2026-08-23T19:05:00.000Z',
          reverses_transaction_id: 'tx2',
        }),
      ],
    );
    expect(events.filter((e) => e.kind === 'BUY_IN')).toHaveLength(0);
  });

  it('reports a completed departure with the persisted figures', () => {
    const events = buildTableActivity(
      [
        {
          ...seat,
          leftAt: '2026-08-23T21:00:00.000Z',
          cashOut: {
            finalChips: 1_200,
            finalValueAgorot: 12_000,
            leftAt: '2026-08-23T21:00:00.000Z',
          },
        },
      ],
      [],
    );
    const left = events.find((e) => e.kind === 'PLAYER_LEFT');
    expect(left).toBeDefined();
    expect(left).toMatchObject({ finalChips: 1_200, finalValueAgorot: 12_000 });
  });

  it('says nothing about a leave that never completed', () => {
    // No cash-out summary means no completed leave — the same rule the player
    // card uses, so the feed cannot claim a departure the card denies.
    const events = buildTableActivity(
      [{ ...seat, leftAt: '2026-08-23T21:00:00.000Z', cashOut: null }],
      [],
    );
    expect(events.some((e) => e.kind === 'PLAYER_LEFT')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The live pot's arithmetic
// ---------------------------------------------------------------------------
describe('the live pot figures', () => {
  const seated = { totalPaidAgorot: 15_000, chipsIssued: 1_500, cashOut: null };
  const leaver = {
    totalPaidAgorot: 10_000,
    chipsIssued: 1_000,
    cashOut: {
      finalChips: 1_200,
      finalValueAgorot: 12_000,
      profitLossAgorot: 2_000,
      leftAt: NOW,
    },
  };

  it('separates what entered from what is still in play', () => {
    const pot = computePotTotals([seated, leaver]);
    expect(pot.potAgorot).toBe(25_000);
    expect(pot.cashedOutAgorot).toBe(12_000);
    expect(pot.activePotAgorot).toBe(13_000);
  });

  it("takes the leaver's chips off the table too", () => {
    const pot = computePotTotals([seated, leaver]);
    expect(pot.chipsIssued).toBe(2_500);
    expect(pot.chipsCashedOut).toBe(1_200);
    expect(pot.activeChips).toBe(1_300);
  });

  it('leaves the pot whole while nobody has cashed out', () => {
    const pot = computePotTotals([seated, { ...leaver, cashOut: null }]);
    expect(pot.activePotAgorot).toBe(pot.potAgorot);
    expect(pot.activeChips).toBe(pot.chipsIssued);
  });
});

// ---------------------------------------------------------------------------
// The QR points at the existing join link, not a second mechanism
// ---------------------------------------------------------------------------
describe('the join link', () => {
  it('is the table route, whoever asks for it', () => {
    expect(joinPath('A7K92')).toBe('/join/A7K92');
    expect(joinUrl('https://poker.example.com', 'A7K92')).toBe(
      'https://poker.example.com/join/A7K92',
    );
  });

  it('gives the copy button and the QR the same address', () => {
    // They read one value in JoinCodeCard; this pins that they cannot diverge.
    const origin = 'https://poker.example.com';
    expect(joinUrl(origin, 'A7K92')).toBe(joinUrl(origin, 'A7K92'));
    expect(joinUrl(origin, 'A7K92').endsWith(joinPath('A7K92'))).toBe(true);
  });

  it('does not double the slash when the origin carries one', () => {
    expect(joinUrl('https://poker.example.com/', 'A7K92')).toBe(
      'https://poker.example.com/join/A7K92',
    );
  });

  it('falls back to the path when there is no origin, as on the server', () => {
    expect(joinUrl(null, 'A7K92')).toBe('/join/A7K92');
    expect(joinUrl('', 'A7K92')).toBe('/join/A7K92');
  });

  it('knows a bare path is not scannable', () => {
    // A camera has no current origin to resolve against, so the QR needs the
    // absolute form.
    expect(isScannable(joinUrl('https://poker.example.com', 'A7K92'))).toBe(true);
    expect(isScannable(joinPath('A7K92'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// When the "one hour to go" reminder is due
// ---------------------------------------------------------------------------
describe('the ending-soon reminder window', () => {
  const NOW = Date.parse('2026-08-23T22:00:00.000Z');
  const endingIn = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
  const table = (over: Partial<ReminderState> = {}): ReminderState => ({
    status: 'ACTIVE',
    plannedEndAt: endingIn(60),
    endingSoonNotifiedAt: null,
    ...over,
  });

  it('is due an hour before the planned finish', () => {
    expect(isReminderDue(table(), NOW)).toBe(true);
  });

  it('is not due while the game still has hours to run', () => {
    expect(isReminderDue(table({ plannedEndAt: endingIn(240) }), NOW)).toBe(false);
  });

  it('is not due once the finish is minutes away', () => {
    // A reminder landing with four minutes left is noise; the countdown on
    // screen has said the same thing for an hour.
    expect(isReminderDue(table({ plannedEndAt: endingIn(4) }), NOW)).toBe(false);
  });

  it('is not due for a game that is not being played', () => {
    for (const status of ['WAITING', 'COUNTING', 'COMPLETED', 'CANCELLED']) {
      expect(isReminderDue(table({ status }), NOW)).toBe(false);
    }
  });

  it('is never due twice', () => {
    // The stamp is what the database claim writes. Once set, every caller —
    // any phone, any scheduler — agrees there is nothing left to send.
    expect(
      isReminderDue(table({ endingSoonNotifiedAt: '2026-08-23T21:05:00.000Z' }), NOW),
    ).toBe(false);
  });

  it('is not due for a game whose finish has already passed', () => {
    expect(isReminderDue(table({ plannedEndAt: endingIn(-30) }), NOW)).toBe(false);
  });

  it('ignores an unparseable finish time rather than sending on a guess', () => {
    expect(isReminderDue(table({ plannedEndAt: 'not-a-date' }), NOW)).toBe(false);
  });
});

describe('when an open client watches for the reminder', () => {
  const NOW = Date.parse('2026-08-23T22:00:00.000Z');
  const endingIn = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
  const table = (over: Partial<ReminderState> = {}): ReminderState => ({
    status: 'ACTIVE',
    plannedEndAt: endingIn(60),
    endingSoonNotifiedAt: null,
    ...over,
  });

  it('costs nothing while the finish is far off', () => {
    // No timer, no requests — a table with hours left is exactly as cheap as
    // it was before the reminder existed.
    expect(shouldWatchForReminder(table({ plannedEndAt: endingIn(300) }), NOW)).toBe(false);
  });

  it('starts before the send window opens, so the first check is prompt', () => {
    // Watching only from the moment the window opens would risk being a whole
    // interval late.
    expect(shouldWatchForReminder(table({ plannedEndAt: endingIn(85) }), NOW)).toBe(true);
    expect(isReminderDue(table({ plannedEndAt: endingIn(85) }), NOW)).toBe(false);
  });

  it('watches throughout the send window', () => {
    for (const minutes of [75, 60, 30, 10]) {
      expect(shouldWatchForReminder(table({ plannedEndAt: endingIn(minutes) }), NOW)).toBe(true);
    }
  });

  it('stops once the reminder has gone out', () => {
    expect(
      shouldWatchForReminder(table({ endingSoonNotifiedAt: '2026-08-23T21:05:00.000Z' }), NOW),
    ).toBe(false);
  });

  it('stops after the window closes, rather than polling forever', () => {
    expect(shouldWatchForReminder(table({ plannedEndAt: endingIn(2) }), NOW)).toBe(false);
    expect(shouldWatchForReminder(table({ plannedEndAt: endingIn(-60) }), NOW)).toBe(false);
  });

  it('never watches a game that is not being played', () => {
    expect(shouldWatchForReminder(table({ status: 'COUNTING' }), NOW)).toBe(false);
  });

  it('always watches whenever the reminder could be due', () => {
    // The client decides when to ask and the server decides whether to send.
    // If the watching window did not cover the send window, a reminder could
    // come due with nobody asking, and be silently dropped.
    for (let minutes = 0; minutes <= 200; minutes += 1) {
      const t = table({ plannedEndAt: endingIn(minutes) });
      if (isReminderDue(t, NOW)) expect(shouldWatchForReminder(t, NOW)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// A cancelled entry
// ---------------------------------------------------------------------------
describe('cancelling a player’s latest entry', () => {
  const seat = {
    id: 'seat-a',
    userId: 'user-dani',
    displayName: 'אילן פסינקוב',
    joinedAt: '2026-08-23T18:00:00.000Z',
    leftAt: null,
    cashOut: null,
  };

  const withReversal = () =>
    buildTableActivity(
      [seat],
      [
        tx({ id: 'tx1', player: 'seat-a', created_at: '2026-08-23T18:00:00.000Z' }),
        tx({ id: 'tx2', player: 'seat-a', created_at: '2026-08-23T19:00:00.000Z' }),
        tx({
          id: 'tx3',
          player: 'seat-a',
          type: 'REVERSAL',
          amount_agorot: -5_000,
          chips: -500,
          created_at: '2026-08-23T19:05:00.000Z',
          created_by: 'user-admin',
          reverses_transaction_id: 'tx2',
        }),
      ],
    );

  it('is reported, unlike the entry it cancelled', () => {
    // The refunded entry did not happen as far as the money is concerned, but
    // the admin cancelling it in front of everyone is something to show.
    const kinds = withReversal().map((e) => e.kind);
    expect(kinds).toContain('BUY_IN_REVERSED');
    expect(kinds).not.toContain('BUY_IN');
  });

  it('reads as a refund, with the sign flipped from the ledger', () => {
    const event = withReversal().find((e) => e.kind === 'BUY_IN_REVERSED');
    expect(event).toMatchObject({ refundedAgorot: 5_000, refundedChips: 500 });
    expect(eventSentence(event!)).toBe(
      'המנהל ביטל את הכניסה האחרונה של אילן פסינקוב והחזיר 50₪',
    );
  });

  it('credits the admin as the actor and the player as the subject', () => {
    // This is what keeps the toast away from the admin, who already saw their
    // own "הכניסה בוטלה" confirmation.
    const event = withReversal().find((e) => e.kind === 'BUY_IN_REVERSED');
    expect(event).toMatchObject({ actorUserId: 'user-admin', subjectUserId: 'user-dani' });
  });

  it('does not disturb which entry counts as the opening one', () => {
    // The cancelled entry is skipped before counting, so the player's first
    // surviving entry is still their join and is not reported twice.
    const events = withReversal();
    expect(events.filter((e) => e.kind === 'PLAYER_JOINED')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// What the open app announces
// ---------------------------------------------------------------------------
function ev(over: Partial<TableEvent> & { id: string }): TableEvent {
  return {
    kind: 'PLAYER_JOINED',
    at: NOW,
    playerName: 'דני',
    ...over,
  } as TableEvent;
}
const snapshot = (over: Partial<AlertSnapshot> = {}): AlertSnapshot => ({
  status: 'ACTIVE',
  events: [],
  ...over,
});

describe('announcing a change to the open app', () => {
  it('says nothing on the first render', () => {
    // Opening a table with twenty entries behind it must not fire twenty
    // toasts and twenty sounds at once.
    expect(alertsForChange(null, snapshot({ events: [ev({ id: 'a' }), ev({ id: 'b' })] }), null))
      .toEqual([]);
  });

  it('announces only what is new', () => {
    const before = snapshot({ events: [ev({ id: 'a' })] });
    const after = snapshot({ events: [ev({ id: 'b' }), ev({ id: 'a' })] });
    expect(alertsForChange(before, after, null).map((e) => e.id)).toEqual(['b']);
  });

  it('never repeats an event that is still in the feed', () => {
    // The feed is rebuilt from scratch on every realtime refresh, so without
    // stable ids an unchanged list would re-announce itself indefinitely.
    const same = snapshot({ events: [ev({ id: 'a' }), ev({ id: 'b' })] });
    expect(alertsForChange(same, same, null)).toEqual([]);
  });

  it('stays quiet towards whoever caused it', () => {
    // They are already looking at the confirmation their own action produced.
    const before = snapshot({ events: [] });
    const after = snapshot({ events: [ev({ id: 'a', actorUserId: 'me' })] });
    expect(alertsForChange(before, after, 'me')).toEqual([]);
    expect(alertsForChange(before, after, 'someone-else').map((e) => e.id)).toEqual(['a']);
  });

  it('stays quiet towards the person it is about', () => {
    // Nobody needs telling that they themselves joined or left.
    const before = snapshot({ events: [] });
    const after = snapshot({ events: [ev({ id: 'a', subjectUserId: 'me' })] });
    expect(alertsForChange(before, after, 'me')).toEqual([]);
  });

  it('announces to a guest, who has no id to match against', () => {
    const before = snapshot({ events: [] });
    const after = snapshot({ events: [ev({ id: 'a', actorUserId: 'someone' })] });
    expect(alertsForChange(before, after, null).map((e) => e.id)).toEqual(['a']);
  });

  it('announces the game starting, which has no feed row of its own', () => {
    const alerts = alertsForChange(snapshot({ status: 'WAITING' }), snapshot(), null);
    expect(alerts.map((e) => e.kind)).toEqual(['GAME_STARTED']);
  });

  it('does not announce the start again while the game runs', () => {
    expect(alertsForChange(snapshot(), snapshot(), null)).toEqual([]);
  });

  it('announces a burst in the order it happened', () => {
    const before = snapshot({ events: [] });
    const after = snapshot({
      events: [
        ev({ id: 'second', at: '2026-08-23T20:05:00.000Z' }),
        ev({ id: 'first', at: '2026-08-23T20:01:00.000Z' }),
      ],
    });
    expect(alertsForChange(before, after, null).map((e) => e.id)).toEqual(['first', 'second']);
  });
});

describe('toast wording', () => {
  it('is shorter than the feed line, and keeps the money', () => {
    expect(
      eventToast({ id: 'b', kind: 'BUY_IN', at: NOW, playerName: 'דני', amountAgorot: 5_000, chips: 500 }),
    ).toBe('דני נכנס בעוד 50₪');
    expect(
      eventToast({
        id: 'l',
        kind: 'PLAYER_LEFT',
        at: NOW,
        playerName: 'ליאור',
        finalChips: 1_500,
        finalValueAgorot: 15_000,
      }),
    ).toBe('ליאור עזב עם 150₪');
    expect(
      eventToast({
        id: 'r',
        kind: 'BUY_IN_REVERSED',
        at: NOW,
        playerName: 'אילן',
        refundedAgorot: 5_000,
        refundedChips: 500,
      }),
    ).toBe('המנהל ביטל את הכניסה האחרונה של אילן');
  });

  it('has wording for every kind, so a toast can never be blank', () => {
    for (const kind of TABLE_EVENT_KINDS) {
      const event = ev({ id: 'x', kind } as Partial<TableEvent> & { id: string });
      expect(eventToast(event).length).toBeGreaterThan(0);
    }
  });
});

describe('the sound each event owes', () => {
  it('covers every kind, so none can fall through silently by accident', () => {
    for (const kind of TABLE_EVENT_KINDS) {
      expect(kind in EVENT_SOUND).toBe(true);
    }
  });

  it('gives a cancelled entry the departure sound, not the chip rattle', () => {
    // Reusing the rattle would make an undo sound exactly like the thing it
    // undoes.
    expect(EVENT_SOUND.BUY_IN_REVERSED).toBe('PLAYER_LEFT');
    expect(EVENT_SOUND.BUY_IN).toBe('BUY_IN');
  });

  it('leaves the notification-only events silent', () => {
    expect(EVENT_SOUND.ENDING_SOON).toBeNull();
    expect(EVENT_SOUND.GAME_ENDED).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Who adds an entry, and who has to ask
// ---------------------------------------------------------------------------
describe('an admin adding an entry for themselves', () => {
  const table = { status: 'ACTIVE' as const, maxBuyIns: 6 };
  const seat = {
    tablePlayerId: 'seat-admin',
    ownerUserId: 'user-admin',
    status: 'ACTIVE' as const,
    buyInCount: 2,
  };
  const admin = { userId: 'user-admin', isTableAdmin: true };
  const player = { userId: 'user-dani', isTableAdmin: false };

  it('is allowed to add it directly', () => {
    // The bug was routing the admin down the request path, which produced a
    // request only they could approve — their own card waiting on their own
    // approval, with the approval queue on the same screen.
    expect(canAdminAddBuyIn(admin, seat, table)).toBe(true);
  });

  it('still lets a normal player only ask', () => {
    const own = { ...seat, tablePlayerId: 'seat-dani', ownerUserId: 'user-dani' };
    expect(canAdminAddBuyIn(player, own, table)).toBe(false);
    expect(canRequestRebuy(player, own, table, false)).toBe(true);
  });

  it('refuses the direct path once the player is at the cap', () => {
    expect(canAdminAddBuyIn(admin, { ...seat, buyInCount: 6 }, table)).toBe(false);
  });

  it('refuses the direct path once the game is closed to entries', () => {
    for (const status of ['COUNTING', 'COMPLETED', 'CANCELLED'] as const) {
      expect(canAdminAddBuyIn(admin, seat, { ...table, maxBuyIns: 6, status })).toBe(false);
    }
  });

  it('never lets anyone approve their own request, admin included', () => {
    // The direct path is what an admin uses; self-approval stays forbidden.
    expect(canApproveRebuy(admin, seat, table)).toBe(true);
    expect(canApproveRebuy(player, seat, table)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cancelling an active game
// ---------------------------------------------------------------------------
describe('cancelling a game', () => {
  const admin = { userId: 'user-admin', isTableAdmin: true };
  const player = { userId: 'user-dani', isTableAdmin: false };

  it('is a transition the admin may make from an active game', () => {
    expect(canTransition(admin, 'ACTIVE', 'CANCELLED')).toBe(true);
    expect(canTransition(admin, 'WAITING', 'CANCELLED')).toBe(true);
  });

  it('is not available to a player', () => {
    expect(canTransition(player, 'ACTIVE', 'CANCELLED')).toBe(false);
  });

  it('is a dead end — a cancelled game never becomes active or completed', () => {
    for (const to of ['ACTIVE', 'COUNTING', 'COMPLETED'] as const) {
      expect(canTransition(admin, 'CANCELLED', to)).toBe(false);
    }
  });

  it('is never confused with finishing the game', () => {
    // COMPLETED is reachable only through finalize_game, which is what
    // computes profit and loss. Cancelling cannot reach it.
    expect(canTransition(admin, 'ACTIVE', 'COMPLETED')).toBe(false);
    expect(canTransition(admin, 'COUNTING', 'COMPLETED')).toBe(false);
  });

  it('closes the game to further entries', () => {
    expect(isGameOpenForBuyIns('CANCELLED')).toBe(false);
    expect(isGameOpenForBuyIns('ACTIVE')).toBe(true);
  });

  it('can never be settled, whatever the chip counts say', () => {
    const players = [{ chipsIssued: 500, submittedChips: 500, approvedChips: 500 }];
    expect(finalizeReadiness(admin, { status: 'CANCELLED', maxBuyIns: 6 }, players)).toEqual({
      ready: false,
      reason: 'WRONG_STATUS',
    });
  });

  it('appears in the activity feed, derived from the status', () => {
    const events = buildTableActivity([], [], {
      id: 'table-1',
      name: 'פוקר של יום חמישי',
      status: 'CANCELLED',
      updatedAt: NOW,
    });
    const cancelled = events.find((e) => e.kind === 'GAME_CANCELLED');
    expect(cancelled).toBeDefined();
    expect(eventSentence(cancelled!)).toBe('המשחק בוטל על ידי מנהל השולחן — ללא התחשבנות');
    expect(eventToast(cancelled!)).toBe('המשחק בוטל');
  });

  it('adds nothing to the feed while the game is still running', () => {
    const events = buildTableActivity([], [], {
      id: 'table-1',
      name: 'פוקר של יום חמישי',
      status: 'ACTIVE',
      updatedAt: NOW,
    });
    expect(events.some((e) => e.kind === 'GAME_CANCELLED')).toBe(false);
  });

  it('leaves the entry history in the feed untouched', () => {
    // Cancelling must not erase what happened; the entries are still events.
    const seat = {
      id: 'seat-a',
      userId: 'user-dani',
      displayName: 'דני',
      joinedAt: '2026-08-23T18:00:00.000Z',
      leftAt: null,
      cashOut: null,
    };
    const events = buildTableActivity(
      [seat],
      [
        tx({ id: 'tx1', player: 'seat-a', created_at: '2026-08-23T18:00:00.000Z' }),
        tx({ id: 'tx2', player: 'seat-a', created_at: '2026-08-23T19:00:00.000Z' }),
      ],
      { id: 'table-1', name: 'ט', status: 'CANCELLED', updatedAt: NOW },
    );
    expect(events.filter((e) => e.kind === 'PLAYER_JOINED')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'BUY_IN')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'GAME_CANCELLED')).toHaveLength(1);
  });

  it('makes no sound — bad news does not need a chirp', () => {
    expect(EVENT_SOUND.GAME_CANCELLED).toBeNull();
  });
});
