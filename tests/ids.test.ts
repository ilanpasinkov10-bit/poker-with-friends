import { describe, expect, it } from 'vitest';
import { isUuid } from '@/lib/domain/ids';

describe('isUuid', () => {
  it('accepts a real UUID in either case', () => {
    expect(isUuid('424e10d2-a78a-45de-8358-8e54aeb068d4')).toBe(true);
    expect(isUuid('424E10D2-A78A-45DE-8358-8E54AEB068D4')).toBe(true);
  });

  it('rejects the strings a broken template literal produces', () => {
    // `/table/${undefined}` is exactly how the 404 was reached.
    expect(isUuid('undefined')).toBe(false);
    expect(isUuid('null')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid({ id: 'x' })).toBe(false);
    expect(isUuid(['424e10d2-a78a-45de-8358-8e54aeb068d4'])).toBe(false);
  });

  it('rejects near-misses', () => {
    expect(isUuid('424e10d2-a78a-45de-8358-8e54aeb068d')).toBe(false);
    expect(isUuid('424e10d2a78a45de83588e54aeb068d4')).toBe(false);
    expect(isUuid('424e10d2-a78a-45de-8358-8e54aeb068d4 ')).toBe(false);
    expect(isUuid('zzze10d2-a78a-45de-8358-8e54aeb068d4')).toBe(false);
  });
});
