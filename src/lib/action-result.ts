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
    // Always logged, production included. This runs on the server, so the
    // detail reaches the platform logs and never the browser — and without it
    // a failing action is indistinguishable from any other in production.
    console.error('[action]', describeForLog(error));
    return fail(error);
  }
}

/** A single log line carrying whatever the error actually knows about itself. */
function describeForLog(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}${error.detail ? `: ${error.detail}` : ''}`;
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return [
      e.code ? `code=${String(e.code)}` : null,
      e.message ? `message=${String(e.message)}` : null,
      e.details ? `details=${String(e.details)}` : null,
      e.hint ? `hint=${String(e.hint)}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
  }
  return String(error);
}
