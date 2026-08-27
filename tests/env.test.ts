import { describe, expect, it } from 'vitest';
import { checkPublicEnv } from '@/lib/env';

const KEY = 'sb_publishable_0123456789abcdef';

describe('validating the public Supabase configuration', () => {
  it('accepts a configured project', () => {
    expect(checkPublicEnv('https://abc.supabase.co', KEY)).toEqual([]);
  });

  it('names the URL when it is missing or unparseable', () => {
    for (const bad of [undefined, null, '', 'not-a-url', 'abc.supabase.co', 42]) {
      expect(checkPublicEnv(bad, KEY)).toEqual(['NEXT_PUBLIC_SUPABASE_URL must be a valid URL']);
    }
  });

  it('names the key when it is missing or too short to be one', () => {
    for (const bad of [undefined, null, '', 'short', 12345]) {
      expect(checkPublicEnv('https://abc.supabase.co', bad)).toEqual([
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is missing',
      ]);
    }
  });

  it('reports both when neither is set', () => {
    expect(checkPublicEnv(undefined, undefined)).toHaveLength(2);
  });

  it('still accepts a local project URL, which is what development uses', () => {
    expect(checkPublicEnv('http://127.0.0.1:54321', KEY)).toEqual([]);
  });
});
