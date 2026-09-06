import { describe, expect, it } from 'vitest';
import { LINK_FAILURE_MESSAGE, isLinkFailure } from '@/lib/domain/auth-links';
import { hostOf, pickOrigin } from '@/lib/domain/site-origin';
import { errorMessage, toHebrewError } from '@/lib/errors';

/**
 * What somebody is told when a link from an email does not work, and what the
 * app refuses to tell them about anybody else.
 */

describe('a link that did not sign somebody in', () => {
  it('explains every reason the callback can report, in Hebrew', () => {
    for (const reason of ['expired', 'used', 'unknown'] as const) {
      const message = LINK_FAILURE_MESSAGE[reason];
      expect(message).toMatch(/[֐-׿]/);
      // Never the auth service's own words: those name internals and change.
      expect(message).not.toMatch(/[A-Za-z]{4,}/);
    }
  });

  it('tells somebody whose link needs the original browser what to do instead', () => {
    // The PKCE case. "Ask for a new link" would be wrong advice — a new link
    // opened in the same wrong place fails identically.
    expect(LINK_FAILURE_MESSAGE.used).toContain('דפדפן');
    expect(LINK_FAILURE_MESSAGE.used).toContain('להתחבר');
  });

  it('accepts only reasons it knows how to explain', () => {
    expect(isLinkFailure('expired')).toBe(true);
    expect(isLinkFailure('used')).toBe(true);
    expect(isLinkFailure('unknown')).toBe(true);
    // Anything else in the query string is ignored rather than rendered.
    for (const bad of ['', 'link', 'boom', '<script>', null, undefined, 42]) {
      expect(isLinkFailure(bad)).toBe(false);
    }
  });
});

describe('choosing a new password', () => {
  it('has its own Hebrew for the two ways it can be refused', () => {
    expect(errorMessage('RESET_LINK_EXPIRED')).toMatch(/[֐-׿]/);
    expect(errorMessage('PASSWORDS_DO_NOT_MATCH')).toBe('הסיסמאות אינן זהות');
    expect(errorMessage('SHORT_PASSWORD')).toContain('8');
  });

  it('maps the auth service’s own refusals without leaking them', () => {
    const sameAsBefore = Object.assign(new Error('New password should be different from the old password.'), {
      __isAuthError: true,
      name: 'AuthApiError',
      status: 422,
      code: 'same_password',
    });
    const { code, message } = toHebrewError(sameAsBefore);
    expect(code).toBe('SAME_PASSWORD');
    expect(message).not.toMatch(/[A-Za-z]{4,}/);
  });

  it('reports an expired recovery link rather than a server failure', () => {
    for (const code of ['otp_expired', 'flow_state_expired', 'bad_code_verifier']) {
      const error = Object.assign(new Error('Token has expired or is invalid'), {
        __isAuthError: true,
        name: 'AuthApiError',
        status: 403,
        code,
      });
      expect(toHebrewError(error).code).toBe('LINK_EXPIRED');
    }
  });
});

describe('which origin an email link may point back at', () => {
  const SITE = 'https://poker-with-friends-green.vercel.app';
  const base = { configured: SITE, knownHosts: [] as string[], allowLocalhost: false };

  it('uses the request origin when it is the configured site', () => {
    expect(pickOrigin({ ...base, requested: SITE })).toBe(SITE);
  });

  it('uses a preview deployment’s own origin, so preview links stay in preview', () => {
    const preview = 'https://poker-with-friends-abc123.vercel.app';
    expect(
      pickOrigin({ ...base, requested: preview, knownHosts: ['poker-with-friends-abc123.vercel.app'] }),
    ).toBe(preview);
  });

  it('refuses a host it cannot prove is its own, and falls back to the configured site', () => {
    // The attack this exists to stop: a forged Host header turns a reset email
    // into a link to somebody else's site, sent to the real owner's inbox.
    for (const forged of [
      'https://evil.example',
      'https://poker-with-friends-green.vercel.app.evil.example',
      'https://evil.example:443',
      'http://localhost:3000',
    ]) {
      expect(pickOrigin({ ...base, requested: forged })).toBe(SITE);
    }
  });

  it('accepts localhost on any port only outside production', () => {
    expect(pickOrigin({ ...base, requested: 'http://localhost:3000', allowLocalhost: true })).toBe(
      'http://localhost:3000',
    );
    expect(pickOrigin({ ...base, requested: 'http://localhost:4311', allowLocalhost: true })).toBe(
      'http://localhost:4311',
    );
    expect(pickOrigin({ ...base, requested: 'http://localhost:3000' })).toBe(SITE);
  });

  it('ignores anything that is not an http(s) origin', () => {
    for (const bad of [null, '', 'not a url', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.example']) {
      expect(pickOrigin({ ...base, requested: bad })).toBe(SITE);
    }
  });

  it('compares hosts case-insensitively, port included', () => {
    expect(pickOrigin({ ...base, requested: 'https://POKER-with-friends-green.VERCEL.app' })).toBe(
      'https://POKER-with-friends-green.VERCEL.app',
    );
    // A different port is a different host, and not one we know.
    expect(pickOrigin({ ...base, requested: 'https://poker-with-friends-green.vercel.app:8443' })).toBe(SITE);
  });

  it('reads a host out of a URL, and nothing out of a non-URL', () => {
    expect(hostOf('https://Example.COM/a/b?c=d')).toBe('example.com');
    expect(hostOf('https://example.com:8443')).toBe('example.com:8443');
    expect(hostOf('nonsense')).toBeNull();
    expect(hostOf(null)).toBeNull();
  });
});
