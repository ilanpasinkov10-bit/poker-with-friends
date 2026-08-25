/* Poker With Friends — push service worker.
 *
 * Deliberately minimal. It does not cache or intercept fetches: the app is
 * server-rendered and always wants live data, and a stale-serving worker on a
 * money-handling screen is worse than no worker. Its only job is to receive a
 * push and to focus the right table when the notification is tapped.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Never show a raw or half-parsed payload to the user.
    return;
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Poker With Friends';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const url = typeof payload.url === 'string' ? payload.url : '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      dir: 'rtl',
      lang: 'he',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reuse a tab that is already on this table rather than opening a second.
      for (const client of all) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      for (const client of all) {
        if ('navigate' in client && 'focus' in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })(),
  );
});
