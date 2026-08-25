import { describe, expect, it } from 'vitest';
import { buildTableActivity, type ActivityLedgerRow } from '@/lib/domain/activity';
import { eventSentence, notificationCopy, sortEvents } from '@/lib/domain/events';
import { isScannable, joinPath, joinUrl } from '@/lib/domain/join-link';
import {
  isReminderDue,
  shouldWatchForReminder,
  type ReminderState,
} from '@/lib/domain/ending-soon';
import { computePotTotals } from '@/lib/domain/participation';
import { soundsForChange, type TableSnapshot } from '@/lib/domain/table-diff';

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
    expect(eventSentence({ kind: 'PLAYER_JOINED', at: NOW, playerName: 'מאור' })).toBe(
      'מאור הצטרף לשולחן',
    );
  });

  it('announces a departure with the chips and what they are worth', () => {
    expect(
      eventSentence({
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
      { kind: 'PLAYER_JOINED', at: NOW, playerName: 'מאור' },
      'פוקר של יום חמישי',
    );
    expect(copy.title).toBe('פוקר של יום חמישי');
    expect(copy.body).toBe('מאור הצטרף לשולחן');
  });

  it('has a sentence for every kind, so none can ship empty', () => {
    const samples = [
      { kind: 'GAME_STARTED', at: NOW, tableName: 'ט' },
      { kind: 'ENDING_SOON', at: NOW, tableName: 'ט' },
      { kind: 'GAME_ENDED', at: NOW, tableName: 'ט' },
    ] as const;
    for (const event of samples) expect(eventSentence(event).length).toBeGreaterThan(0);
  });
});

const NOW = '2026-08-23T20:00:00.000Z';

describe('ordering the feed', () => {
  it('puts the newest first', () => {
    const ordered = sortEvents([
      { kind: 'PLAYER_JOINED', at: '2026-08-23T20:00:00.000Z', playerName: 'א' },
      { kind: 'PLAYER_JOINED', at: '2026-08-23T21:00:00.000Z', playerName: 'ב' },
    ]);
    expect(ordered.map((e) => 'playerName' in e && e.playerName)).toEqual(['ב', 'א']);
  });

  it('is stable when two events share a timestamp', () => {
    // A join and its opening entry commit together. A list that reshuffled on
    // every realtime refresh would read as broken.
    const events = [
      { kind: 'BUY_IN', at: NOW, playerName: 'א', amountAgorot: 5_000, chips: 500 },
      { kind: 'PLAYER_JOINED', at: NOW, playerName: 'א' },
    ] as const;
    expect(sortEvents(events)).toEqual(sortEvents([...events].reverse()));
  });

  it('caps the list', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
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
    reverses_transaction_id: over.reverses_transaction_id ?? null,
  };
}

describe('the recent-activity feed', () => {
  const seat = {
    id: 'seat-a',
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
// Which sound a change owes
// ---------------------------------------------------------------------------
function snap(over: Partial<TableSnapshot> = {}): TableSnapshot {
  return { status: 'ACTIVE', seatedIds: [], leftIds: [], buyInCount: 0, ...over };
}

describe('sounds for a change', () => {
  it('is silent when nothing changed', () => {
    const s = snap({ seatedIds: ['a', 'b'], buyInCount: 4 });
    expect(soundsForChange(s, s)).toEqual([]);
  });

  it('shuffles cards when the game starts', () => {
    expect(soundsForChange(snap({ status: 'WAITING' }), snap({ status: 'ACTIVE' }))).toEqual([
      'GAME_STARTED',
    ]);
  });

  it('does not shuffle again while the game stays active', () => {
    expect(soundsForChange(snap({ status: 'ACTIVE' }), snap({ status: 'ACTIVE' }))).toEqual([]);
  });

  it('seats a chair for a new player, without rattling chips', () => {
    // The new seat brings its opening entry with it; only entries beyond that
    // are additional entries.
    expect(
      soundsForChange(
        snap({ seatedIds: ['a'], buyInCount: 1 }),
        snap({ seatedIds: ['a', 'b'], buyInCount: 2 }),
      ),
    ).toEqual(['PLAYER_JOINED']);
  });

  it('rattles chips for a genuine additional entry', () => {
    expect(
      soundsForChange(
        snap({ seatedIds: ['a'], buyInCount: 1 }),
        snap({ seatedIds: ['a'], buyInCount: 2 }),
      ),
    ).toEqual(['BUY_IN']);
  });

  it('plays both when someone joins and someone else buys in', () => {
    expect(
      soundsForChange(
        snap({ seatedIds: ['a'], buyInCount: 1 }),
        snap({ seatedIds: ['a', 'b'], buyInCount: 3 }),
      ),
    ).toEqual(['PLAYER_JOINED', 'BUY_IN']);
  });

  it('says goodbye once when a player leaves', () => {
    // Leaving moves the id from seated to left. Counting the disappearance
    // from `seatedIds` as a departure too would sound it twice.
    expect(
      soundsForChange(
        snap({ seatedIds: ['a', 'b'], buyInCount: 2 }),
        snap({ seatedIds: ['a'], leftIds: ['b'], buyInCount: 2 }),
      ),
    ).toEqual(['PLAYER_LEFT']);
  });

  it('does not treat an already-departed player as leaving again', () => {
    const gone = snap({ seatedIds: ['a'], leftIds: ['b'], buyInCount: 2 });
    expect(soundsForChange(gone, gone)).toEqual([]);
  });

  it('never plays a departure for a player who was never seated', () => {
    // Opening a table where someone had already left must not fire a cue.
    expect(
      soundsForChange(snap({ seatedIds: ['a'] }), snap({ seatedIds: ['a'], leftIds: ['z'] })),
    ).toEqual([]);
  });

  it('ignores a buy-in count that goes down, as a reversal makes it', () => {
    expect(
      soundsForChange(
        snap({ seatedIds: ['a'], buyInCount: 3 }),
        snap({ seatedIds: ['a'], buyInCount: 2 }),
      ),
    ).toEqual([]);
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
