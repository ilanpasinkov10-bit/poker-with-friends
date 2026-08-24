import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isUuid } from '@/lib/domain/ids';

/**
 * Regression test for the production bug where creating a table redirected to
 * the Hebrew 404 screen.
 *
 * Covers the whole contract that broke: what the Supabase RPC returns → what
 * createTableAction hands back → what the client interpolates into the route →
 * whether /table/[id] would accept it.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

/** Whatever the RPC should return for the case under test. */
let rpcResult: unknown;
/** What selecting the row back yields — null models RLS hiding it. */
let readback: { id: string } | null;
let rpcCalls: string[];

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'a0000000-0000-4000-8000-000000000001', is_anonymous: false } },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: rpcResult, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: readback, error: null }) }),
      }),
    }),
  }),
}));

const { createTableAction } = await import('@/lib/actions/tables');

const VALID_ID = '424e10d2-a78a-45de-8358-8e54aeb068d4';

const TABLE_ROW = {
  id: VALID_ID,
  join_code: 'A7K92',
  owner_id: 'a0000000-0000-4000-8000-000000000001',
  name: 'פוקר של יום חמישי',
  status: 'WAITING',
};

const INPUT = {
  name: 'פוקר של יום חמישי',
  gameDate: '2026-08-24',
  startTime: '20:30',
  endTime: '23:30',
  buyInShekels: 50,
  chipsPerBuyIn: 500,
  maxBuyIns: 6,
  joinMode: 'AUTO_JOIN' as const,
  playerVisibility: 'OPEN' as const,
  countingMode: 'ADMIN_COUNT' as const,
  adminPlays: true,
};

/** Mirrors the route guard in src/app/table/[id]/page.tsx. */
const tablePageWouldRender = (id: string) => isUuid(id);

beforeEach(() => {
  rpcResult = TABLE_ROW;
  readback = { id: VALID_ID };
  rpcCalls = [];
});

describe('create table → redirect → table page', () => {
  it('produces a URL the table page will render', async () => {
    const result = await createTableAction(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.tableId).toBe(VALID_ID);
    expect(result.data.joinCode).toBe('A7K92');

    const url = `/table/${result.data.tableId}`;
    expect(url).toBe(`/table/${VALID_ID}`);
    expect(url).not.toContain('undefined');
    expect(tablePageWouldRender(result.data.tableId)).toBe(true);
  });

  it('also works if PostgREST ever returns the row inside an array', async () => {
    rpcResult = [TABLE_ROW];
    const result = await createTableAction(INPUT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tableId).toBe(VALID_ID);
    expect(tablePageWouldRender(result.data.tableId)).toBe(true);
  });

  it.each([
    ['null', null],
    ['an empty array', []],
    ['a bare string', 'oops'],
    ['an object with no id', { join_code: 'A7K92' }],
    ['an object whose id is undefined', { id: undefined, join_code: 'A7K92' }],
    ['an object whose id is the string "undefined"', { id: 'undefined', join_code: 'A7K92' }],
    ['an object whose id is malformed', { id: 'not-a-uuid', join_code: 'A7K92' }],
    ['an object whose id is nested', { id: { value: VALID_ID }, join_code: 'A7K92' }],
  ])('fails cleanly rather than redirecting when the RPC returns %s', async (_label, value) => {
    rpcResult = value;
    const result = await createTableAction(INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A Hebrew message, with no internals and no "undefined" leaking through.
    expect(result.message).toMatch(/[֐-׿]/);
    expect(result.message).not.toContain('undefined');
    expect(result.code).toBe('RPC_BAD_SHAPE');
  });

  it('rejects a missing or malformed join code', async () => {
    rpcResult = { id: VALID_ID, join_code: null };
    const result = await createTableAction(INPUT);
    expect(result.ok).toBe(false);
  });

  it('refuses to redirect when RLS hides the new row from its creator', async () => {
    readback = null;
    const result = await createTableAction(INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TABLE_NOT_READABLE');
    expect(result.message).toMatch(/[֐-׿]/);
  });

  it('never returns success with an id the table page would 404 on', async () => {
    for (const value of [null, [], { id: undefined }, { id: 'undefined' }, { id: 12 }]) {
      rpcResult = value;
      const result = await createTableAction(INPUT);
      if (result.ok) {
        expect(tablePageWouldRender(result.data.tableId)).toBe(true);
      } else {
        expect(result.message.length).toBeGreaterThan(0);
      }
    }
  });

  it('validates the group id instead of coercing it to the string "null"', async () => {
    // get_or_create_poker_group returns a bare scalar; String(null) would have
    // produced "null" and been sent on as a foreign key.
    rpcResult = null;
    const result = await createTableAction({ ...INPUT, groupName: 'החבר׳ה' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('RPC_BAD_SHAPE');
    expect(rpcCalls[0]).toBe('get_or_create_poker_group');
  });
});
