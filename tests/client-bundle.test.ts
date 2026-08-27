import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.tsx?$/.test(full)
        ? [full]
        : [];
  });
}

/** Resolves an import specifier the way the tsconfig alias and Node would. */
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const candidate of [
    base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm;

/**
 * Everything the browser can end up downloading: every `'use client'` module
 * and everything it pulls in, transitively. A `'use server'` module is not
 * followed — Next replaces those with a network reference and none of their
 * code is bundled.
 */
function clientReachable(): Map<string, string> {
  const all = walk(SRC);
  const seen = new Map<string, string>();
  const queue = all.filter((f) => /^['"]use client['"]/.test(readFileSync(f, 'utf8')));

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    // A `'use server'` module contributes nothing to the bundle: Next replaces
    // the import with a network reference, so neither its code nor anything it
    // imports is downloaded. It is not part of what the browser fetches.
    if (/^['"]use server['"]/.test(src)) continue;
    seen.set(file, src);
    for (const m of src.matchAll(IMPORT)) {
      const next = resolveImport(file, m[1]!);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

describe('what the browser is asked to download', () => {
  // Weighed in kB of transferred JavaScript, on the phone's own connection,
  // before the destination screen can render. `src/lib/env.ts` once imported
  // zod and is reachable from `supabase/client.ts`, which put the whole schema
  // library into the bundle of the table screen and profile settings — to
  // validate two values Next had already inlined as string literals.
  const HEAVY = ['zod', 'web-push', '@supabase/supabase-js/dist/main'];

  it('keeps server-only libraries out of the client module graph', () => {
    const reachable = clientReachable();
    const offenders: string[] = [];

    for (const [file, src] of reachable) {
      for (const m of src.matchAll(IMPORT)) {
        const spec = m[1]!;
        if (HEAVY.some((h) => spec === h || spec.startsWith(`${h}/`))) {
          offenders.push(`${file.replace(SRC, 'src')} imports ${spec}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('reaches the modules it is supposed to, so the walk is not vacuous', () => {
    const reachable = clientReachable();
    const names = [...reachable.keys()].map((f) => f.replace(SRC, 'src'));
    expect(names).toContain('src/lib/supabase/client.ts');
    expect(names).toContain('src/lib/env.ts');
    expect(names.length).toBeGreaterThan(40);
  });

  it('does not import the Supabase client statically on the settings screen', () => {
    // It is loaded when a photo is actually chosen. A static import puts all of
    // supabase-js — auth, realtime, a WebSocket implementation — in front of
    // every visit to a screen most visits only read.
    const uploader = readFileSync(join(SRC, 'components/profile/AvatarUploader.tsx'), 'utf8');
    expect(uploader).not.toMatch(/^import .*supabase\/client/m);
    expect(uploader).toMatch(/await import\('@\/lib\/supabase\/client'\)/);
  });
});
