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
    //
    // The mapped code is logged beside the raw description on purpose: the user
    // is shown one sentence, and this is the line that says which rule produced
    // it. When that code is UNKNOWN, the mapping missed a case and the rest of
    // the line is what is needed to add it. `fail` logs nothing of its own, so
    // one failure is one line.
    const { code } = toHebrewError(error);
    console.error('[action]', `mapped=${code}`, '|', describeForLog(error));
    return fail(error);
  }
}

/** A single log line carrying whatever the error actually knows about itself. */
function describeForLog(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}${error.detail ? `: ${error.detail}` : ''}`;
  }
  if (typeof error === 'object' && error !== null) {
    const e = error as {
      name?: unknown;
      status?: unknown;
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    // `name` and `status` matter for Supabase auth failures: every GoTrue 5xx
    // arrives as an AuthRetryableFetchError with no `code` at all, so without
    // these two a signup that failed inside the database and one that failed
    // because the service was restarting look identical in the log.
    return [
      e.name && e.name !== 'Error' ? `name=${String(e.name)}` : null,
      typeof e.status === 'number' ? `status=${String(e.status)}` : null,
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
