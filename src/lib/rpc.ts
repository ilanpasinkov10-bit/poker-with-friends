import { isUuid } from '@/lib/domain/ids';
import { AppError } from '@/lib/errors';

/**
 * Normalises a PostgREST function result to a single row.
 *
 * PostgREST returns a bare JSON object for a function returning a composite
 * type and an array for a set-returning one — verified against PostgREST
 * 12.2.3, the version Supabase runs. Rather than trust one shape across
 * version upgrades and client changes, accept either and fail loudly on
 * anything else, so a surprise becomes a clear error instead of an
 * `undefined` that silently ends up in a URL.
 */
export function singleRow<T extends object>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    const [first] = data;
    return first && typeof first === 'object' ? (first as T) : null;
  }
  return typeof data === 'object' ? (data as T) : null;
}

/**
 * Extracts a value that must be a UUID, throwing a user-safe error otherwise.
 * Used on anything destined for a route parameter.
 */
export function requireUuid(value: unknown, context: string): string {
  if (!isUuid(value)) {
    throw new AppError(
      'RPC_BAD_SHAPE',
      undefined,
      `${context}: expected a UUID, received ${describe(value)}`,
    );
  }
  return value;
}

function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(length ${value.length})`;
  return `${typeof value} ${JSON.stringify(value)?.slice(0, 60)}`;
}
