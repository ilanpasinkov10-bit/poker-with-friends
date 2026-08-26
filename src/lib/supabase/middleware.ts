import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured, publicEnv } from '@/lib/env';

/**
 * Keeps the Supabase session cookie fresh.
 *
 * `getSession` reads the session out of the cookie and only goes to the network
 * when the access token has actually expired, in which case it refreshes it and
 * writes the new cookie. `getUser` — which this used to call — goes to the
 * auth service on *every* request to re-validate, and every page then does the
 * same thing again a moment later. That was two round trips for one fact,
 * in series, in front of every navigation in the app.
 *
 * Dropping one of them costs nothing in security, because the middleware was
 * never what authorised anything. Every page and every server action calls
 * `getUser` itself, against the auth service, and that is what decides whether
 * a request is allowed. Nothing here is trusted; this only keeps the cookie
 * from going stale.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const env = publicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getSession();
  return response;
}
