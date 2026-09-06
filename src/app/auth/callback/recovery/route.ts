import { NextResponse, type NextRequest } from 'next/server';
import { completeAuthCallback } from '@/lib/auth-callback';

/**
 * Where a password-reset email lands.
 *
 * A separate path rather than `/auth/callback?next=/auth/reset` so that the
 * addresses Supabase has to allow are two plain paths with no query string —
 * one setting to get right instead of a wildcard to reason about. The exchange
 * itself is the same one confirmation uses.
 *
 * Succeeding here signs the person in on a recovery session, which is what
 * lets them set a new password without knowing the old one. `/auth/reset` is
 * where they do that.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const result = await completeAuthCallback(request);
  if (result.ok) return NextResponse.redirect(`${origin}/auth/reset`);

  console.error('[auth/callback/recovery]', result.reason, '|', result.detail);
  return NextResponse.redirect(`${origin}/auth/forgot?link=${result.reason}`);
}
