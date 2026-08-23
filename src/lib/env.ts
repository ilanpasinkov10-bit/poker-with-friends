import { z } from 'zod';

/**
 * Environment access is lazy and validated on first use rather than at module
 * load, so that `next build` succeeds on a machine that has no Supabase
 * project configured yet. Anything that actually talks to Supabase fails with
 * an explicit message instead of a confusing runtime error.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    // These must be referenced statically so Next can inline them client-side.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      `Supabase is not configured. ${parsed.error.issues.map((i) => i.message).join('; ')}. ` +
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

/** Server-only. Never import this from a client component. */
export function serviceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 20) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured (server-only variable).');
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
