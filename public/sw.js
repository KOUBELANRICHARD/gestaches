self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Gestaches',
    body: 'Tu as un rappel.',
    url: '/'
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      actions: payload.actions || [],
      data: {
        url: payload.url || '/',
        actionUrls: payload.actionUrls || {}
      }
    })
  );
});

function focusOrOpen(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.includes(self.location.origin));
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const actionUrl = event.action ? event.notification.data?.actionUrls?.[event.action] : '';
  event.waitUntil(
    Promise.resolve()
      .then(() => {
        if (!actionUrl) return null;
        return fetch(actionUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
      })
      .then(() => focusOrOpen(url))
  );
});
