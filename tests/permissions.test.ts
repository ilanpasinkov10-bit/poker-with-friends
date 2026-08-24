import { describe, expect, it } from 'vitest';
import {
  canAdminAddBuyIn,
  canDeleteTable,
  canApproveRebuy,
  canRequestRebuy,
  canTransition,
  finalizeReadiness,
  type ActorContext,
  type PlayerContext,
  type TableContext,
} from '@/lib/domain/permissions';

const admin: ActorContext = { userId: 'admin-user', isTableAdmin: true };
const player: ActorContext = { userId: 'player-user', isTableAdmin: false };

const activeTable: TableContext = { status: 'ACTIVE', maxBuyIns: 6 };

const seat = (overrides: Partial<PlayerContext> = {}): PlayerContext => ({
  tablePlayerId: 'seat-1',
  ownerUserId: 'player-user',
  status: 'ACTIVE',
  buyInCount: 2,
  ...overrides,
});

describe('rebuy requests', () => {
  it('lets a player request another entry for themselves', () => {
    expect(canRequestRebuy(player, seat(), activeTable, false)).toBe(true);
  });

  it('never lets a player request on someone else behalf', () => {
    expect(canRequestRebuy(player, seat({ ownerUserId: 'someone-else' }), activeTable, false)).toBe(
      false,
    );
    expect(canRequestRebuy(admin, seat(), activeTable, false)).toBe(false);
  });

  it('blocks a second request while one is already pending', () => {
    expect(canRequestRebuy(player, seat(), activeTable, true)).toBe(false);
  });

  it('enforces the maximum number of entries', () => {
    expect(canRequestRebuy(player, seat({ buyInCount: 5 }), activeTable, false)).toBe(true);
    expect(canRequestRebuy(player, seat({ buyInCount: 6 }), activeTable, false)).toBe(false);
  });

  it('blocks requests once counting has started', () => {
    expect(canRequestRebuy(player, seat(), { status: 'COUNTING', maxBuyIns: 6 }, false)).toBe(false);
    expect(canRequestRebuy(player, seat(), { status: 'COMPLETED', maxBuyIns: 6 }, false)).toBe(false);
  });

  it('blocks a pending (unapproved) player', () => {
    expect(canRequestRebuy(player, seat({ status: 'PENDING' }), activeTable, false)).toBe(false);
  });
});

describe('rebuy approval', () => {
  it('only the table admin may approve', () => {
    expect(canApproveRebuy(admin, seat(), activeTable)).toBe(true);
    expect(canApproveRebuy(player, seat(), activeTable)).toBe(false);
  });

  it('still refuses to push a player past the maximum', () => {
    expect(canApproveRebuy(admin, seat({ buyInCount: 6 }), activeTable)).toBe(false);
  });

  it('refuses once the game is locked', () => {
    expect(canApproveRebuy(admin, seat(), { status: 'COUNTING', maxBuyIns: 6 })).toBe(false);
  });
});

describe('manual admin buy-ins', () => {
  it('is admin-only and respects the cap', () => {
    expect(canAdminAddBuyIn(admin, seat(), activeTable)).toBe(true);
    expect(canAdminAddBuyIn(player, seat(), activeTable)).toBe(false);
    expect(canAdminAddBuyIn(admin, seat({ buyInCount: 6 }), activeTable)).toBe(false);
    expect(canAdminAddBuyIn(admin, seat({ status: 'REMOVED' }), activeTable)).toBe(false);
  });
});

describe('game state transitions', () => {
  it('follows the documented state machine', () => {
    expect(canTransition(admin, 'WAITING', 'ACTIVE')).toBe(true);
    expect(canTransition(admin, 'ACTIVE', 'COUNTING')).toBe(true);
    expect(canTransition(admin, 'COUNTING', 'ACTIVE')).toBe(true);
    expect(canTransition(admin, 'WAITING', 'COUNTING')).toBe(false);
    expect(canTransition(admin, 'COMPLETED', 'ACTIVE')).toBe(false);
  });

  it('never reaches COMPLETED through a plain status change', () => {
    for (const from of ['WAITING', 'ACTIVE', 'COUNTING'] as const) {
      expect(canTransition(admin, from, 'COMPLETED')).toBe(false);
    }
  });

  it('is refused for non-admins', () => {
    expect(canTransition(player, 'ACTIVE', 'COUNTING')).toBe(false);
  });
});

describe('finalisation readiness', () => {
  const counting: TableContext = { status: 'COUNTING', maxBuyIns: 6 };

  it('is ready when every count is approved and chips balance', () => {
    const result = finalizeReadiness(admin, counting, [
      { chipsIssued: 1000, submittedChips: 1500, approvedChips: 1500 },
      { chipsIssued: 1000, submittedChips: 500, approvedChips: 500 },
    ]);
    expect(result).toEqual({ ready: true, reason: null });
  });

  it('blocks while a player has not counted', () => {
    expect(
      finalizeReadiness(admin, counting, [
        { chipsIssued: 1000, submittedChips: null, approvedChips: null },
        { chipsIssued: 1000, submittedChips: 2000, approvedChips: 2000 },
      ]).reason,
    ).toBe('MISSING_COUNTS');
  });

  it('blocks while a submitted count still needs approval', () => {
    expect(
      finalizeReadiness(admin, counting, [
        { chipsIssued: 1000, submittedChips: 1500, approvedChips: null },
        { chipsIssued: 1000, submittedChips: 500, approvedChips: 500 },
      ]).reason,
    ).toBe('AWAITING_APPROVAL');
  });

  it('blocks on a chip discrepancy', () => {
    expect(
      finalizeReadiness(admin, counting, [
        { chipsIssued: 10_000, submittedChips: 9900, approvedChips: 9900 },
      ]).reason,
    ).toBe('CHIP_MISMATCH');
  });

  it('blocks outside the COUNTING stage and for non-admins', () => {
    expect(finalizeReadiness(admin, { status: 'ACTIVE', maxBuyIns: 6 }, []).reason).toBe(
      'WRONG_STATUS',
    );
    expect(finalizeReadiness(player, counting, []).reason).toBe('NOT_ADMIN');
  });
});

describe('deleting a table', () => {
  const waiting = { status: 'WAITING' as const, startedAt: null };

  it('is allowed for the owner before the game begins', () => {
    expect(canDeleteTable(admin, waiting)).toBe(true);
  });

  it('is refused for anyone who is not the table admin', () => {
    expect(canDeleteTable(player, waiting)).toBe(false);
  });

  it('is refused once the game has started', () => {
    expect(canDeleteTable(admin, { status: 'ACTIVE', startedAt: '2026-08-24T18:00:00Z' })).toBe(false);
    expect(canDeleteTable(admin, { status: 'COUNTING', startedAt: '2026-08-24T18:00:00Z' })).toBe(false);
    expect(canDeleteTable(admin, { status: 'COMPLETED', startedAt: '2026-08-24T18:00:00Z' })).toBe(false);
  });

  it('is refused for a table that is WAITING but was previously started', () => {
    expect(canDeleteTable(admin, { status: 'WAITING', startedAt: '2026-08-24T18:00:00Z' })).toBe(false);
  });

  it('is refused whenever results already exist', () => {
    expect(canDeleteTable(admin, { ...waiting, hasResults: true })).toBe(false);
  });
});
