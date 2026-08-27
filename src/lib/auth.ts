import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRow } from '@/types/database';

/**
 * Who is asking, and how much of them we need to know.
 *
 * Both readers are wrapped in React's `cache`, which dedupes them for the
 * lifetime of one request. A layout and the page inside it both ask who the
 * viewer is, and without this each ask is a separate round trip to the auth
 * service — on the profile that was two, in series, before any of the page's
 * own data had been requested.
 *
 * They are also split by *how much* they need. Validating the session is one
 * round trip; reading the profile row is a second one to a different service,
 * and it cannot start until the first finishes because it needs the id. Most
 * screens only ever use the id — a table, the tables list, the leaderboard,
 * the friends list — so paying for the profile row on those is an extra
 * serial hop for a value nothing reads.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  profile: ProfileRow | null;
}

/** Identity only: one round trip, no profile row. */
export interface SessionIdentity {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

/**
 * The authoritative session check.
 *
 * `getClaims` verifies the access token's *signature* before believing a word
 * of it, which is the same guarantee `getUser` gives — the difference is where
 * the verification happens. On a project using asymmetric JWT signing keys
 * (ECC/RSA) the public key comes from the auth service's JWKS endpoint, is
 * cached process-wide for the key's lifetime, and the check itself is a local
 * WebCrypto verify: no round trip. `getUser` instead posts the token to the
 * auth service and waits, on every request, for an answer it already had the
 * means to compute.
 *
 * That wait was the single most expensive thing in this app. It sat in front
 * of every route — a page cannot ask for its own data until it knows who is
 * asking — so it was not one round trip out of three, it was the round trip
 * the other two queued behind. Removing it takes a whole network leg off every
 * navigation and lets what remains start immediately.
 *
 * On a project still using a shared (HS256) secret there is no public key to
 * verify against, and `getClaims` falls back to `getUser` on its own. The
 * security is identical in both cases; only the speed differs. See
 * docs/PERFORMANCE.md for how to move a project to asymmetric keys.
 */
export const getSessionIdentity = cache(async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== 'string') return null;

  const email = claims.email;
  return {
    id: claims.sub,
    email: typeof email === 'string' && email.length > 0 ? email : null,
    // `is_anonymous` marks a guest session created through signInAnonymously.
    // It is a signed claim, so it is as trustworthy as the id beside it.
    isAnonymous: claims.is_anonymous === true,
  };
});

/**
 * The viewer's profile row, on its own.
 *
 * Split out from `getSessionUser` so a page can ask for it *alongside* its own
 * data instead of in front of it. Cached, so a layout and the page inside it
 * still share one read.
 */
export const getOwnProfile = cache(async function getOwnProfile(
  userId: string,
): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as ProfileRow | null) ?? null;
});

/** Current viewer, guest or registered. Returns null when nobody is signed in. */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const identity = await getSessionIdentity();
  if (!identity) return null;
  return { ...identity, profile: await getOwnProfile(identity.id) };
});

/** For pages that only registered accounts may open. */
export async function requireRegisteredUser(redirectTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.isAnonymous) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(redirectTo)}`);
  }
  return user;
}

export async function requireAnyUser(redirectTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(redirectTo)}`);
  }
  return user;
}

/**
 * The same guarantee as `requireAnyUser`, without the profile row.
 *
 * Identical authorisation — the session is validated the same way, by the same
 * call — so this is a saving in *reads*, not in checks. Use it wherever the
 * page only needs an id to scope its own query.
 */
export async function requireUserId(redirectTo: string): Promise<SessionIdentity> {
  const identity = await getSessionIdentity();
  if (!identity) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(redirectTo)}`);
  }
  return identity;
}

/** Registered accounts only, without the profile row. */
export async function requireRegisteredUserId(redirectTo: string): Promise<SessionIdentity> {
  const identity = await getSessionIdentity();
  if (!identity || identity.isAnonymous) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(redirectTo)}`);
  }
  return identity;
}
