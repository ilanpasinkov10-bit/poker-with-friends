import { z } from 'zod';

/**
 * Environment access is lazy and validated on first use rather than at module
 * load, so that `next build` succeeds on a machine that has no Supabase
 * project configured yet. Anything that actually talks to Supabase fails with
 * an explicit message instead of a confusing runtime error.
 *
 * Supabase renamed its API keys: the browser key is now the *publishable* key
 * (`sb_publishable_…`) and the privileged one is the *secret* key
 * (`sb_secret_…`). Both namings are accepted so an older project using the
 * legacy `anon` / `service_role` JWTs keeps working.
 *
 * NEXT_PUBLIC_* variables must be referenced statically for Next to inline
 * them into the client bundle, which is why both names are spelled out below
 * rather than looked up dynamically.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  publishableKey: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is missing'),
});

export interface PublicEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  /** The browser-safe key: publishable key, or legacy anon key. */
  publishableKey: string;
}

let cachedPublic: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Supabase is not configured. ${parsed.error.issues.map((issue) => issue.message).join('; ')}. ` +
        'Copy .env.example to .env.local and fill in your project values (see docs/SETUP.md).',
    );
  }

  cachedPublic = parsed.data;
  return cachedPublic;
}

export function isSupabaseConfigured(): boolean {
  try {
    publicEnv();
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-only privileged key. Bypasses RLS, so it must never be imported into
 * a client component or prefixed with NEXT_PUBLIC_.
 */
export function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 20) {
    throw new Error(
      'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not configured. ' +
        'This is a server-only variable and must never be exposed to the browser.',
    );
  }
  return key;
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return 'http://localhost:3000';
}
