/**
 * Which origin an email link may point back at.
 *
 * Split out from the server module that gathers the headers so the decision
 * itself — the part that matters — is a pure function with tests, rather than
 * something only exercised by deploying.
 *
 * The rule: prefer the origin of the request being served, so production sends
 * production links and a preview sends its own, with no environment variable to
 * set once and forget. Believe that origin only when it names a host this
 * deployment can independently prove is its own.
 *
 * Why the caution: `Host` and `X-Forwarded-Host` come from the client. A
 * password-reset link built from a forged one is an account takeover — the mail
 * goes to the real address carrying a link to somebody else's site, and
 * whatever is typed there is typed to them.
 */

export interface OriginChoice {
  /** Origin derived from the request's own headers. Untrusted. */
  requested: string | null;
  /** The configured site URL. Not client-influenced, so the safe fallback. */
  configured: string;
  /** Hosts this deployment knows it answers to, e.g. from Vercel's own vars. */
  knownHosts: readonly string[];
  /** Localhost on any port is a valid origin only outside production. */
  allowLocalhost: boolean;
}

export function pickOrigin({
  requested,
  configured,
  knownHosts,
  allowLocalhost,
}: OriginChoice): string {
  const host = hostOf(requested);
  if (!host) return configured;

  if (allowLocalhost && isLocalhost(host)) return requested!;

  const allowed = new Set(
    [...knownHosts, hostOf(configured)]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );
  return allowed.has(host) ? requested! : configured;
}

function isLocalhost(host: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

/** The host of a URL, lower-cased. Null for anything that is not one. */
export function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Only ever http(s): a `javascript:` or `data:` "origin" is not a site.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}
