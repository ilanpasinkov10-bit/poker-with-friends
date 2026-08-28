import { describe, expect, it } from 'vitest';
import {
  buildShareCard,
  formatGameLength,
  gameLengthMs,
  medalFor,
} from '@/lib/domain/share-card';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import type { GameResultRow, PokerTableRow } from '@/types/database';

const TABLE: Pick<PokerTableRow, 'game_date' | 'started_at' | 'completed_at' | 'created_at'> = {
  game_date: '2026-08-28',
  started_at: '2026-08-28T18:04:00.000Z',
  completed_at: '2026-08-28T22:36:00.000Z',   // 4:32
  created_at: '2026-08-28T15:00:00.000Z',
};

let seq = 0;
const result = (over: Partial<GameResultRow> = {}): GameResultRow => {
  seq += 1;
  return {
    id: `r${seq}`,
    table_id: 't1',
    table_player_id: `p${seq}`,
    user_id: `u${seq}`,
    display_name: `שחקן ${seq}`,
    buy_in_count: 1,
    total_paid_agorot: 10_000,
    chips_issued: 500,
    final_chips: 500,
    final_value_agorot: 10_000,
    profit_loss_agorot: 0,
    revision: 1,
    created_at: '2026-08-28T22:36:00.000Z',
    updated_at: '2026-08-28T22:36:00.000Z',
    ...over,
  };
};

const NIGHT = [
  result({ display_name: 'אילן', profit_loss_agorot: 54_000, buy_in_count: 2, total_paid_agorot: 10_000 }),
  result({ display_name: 'ליאור', profit_loss_agorot: 22_000, buy_in_count: 1, total_paid_agorot: 5_000 }),
  result({ display_name: 'שי', profit_loss_agorot: 9_000, buy_in_count: 2, total_paid_agorot: 10_000 }),
  result({ display_name: 'Andy', profit_loss_agorot: -15_000, buy_in_count: 3, total_paid_agorot: 15_000 }),
  result({ display_name: 'דניאל', profit_loss_agorot: -30_000, buy_in_count: 5, total_paid_agorot: 25_000 }),
  result({ display_name: 'Tom', profit_loss_agorot: -40_000, buy_in_count: 4, total_paid_agorot: 20_000 }),
];

describe('a night worth sharing', () => {
  const card = buildShareCard(TABLE, NIGHT)!;

  it('ranks everybody by what they actually finished with', () => {
    expect(card.rows.map((r) => r.name)).toEqual(['אילן', 'ליאור', 'שי', 'Andy', 'דניאל', 'Tom']);
    expect(card.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('counts the pot as the money that went in, not the money that came out', () => {
    // The same sum the results screen prints under the table.
    expect(card.potAgorot).toBe(85_000);
    expect(card.playerCount).toBe(6);
    expect(card.totalBuyIns).toBe(17);
  });

  it('names the winner and the rebuy king', () => {
    expect(card.winner).toEqual({ name: 'אילן', netAgorot: 54_000 });
    expect(card.rebuyKing).toEqual({ name: 'דניאל', count: 5 });
  });

  it('measures the game from when it started to when it was finalised', () => {
    expect(formatGameLength(card.durationMs)).toBe('4:32 שעות');
  });

  it('remembers the night it was played', () => {
    expect(card.playedOn).toBe('2026-08-28');
  });
});

describe('who gets the awards', () => {
  it('gives nobody the trophy when nobody finished ahead', () => {
    // Everyone down: a card that crowned the least-unlucky player would be
    // saying something untrue.
    const card = buildShareCard(TABLE, [
      result({ display_name: 'א', profit_loss_agorot: -1_000 }),
      result({ display_name: 'ב', profit_loss_agorot: -5_000 }),
    ])!;
    expect(card.winner).toBeNull();
  });

  it('gives nobody the rebuy crown when nobody re-entered', () => {
    const card = buildShareCard(TABLE, [
      result({ display_name: 'א', profit_loss_agorot: 500, buy_in_count: 1 }),
      result({ display_name: 'ב', profit_loss_agorot: -500, buy_in_count: 1 }),
    ])!;
    expect(card.rebuyKing).toBeNull();
  });

  it('breaks a tie on profit by who spent less getting there', () => {
    const card = buildShareCard(TABLE, [
      result({ display_name: 'יקר', profit_loss_agorot: 20_000, total_paid_agorot: 20_000 }),
      result({ display_name: 'זול', profit_loss_agorot: 20_000, total_paid_agorot: 5_000 }),
    ])!;
    expect(card.rows.map((r) => r.name)).toEqual(['זול', 'יקר']);
    expect(card.winner?.name).toBe('זול');
  });

  it('breaks a complete tie by name, so the card is the same every time', () => {
    const twice = () =>
      buildShareCard(TABLE, [
        result({ display_name: 'בני', profit_loss_agorot: 5_000, total_paid_agorot: 5_000 }),
        result({ display_name: 'אורי', profit_loss_agorot: 5_000, total_paid_agorot: 5_000 }),
      ])!.rows.map((r) => r.name);
    expect(twice()).toEqual(['אורי', 'בני']);
    expect(twice()).toEqual(twice());
  });

  it('breaks a tie on entries by who put more money in', () => {
    const card = buildShareCard(TABLE, [
      result({ display_name: 'קטן', buy_in_count: 4, total_paid_agorot: 8_000, profit_loss_agorot: 1 }),
      result({ display_name: 'גדול', buy_in_count: 4, total_paid_agorot: 20_000, profit_loss_agorot: -1 }),
    ])!;
    expect(card.rebuyKing).toEqual({ name: 'גדול', count: 4 });
  });
});

describe('the shapes a game can come in', () => {
  it('handles two players', () => {
    const card = buildShareCard(TABLE, [
      result({ display_name: 'א', profit_loss_agorot: 10_000 }),
      result({ display_name: 'ב', profit_loss_agorot: -10_000 }),
    ])!;
    expect(card.rows).toHaveLength(2);
    expect(card.rows[0]!.rank).toBe(1);
  });

  it('handles a full table', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      result({ display_name: `שחקן ${i}`, profit_loss_agorot: (6 - i) * 1_000 }),
    );
    const card = buildShareCard(TABLE, many)!;
    expect(card.rows).toHaveLength(12);
    expect(card.rows.map((r) => r.rank)).toEqual([...Array(12)].map((_, i) => i + 1));
  });

  it('places a player who finished exactly level', () => {
    const card = buildShareCard(TABLE, [
      result({ display_name: 'ברווח', profit_loss_agorot: 5_000 }),
      result({ display_name: 'מאוזן', profit_loss_agorot: 0 }),
      result({ display_name: 'בהפסד', profit_loss_agorot: -5_000 }),
    ])!;
    expect(card.rows[1]!.netAgorot).toBe(0);
    expect(formatSignedMoney(0)).toBe('0₪');
  });

  it('keeps a guest exactly as the game recorded them', () => {
    // A guest has no account: user_id is null and the name is whatever they
    // typed. The card shows that, and nothing else about them.
    const card = buildShareCard(TABLE, [
      result({ display_name: 'אורח', user_id: null, profit_loss_agorot: 3_000 }),
      result({ display_name: 'רשום', profit_loss_agorot: -3_000 }),
    ])!;
    expect(card.rows[0]!.name).toBe('אורח');
    expect(Object.keys(card.rows[0]!)).toEqual(['name', 'rank', 'netAgorot', 'buyInCount', 'paidAgorot']);
  });

  it('has nothing to say about a game with no results', () => {
    expect(buildShareCard(TABLE, [])).toBeNull();
  });
});

describe('the card carries nothing private', () => {
  it('exposes no identifier of any kind', () => {
    const card = buildShareCard(TABLE, NIGHT)!;
    const text = JSON.stringify(card);
    for (const secret of ['u1', 'p1', 'r1', 't1', '@', 'user_id', 'table_player_id']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('how long the game ran', () => {
  it('is read from the real timestamps', () => {
    expect(gameLengthMs({ started_at: '2026-08-28T18:00:00Z', completed_at: '2026-08-28T18:48:00Z' }))
      .toBe(48 * 60_000);
  });

  it('is said the way a person would say it', () => {
    const at = (min: number) => formatGameLength(min * 60_000);
    expect(at(48)).toBe('48 דקות');
    expect(at(135)).toBe('2:15 שעות');
    expect(at(272)).toBe('4:32 שעות');
    expect(at(60)).toBe('1:00 שעות');
    expect(at(1)).toBe('דקה אחת');
    expect(formatGameLength(20_000)).toBe('פחות מדקה');
  });

  it('says nothing rather than guessing', () => {
    expect(gameLengthMs({ started_at: null, completed_at: '2026-08-28T20:00:00Z' })).toBeNull();
    expect(gameLengthMs({ started_at: '2026-08-28T20:00:00Z', completed_at: null })).toBeNull();
    // A completion recorded before the start is broken data, not a negative game.
    expect(gameLengthMs({ started_at: '2026-08-28T22:00:00Z', completed_at: '2026-08-28T20:00:00Z' }))
      .toBeNull();
    expect(formatGameLength(null)).toBeNull();
  });
});

describe('money on the card reads the way it does everywhere else', () => {
  it('signs a win and a loss the same way the results screen does', () => {
    expect(formatSignedMoney(54_000)).toBe('+540₪');
    expect(formatSignedMoney(-30_000)).toBe('-300₪');
    expect(formatMoney(185_000)).toBe('1,850₪');
  });
});

describe('the podium', () => {
  it('marks the first three and nobody else', () => {
    expect([1, 2, 3, 4, 12].map(medalFor)).toEqual(['🥇', '🥈', '🥉', null, null]);
  });
});
