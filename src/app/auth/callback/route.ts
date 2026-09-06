import { NextResponse, type NextRequest } from 'next/server';
import { completeAuthCallback, safeNext } from '@/lib/auth-callback';

/**
 * Where a confirmation or magic-link email lands.
 *
 * On success the person is signed in — the session cookie is written by the
 * Supabase client during the exchange and travels on this redirect — and they
 * go straight into the app. They are never asked for their password again;
 * confirming the address *is* signing in.
 *
 * On failure they reach the sign-in page with a reason, which that page says
 * out loud in Hebrew. This used to be `?error=link`, which nothing read.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get('next'));

  const result = await completeAuthCallback(request);
  if (result.ok) return NextResponse.redirect(`${origin}${next}`);

  console.error('[auth/callback]', result.reason, '|', result.detail);
  return NextResponse.redirect(`${origin}/auth/sign-in?link=${result.reason}`);
}
