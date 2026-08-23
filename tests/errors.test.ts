import { describe, expect, it } from 'vitest';
import { AppError, GENERIC_ERROR, toHebrewError } from '@/lib/errors';

describe('Hebrew error mapping', () => {
  it('maps database error codes to natural Hebrew', () => {
    expect(toHebrewError(new Error('MAX_BUYINS_REACHED')).message).toBe(
      'הגעת למספר הכניסות המקסימלי',
    );
    expect(toHebrewError(new Error('REQUEST_ALREADY_HANDLED')).message).toBe('הבקשה כבר טופלה');
    expect(toHebrewError(new Error('NOT_AUTHORIZED')).message).toBe('אין לך הרשאה לבצע פעולה זו');
    expect(toHebrewError(new Error('TABLE_NOT_FOUND')).message).toBe('קוד השולחן לא נמצא');
    expect(toHebrewError(new Error('CHIP_MISMATCH')).message).toBe('יש חוסר התאמה בספירת הז׳יטונים');
    expect(toHebrewError(new Error('MISSING_CHIP_COUNTS')).message).toBe(
      'לא ניתן לסיים את המשחק לפני שכל השחקנים הזינו ספירה',
    );
  });

  it('handles Supabase-style error objects', () => {
    expect(toHebrewError({ message: 'MAX_BUYINS_REACHED' }).code).toBe('MAX_BUYINS_REACHED');
  });

  it('never leaks a raw database error to the user', () => {
    const raw =
      'duplicate key value violates unique constraint "buyin_tx_request_uniq" DETAIL: Key (request_id)=(3f2b) already exists.';
    const mapped = toHebrewError(new Error(raw));
    expect(mapped.message).toBe(GENERIC_ERROR);
    expect(mapped.message).not.toContain('constraint');
    expect(mapped.message).not.toContain('request_id');
  });

  it('recognises the unique display-name constraint', () => {
    const mapped = toHebrewError(
      new Error('duplicate key value violates unique constraint "table_players_name_uniq"'),
    );
    expect(mapped.code).toBe('NAME_TAKEN');
  });

  it('translates common auth failures', () => {
    expect(toHebrewError(new Error('Invalid login credentials')).message).toBe(
      'האימייל או הסיסמה שגויים',
    );
    expect(toHebrewError(new Error('User already registered')).code).toBe('EMAIL_TAKEN');
    expect(toHebrewError(new Error('Anonymous sign-ins are disabled')).code).toBe(
      'ANONYMOUS_DISABLED',
    );
  });

  it('carries an AppError through unchanged', () => {
    const mapped = toHebrewError(new AppError('CHIP_MISMATCH'));
    expect(mapped.code).toBe('CHIP_MISMATCH');
  });
});
