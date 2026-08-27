/**
 * All money in this application is handled as an integer number of agorot
 * (1 ILS = 100 agorot). Floating point never touches a financial value.
 */

export const AGOROT_PER_SHEKEL = 100;

export function shekelsToAgorot(shekels: number): number {
  if (!Number.isFinite(shekels)) throw new Error('shekelsToAgorot: not a finite number');
  return Math.round(shekels * AGOROT_PER_SHEKEL);
}

export function assertSafeAgorot(value: number, label = 'amount'): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer number of agorot`);
  if (!Number.isSafeInteger(value)) throw new Error(`${label} is out of safe integer range`);
  return value;
}
