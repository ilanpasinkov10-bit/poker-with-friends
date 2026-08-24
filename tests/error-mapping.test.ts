import { describe, expect, it } from 'vitest';
import { errorMessage, toHebrewError } from '@/lib/errors';

/**
 * Pins which server condition produces which Hebrew string.
 *
 * This exists because a production report was diagnosed from the message
 * alone: "הפעולה אינה זמינה כרגע" has exactly one source, and that made the
 * cause unambiguous without access to the database.
 */

describe('the "action unavailable" message', () => {
  const MESSAGE = 'הפעולה אינה זמינה כרגע. נסו שוב מאוחר יותר.';

  it('comes only from the database being behind the deployed code', () => {
    // PostgREST reports a missing function this way.
    expect(toHebrewError({ code: 'PGRST202', message: 'Could not find the function' })).toEqual({
      code: 'SCHEMA_OUT_OF_DATE',
      message: MESSAGE,
    });
    // …and a missing column this way.
    expect(toHebrewError({ code: 'PGRST204', message: 'Column not found' }).code).toBe(
      'SCHEMA_OUT_OF_DATE',
    );
    expect(toHebrewError(new Error('not found in the schema cache')).code).toBe(
      'SCHEMA_OUT_OF_DATE',
    );
  });

  it('is not produced by any ordinary refusal', () => {
    const ordinary = [
      'LEAVE_UNAUTHORIZED',
      'LEAVE_ALREADY_LEFT',
      'LEAVE_TABLE_NOT_ACTIVE',
      'LEAVE_PLAYER_NOT_FOUND',
      'LEAVE_INVALID_CHIPS',
      'LEAVE_INVALID_STATE',
      'MAX_BUYINS_REACHED',
      'CHIP_MISMATCH',
    ];
    for (const code of ordinary) {
      expect(toHebrewError(new Error(code)).message).not.toBe(MESSAGE);
    }
  });
});

describe('leave refusals each get their own Hebrew message', () => {
  it('maps every code the RPC can raise', () => {
    const codes = [
      'LEAVE_UNAUTHORIZED',
      'LEAVE_PLAYER_NOT_FOUND',
      'LEAVE_ALREADY_LEFT',
      'LEAVE_TABLE_NOT_ACTIVE',
      'LEAVE_INVALID_STATE',
      'LEAVE_INVALID_CHIPS',
    ];
    const messages = codes.map((code) => toHebrewError(new Error(code)));

    for (const [i, result] of messages.entries()) {
      expect(result.code).toBe(codes[i]);
      // Hebrew, and never the generic fallback.
      expect(result.message).toMatch(/[֐-׿]/);
      expect(result.message).not.toBe('משהו השתבש. נסו שוב בעוד רגע.');
    }

    // Each code says something distinguishable.
    expect(new Set(messages.map((m) => m.message)).size).toBeGreaterThanOrEqual(5);
  });

  it('never leaks internals into what the user reads', () => {
    for (const code of ['LEAVE_UNAUTHORIZED', 'LEAVE_TABLE_NOT_ACTIVE']) {
      const message = errorMessage(code);
      expect(message).not.toMatch(/leave_table|table_players|auth\.uid|PGRST|SQL/i);
    }
  });
});
