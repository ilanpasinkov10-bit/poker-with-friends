import 'server-only';

import { headers } from 'next/headers';
import { siteUrl } from '@/lib/env';
import { pickOrigin } from '@/lib/domain/site-origin';

/**
 * The origin an email link should point back at, for this deployment.
 *
 * Gathers what the request and the platform say; `pickOrigin` decides which to
 * believe, and is where the reasoning — and the tests — live.
 *
 * Supabase also checks the address against its own Redirect URLs list, so a
 * forged one would be refused there too. This is the half of that defence that
 * does not depend on somebody having configured the list correctly.
 */
export async function requestOrigin(): Promise<string> {
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host');
  const proto = list.get('x-forwarded-proto') ?? 'https';

  return pickOrigin({
    requested: host ? `${proto}://${host}` : null,
    configured: siteUrl(),
    knownHosts: [
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
    ].filter((value): value is string => Boolean(value)),
    allowLocalhost: process.env.NODE_ENV !== 'production',
  });
}
