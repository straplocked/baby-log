/* Baby Log service worker — local-first app shell.
   Navigations: network-first, cache fallback (3am logging never waits on signal).
   Assets + fonts: cache-first with background fill. */
const SHELL = 'babylog-shell-v1'
const RUNTIME = 'babylog-rt-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Web Push from the api container — payload is {title, body, tag}
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { /* non-JSON push — show the shell */ }
  e.waitUntil(self.registration.showNotification(d.title || 'Baby Log', {
    body: d.body || '',
    tag: d.tag || 'babylog', // same-kind pushes replace, they don't stack
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => list.length ? list[0].focus() : self.clients.openWindow('/'))
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone()
          caches.open(SHELL).then(c => c.put('/', copy))
          return r
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // never cache the API or the websocket auth — always live
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/app')) return

  const cacheable = url.origin === location.origin
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com'
  if (!cacheable) return

  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) {
        const copy = r.clone()
        caches.open(RUNTIME).then(c => c.put(e.request, copy))
      }
      return r
    }))
  )
})
