// SERVICE WORKER — AmbientWatch (Web Push)
const ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="52" font-size="56">🌡️</text></svg>';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(clients.claim()));

// ── PUSH EVENT — aba fechada, browser acorda o SW ────
self.addEventListener('push', event => {
  let titulo = 'AmbientWatch';
  let corpo  = 'Nova notificação';
  let tag    = 'ambientwatch';

  try {
    const data = event.data ? event.data.json() : {};
    titulo = data.titulo || titulo;
    corpo  = data.corpo  || corpo;
    tag    = data.tag    || tag;
  } catch(e) {
    corpo = event.data ? event.data.text() : corpo;
  }

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo, icon: ICON, tag, renotify: true,
      data: { url: self.registration.scope }
    })
  );
});

// ── MESSAGE — fallback quando aba está aberta ────────
self.addEventListener('message', event => {
  const d = event.data;
  if (!d || d.type !== 'NOTIFICAR') return;
  event.waitUntil(
    self.registration.showNotification(d.titulo, {
      body: d.corpo, icon: ICON, tag: d.tag || 'ambientwatch', renotify: true
    })
  );
});

// ── CLIQUE NA NOTIFICAÇÃO ────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

