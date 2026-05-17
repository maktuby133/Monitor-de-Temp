// SERVICE WORKER — AmbientWatch (Web Push)
const ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGNpcmNsZSBjeD0iOTYiIGN5PSI5NiIgcj0iOTYiIGZpbGw9IiMwZjE3MmEiLz4KICA8Y2lyY2xlIGN4PSI5NiIgY3k9Ijk2IiByPSI4OCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMzhiZGY4IiBzdHJva2Utd2lkdGg9IjEuNSIgb3BhY2l0eT0iMC4zIi8+CiAgPHJlY3QgeD0iODIiIHk9IjIyIiB3aWR0aD0iMjgiIGhlaWdodD0iOTAiIHJ4PSIxNCIgZmlsbD0iIzFlMjkzYiIgc3Ryb2tlPSIjMzhiZGY4IiBzdHJva2Utd2lkdGg9IjEuNSIvPgogIDxyZWN0IHg9Ijg3IiB5PSI2NCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjQ4IiByeD0iMCIgZmlsbD0iIzM4YmRmOCIvPgogIDxyZWN0IHg9Ijg3IiB5PSI2NCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjQiIHJ4PSIwIiBmaWxsPSIjN2RkM2ZjIi8+CiAgPGNpcmNsZSBjeD0iOTYiIGN5PSIxMjQiIHI9IjE2IiBmaWxsPSIjMzhiZGY4Ii8+CiAgPGNpcmNsZSBjeD0iOTYiIGN5PSIxMjQiIHI9IjEwIiBmaWxsPSIjN2RkM2ZjIi8+CiAgPGxpbmUgeDE9IjExMCIgeTE9IjQwIiB4Mj0iMTE3IiB5Mj0iNDAiIHN0cm9rZT0iIzM4YmRmOCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgogIDxsaW5lIHgxPSIxMTAiIHkxPSI1MiIgeDI9IjExNCIgeTI9IjUyIiBzdHJva2U9IiMzOGJkZjgiIHN0cm9rZS13aWR0aD0iMSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIwLjUiLz4KICA8bGluZSB4MT0iMTEwIiB5MT0iNjQiIHgyPSIxMTciIHkyPSI2NCIgc3Ryb2tlPSIjMzhiZGY4IiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgPGxpbmUgeDE9IjExMCIgeTE9Ijc2IiB4Mj0iMTE0IiB5Mj0iNzYiIHN0cm9rZT0iIzM4YmRmOCIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWNhcD0icm91bmQiIG9wYWNpdHk9IjAuNSIvPgogIDxsaW5lIHgxPSIxMTAiIHkxPSI4OCIgeDI9IjExNyIgeTI9Ijg4IiBzdHJva2U9IiMzOGJkZjgiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KICA8ZWxsaXBzZSBjeD0iMTM2IiBjeT0iNDQiIHJ4PSI5IiByeT0iMTEiIGZpbGw9IiMwZWE1ZTkiIG9wYWNpdHk9IjAuNyIvPgogIDxlbGxpcHNlIGN4PSIxMzYiIGN5PSI0MSIgcng9IjQiIHJ5PSIzIiBmaWxsPSIjYmFlNmZkIiBvcGFjaXR5PSIwLjUiLz4KICA8cGF0aCBkPSJNMTIyIDE0OCBRMTM0IDEzNiAxNDYgMTQ4IiBmaWxsPSJub25lIiBzdHJva2U9IiMzOGJkZjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIwLjkiLz4KICA8cGF0aCBkPSJNMTI2IDE1NCBRMTM0IDE0NiAxNDIgMTU0IiBmaWxsPSJub25lIiBzdHJva2U9IiMzOGJkZjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIwLjYiLz4KICA8Y2lyY2xlIGN4PSIxMzQiIGN5PSIxNTkiIHI9IjIuNSIgZmlsbD0iIzM4YmRmOCIvPgogIDx0ZXh0IHg9IjMwIiB5PSIxNjAiIGZvbnQtZmFtaWx5PSJtb25vc3BhY2UiIGZvbnQtc2l6ZT0iMTMiIGZvbnQtd2VpZ2h0PSI3MDAiIGZpbGw9IiMzOGJkZjgiIG9wYWNpdHk9IjAuNSIgbGV0dGVyLXNwYWNpbmc9IjEiPkFXPC90ZXh0Pgo8L3N2Zz4=';

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
