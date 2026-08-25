'use client';

import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from '@/lib/actions/notifications';

/**
 * The browser half of Web Push.
 *
 * Every entry point here is defensive on purpose. Push is unavailable in more
 * situations than it is available: no service worker (insecure origin, private
 * window), no PushManager, permission denied, or — the common one on an iPhone
 * — Safari that has not been added to the Home Screen. None of those are
 * errors the player should see; they simply mean this device will not receive
 * notifications, and the app must carry on exactly as before.
 */

export type PushSupport =
  | 'SUPPORTED'
  | 'UNSUPPORTED'
  | 'DENIED'
  /** iOS Safari only exposes push once the app is installed to the Home Screen. */
  | 'NEEDS_INSTALL';

export function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'UNSUPPORTED';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return isIosSafari() && !isStandalone() ? 'NEEDS_INSTALL' : 'UNSUPPORTED';
  }
  if (typeof Notification === 'undefined') return 'UNSUPPORTED';
  if (Notification.permission === 'denied') return 'DENIED';
  return 'SUPPORTED';
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac, so a touch-capable "Mac" counts as iPad.
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return iOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function isStandalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return legacy === true || window.matchMedia('(display-mode: standalone)').matches;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/**
 * Subscribes this browser and records it. Returns false whenever push cannot
 * be set up, which is a normal outcome and not a failure to report.
 *
 * The permission prompt is only reached if the caller has already decided to
 * ask — never on a cold page load, which browsers punish and users resent.
 */
export async function enablePush(publicKey: string): Promise<boolean> {
  if (detectPushSupport() !== 'SUPPORTED') return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const reg = await registration();
    if (!reg) return false;
    await navigator.serviceWorker.ready;

    // An existing subscription may have been created with a different key —
    // after a key rotation, for instance — and would then fail to decrypt.
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe().catch(() => undefined);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const result = await savePushSubscriptionAction({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent.slice(0, 512),
    });
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Unsubscribes this browser and forgets it server-side.
 *
 * The server row is removed first: if the browser call then fails, the worst
 * case is a live subscription nobody sends to. The reverse order could leave a
 * row we would keep pushing to after the player asked us to stop.
 */
export async function disablePush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const subscription = await reg?.pushManager.getSubscription();
    if (!subscription) return;
    await removePushSubscriptionAction(subscription.endpoint);
    await subscription.unsubscribe().catch(() => undefined);
  } catch {
    // Nothing to tell the player: the server side is already the authority on
    // whether anything is sent.
  }
}

/**
 * VAPID keys travel as base64url; `subscribe` wants raw bytes.
 *
 * Backed by an explicit ArrayBuffer because a plain `Uint8Array` is typed over
 * `ArrayBufferLike`, which includes SharedArrayBuffer and so does not satisfy
 * `BufferSource`.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const normalised = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
