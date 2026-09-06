import 'server-only';

import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Turning what an email link carries into a signed-in session.
 *
 * Supabase can deliver a confirmation in three shapes, and which one arrives
 * depends on the project's email template — a setting in a dashboard, not in
 * this repository. Handling only one of them is why a confirmed address could
 * still land on a sign-in form:
 *
 *   · `?code=…` — the PKCE flow. Exchanged for a session, but only on the
 *     device that started it: the verifier lives in a cookie written when the
 *     form was submitted. Signing up on a laptop and opening the mail on a
 *     phone cannot work this way, and that is not a bug to fix here — it is the
 *     reason the second shape matters.
 *
 *   · `?token_hash=…&type=signup|recovery|email_change|invite|magiclink` — the
 *     server-side flow. Verified against the auth service with nothing stored
 *     locally, so it works from any device, in any browser, including the
 *     in-app one a mail client opens.
 *
 *   · `?error=…&error_code=…` — Supabase telling us the link is spent. It
 *     arrives at exactly this URL and used to be read as "no code", which
 *     turned an expired link and a broken one into the same silence.
 *
 * The fragment flow (`#access_token=…`) is deliberately not handled: a fragment
 * never reaches the server, and this project's clients are on PKCE, so it
 * cannot arrive.
 */

/** Why a link did not sign somebody in. Mapped to Hebrew by the sign-in page. */
export type CallbackFailure = 'expired' | 'used' | 'unknown';

export type CallbackResult =
  | { ok: true }
  | { ok: false; reason: CallbackFailure; detail: string };

const OTP_TYPES = new Set(['signup', 'recovery', 'invite', 'magiclink', 'email', 'email_change']);

export async function completeAuthCallback(request: NextRequest): Promise<CallbackResult> {
  const params = new URL(request.url).searchParams;

  // The auth service refused the link before it ever reached us.
  const errorCode = params.get('error_code');
  if (errorCode) {
    return {
      ok: false,
      reason: errorCode === 'otp_expired' ? 'expired' : 'unknown',
      detail: `${errorCode}: ${params.get('error_description') ?? ''}`.trim(),
    };
  }

  const supabase = await createClient();

  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'signup',
      token_hash: tokenHash,
    });
    return error ? failure(error) : { ok: true };
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? failure(error) : { ok: true };
  }

  return { ok: false, reason: 'unknown', detail: 'no code, token_hash or error in the callback URL' };
}

function failure(error: { message: string; status?: number }): CallbackResult {
  const message = error.message.toLowerCase();
  // "Email link is invalid or has expired" covers both a spent link and a
  // stale one; the person's next step is the same either way — ask for a new
  // one — so they are not told apart on screen, only in the log.
  if (/expired|invalid/.test(message)) {
    return { ok: false, reason: 'expired', detail: error.message };
  }
  // A PKCE exchange with no verifier: the mail was opened somewhere other than
  // where the form was filled in.
  if (/verifier|code challenge|pkce/.test(message)) {
    return { ok: false, reason: 'used', detail: error.message };
  }
  return { ok: false, reason: 'unknown', detail: error.message };
}

/**
 * A destination from a query string, reduced to something that cannot leave
 * this site. Rejects an absolute URL and a protocol-relative `//host` path.
 */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
