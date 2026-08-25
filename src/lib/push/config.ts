/**
 * Web Push configuration.
 *
 * The whole feature is optional at runtime. Without VAPID keys configured the
 * app must behave exactly as it did before: the settings toggle still saves,
 * the browser is never asked for permission, and nothing throws. That keeps a
 * deployment that has not set the keys yet — or a local checkout — working,
 * and it is why every caller goes through `isPushConfigured()` first rather
 * than assuming the keys are there.
 *
 * The public key is safe in the browser by design: it identifies the sender to
 * the push service and is what `pushManager.subscribe` requires. The private
 * key is the signing half and is read only here, on the server.
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** A `mailto:` the push service can contact about this sender. */
  subject: string;
}

/** VAPID keys are base64url and always well over this; a stray empty string is not. */
const MIN_KEY_LENGTH = 20;

export function publicVapidKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key && key.length >= MIN_KEY_LENGTH ? key : null;
}

export function vapidKeys(): VapidKeys | null {
  const publicKey = publicVapidKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey || privateKey.length < MIN_KEY_LENGTH) return null;

  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:noreply@example.com';
  return { publicKey, privateKey, subject };
}

export function isPushConfigured(): boolean {
  return vapidKeys() !== null;
}
