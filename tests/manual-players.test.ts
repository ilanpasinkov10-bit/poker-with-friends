import { describe, expect, it } from 'vitest';
import {
  canAdminAddBuyIn,
  canRequestRebuy,
  isGameOpenForBuyIns,
} from '@/lib/domain/permissions';
import { computePotTotals } from '@/lib/domain/participation';
import { computeFinalResults } from '@/lib/domain/chips';
import { computeSettlement } from '@/lib/domain/settlement';
import type { PlayerStatus, TableStatus } from '@/types/database';

/**
 * A player the admin added by name behaves like every other participant in the
 * arithmetic, and like nobody at all in the account system. The database
 * enforces the second half; these pin the first — that nothing in the pure
 * layer treats "has no account" as "is not really playing".
 */

const ADMIN = 'a0000000-0000-4000-8000-000000000001';

const table = (status: TableStatus = 'ACTIVE') => ({ status, maxBuyIns: 6 });
const manual = (over: Partial<{ status: PlayerStatus; buyInCount: number }> = {}) => ({
  tablePlayerId: 'seat-manual',
  // The defining property: nobody owns this seat.
  ownerUserId: null,
  status: (over.status ?? 'ACTIVE') as PlayerStatus,
  buyInCount: over.buyInCount ?? 1,
});

describe('what an admin may do for a manual player', () => {
  it('may add an entry, exactly as for anybody else', () => {
    expect(canAdminAddBuyIn({ userId: ADMIN, isTableAdmin: true }, manual(), table())).toBe(true);
  });

  it('may not once the game is being counted', () => {
    expect(
      canAdminAddBuyIn({ userId: ADMIN, isTableAdmin: true }, manual(), table('COUNTING')),
    ).toBe(false);
    expect(isGameOpenForBuyIns('COUNTING')).toBe(false);
  });

  it('may not exceed the table maximum for them either', () => {
    expect(
      canAdminAddBuyIn({ userId: ADMIN, isTableAdmin: true }, manual({ buyInCount: 6 }), table()),
    ).toBe(false);
  });

  it('is still refused for somebody who is not the admin', () => {
    expect(canAdminAddBuyIn({ userId: ADMIN, isTableAdmin: false }, manual(), table())).toBe(false);
  });
});

describe('nobody can act as a manual player', () => {
  it('a real user cannot request a rebuy on their behalf', () => {
    expect(
      canRequestRebuy({ userId: ADMIN, isTableAdmin: true }, manual(), table(), false),
    ).toBe(false);
  });

  it('and neither can a viewer with no id of their own', () => {
    // Two nulls must not be read as the same person. The seat belongs to no
    // account; a session with no account is not that seat's owner either.
    expect(
      canRequestRebuy({ userId: null as unknown as string, isTableAdmin: false }, manual(), table(), false),
    ).toBe(false);
  });
});

describe('a manual player counts in the money', () => {
  const seats = [
    { id: 'seat-admin', buyInCount: 2, totalPaidAgorot: 10_000, chipsIssued: 1000, finalChips: 400 },
    { id: 'seat-manual', buyInCount: 2, totalPaidAgorot: 10_000, chipsIssued: 1000, finalChips: 1600 },
  ];
  const economics = { buyInAgorot: 5_000, chipsPerBuyIn: 500 };

  it('their entries are in the pot', () => {
    const totals = computePotTotals(
      seats.map((s) => ({
        totalPaidAgorot: s.totalPaidAgorot,
        chipsIssued: s.chipsIssued,
        cashOut: null,
      })),
    );
    expect(totals.potAgorot).toBe(20_000);
  });

  it('their result is computed from the same chips and the same pot', () => {
    const rows = computeFinalResults(seats, economics);
    const manualRow = rows.find((r) => r.id === 'seat-manual');
    expect(manualRow?.profitLossAgorot).toBe(6_000);
    expect(rows.reduce((sum, r) => sum + r.profitLossAgorot, 0)).toBe(0);
  });

  it('and they are part of who pays whom', () => {
    const rows = computeFinalResults(seats, economics);
    const transfers = computeSettlement(
      rows.map((r) => ({ id: r.id, amountAgorot: r.profitLossAgorot })),
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ from: 'seat-admin', to: 'seat-manual', amountAgorot: 6_000 });
  });
});
