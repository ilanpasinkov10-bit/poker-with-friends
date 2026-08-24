import { describe, expect, it } from 'vitest';
import { hasLeftTable, isStillSeated, normaliseLeftAt } from '@/lib/domain/participation';

/**
 * Regression cover for the production bug where every seated player appeared
 * under "עזבו את השולחן".
 *
 * The cause was `leftAt !== null` applied to a value that was `undefined`,
 * because the column was missing from the response. These tests pin the
 * fail-safe direction: anything that is not a real timestamp means seated.
 */

const LEFT_AT = '2026-08-25T20:14:00.000Z';

describe('who is still at the table', () => {
  it('treats a real timestamp as having left', () => {
    expect(hasLeftTable(LEFT_AT)).toBe(true);
    expect(isStillSeated(LEFT_AT)).toBe(false);
    expect(normaliseLeftAt(LEFT_AT)).toBe(LEFT_AT);
  });

  it('treats null as still seated', () => {
    expect(hasLeftTable(null)).toBe(false);
    expect(isStillSeated(null)).toBe(true);
  });

  it('treats a MISSING column as still seated — the production bug', () => {
    // `undefined` is what arrives when the migration has not been applied or
    // PostgREST's schema cache is stale. `undefined !== null` is true, which
    // previously marked everyone as having left.
    expect(hasLeftTable(undefined)).toBe(false);
    expect(isStillSeated(undefined)).toBe(true);
    expect(normaliseLeftAt(undefined)).toBeNull();
  });

  it('never infers leaving from anything that is not a timestamp', () => {
    for (const value of ['', '   ', 'not-a-date', 0, 1, true, false, {}, [], NaN]) {
      expect(hasLeftTable(value)).toBe(false);
    }
  });

  it('fails toward seated for every non-timestamp input', () => {
    // The direction matters: a wrong "seated" is a cosmetic delay, a wrong
    // "left" removes a playing participant from the table.
    const inputs = [undefined, null, '', 'garbage', 42, {}, []];
    expect(inputs.every((v) => isStillSeated(v))).toBe(true);
  });
});

describe('grouping a roster', () => {
  interface Seat { name: string; status: string; leftAt: unknown }

  const group = (seats: Seat[]) => {
    const participants = seats.filter((s) => s.status === 'ACTIVE');
    return {
      active: participants.filter((s) => isStillSeated(s.leftAt)).map((s) => s.name),
      left: participants.filter((s) => hasLeftTable(s.leftAt)).map((s) => s.name),
    };
  };

  it('keeps pre-feature rows active', () => {
    // Rows created before 0009 added the column carry null.
    const result = group([
      { name: 'אילן', status: 'ACTIVE', leftAt: null },
      { name: 'שי', status: 'ACTIVE', leftAt: null },
    ]);
    expect(result.active).toEqual(['אילן', 'שי']);
    expect(result.left).toEqual([]);
  });

  it('keeps everyone active when the column is absent entirely', () => {
    const result = group([
      { name: 'אילן', status: 'ACTIVE', leftAt: undefined },
      { name: 'אורח', status: 'ACTIVE', leftAt: undefined },
    ]);
    expect(result.active).toEqual(['אילן', 'אורח']);
    expect(result.left).toEqual([]);
  });

  it('moves only a genuine leaver across', () => {
    const result = group([
      { name: 'אילן', status: 'ACTIVE', leftAt: null },
      { name: 'אורח', status: 'ACTIVE', leftAt: LEFT_AT },
      { name: 'מיכל', status: 'ACTIVE', leftAt: null },
    ]);
    expect(result.active).toEqual(['אילן', 'מיכל']);
    expect(result.left).toEqual(['אורח']);
  });

  it('never places the same player in both lists', () => {
    const seats: Seat[] = [
      { name: 'א', status: 'ACTIVE', leftAt: null },
      { name: 'ב', status: 'ACTIVE', leftAt: LEFT_AT },
      { name: 'ג', status: 'ACTIVE', leftAt: undefined },
      { name: 'ד', status: 'PENDING', leftAt: null },
    ];
    const { active, left } = group(seats);
    expect(active.filter((n) => left.includes(n))).toEqual([]);
    // Three ACTIVE seats, split with none lost and none duplicated.
    expect(active.length + left.length).toBe(3);
    expect(active).toEqual(['א', 'ג']);
    expect(left).toEqual(['ב']);
  });
});
