import { describe, expect, it } from 'vitest';
import { buildTableActivity, type ActivityLedgerRow } from '@/lib/domain/activity';
import { eventSentence, notificationCopy, sortEvents } from '@/lib/domain/events';
import { isScannable, joinPath, joinUrl } from '@/lib/domain/join-link';
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
