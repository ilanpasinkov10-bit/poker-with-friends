import { describe, expect, it } from 'vitest';
import { requireUuid, singleRow } from '@/lib/rpc';
import { AppError } from '@/lib/errors';

const UUID = '424e10d2-a78a-45de-8358-8e54aeb068d4';

describe('singleRow', () => {
  it('passes through the object shape PostgREST returns for a composite result', () => {
    expect(singleRow<{ id: string }>({ id: UUID })).toEqual({ id: UUID });
  });

  it('unwraps the array shape a set-returning function would produce', () => {
    expect(singleRow<{ id: string }>([{ id: UUID }])).toEqual({ id: UUID });
    expect(singleRow<{ id: string }>([{ id: UUID }, { id: 'second' }])).toEqual({ id: UUID });
  });

  it('returns null for anything that carries no row', () => {
    expect(singleRow(null)).toBeNull();
    expect(singleRow(undefined)).toBeNull();
    expect(singleRow([])).toBeNull();
    expect(singleRow('a string')).toBeNull();
    expect(singleRow(7)).toBeNull();
    expect(singleRow([null])).toBeNull();
  });
});

describe('requireUuid', () => {
  it('returns the value when it is a UUID', () => {
    expect(requireUuid(UUID, 'ctx')).toBe(UUID);
  });

  it('throws a user-safe Hebrew error for anything else', () => {
    for (const bad of [undefined, null, '', 'undefined', 'not-a-uuid', 42, [UUID], { id: UUID }]) {
      expect(() => requireUuid(bad, 'create_poker_table.id')).toThrow(AppError);
    }
  });

  it('keeps the developer context off the user-facing message', () => {
    try {
      requireUuid(undefined, 'create_poker_table.id');
      throw new Error('should have thrown');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe('RPC_BAD_SHAPE');
      // The message is what the UI renders — Hebrew, and free of internals.
      expect(appError.message).not.toContain('create_poker_table');
      expect(appError.message).not.toContain('undefined');
      expect(appError.message).toMatch(/[֐-׿]/);
      // The detail carries the diagnosis, for the server log only.
      expect(appError.detail).toContain('create_poker_table.id');
    }
  });
});
