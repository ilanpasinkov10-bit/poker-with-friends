import { AppError, toHebrewError } from '@/lib/errors';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  const { code, message } = toHebrewError(error);
  // Developer context never travels to the client, but it must reach the logs.
  if (error instanceof AppError && error.detail) {
    console.error(`[action] ${code}: ${error.detail}`);
  }
  return { ok: false, code, message };
}

/** Wraps an action body so no raw database error can ever escape to the client. */
export async function guard<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') console.error('[action]', error);
    return fail(error);
  }
}
