// Service worker: makes the board usable with no signal (Zion Canyon,
// Yosemite Valley and the Page highway all have zero coverage).
//
// Strategy:
//   - navigations: network-first, fall back to the cached shell so the app
//     opens offline and shows the last synced state.
//   - same-origin assets: stale-while-revalidate.
//   - /api/state reads: network-first, cached copy as the offline fallback.
//   - writes (POST) are never cached.
const CACHE = 'roadtrip-usa-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // HTML navigations — network first, offline shell as fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/')))
    )
    return
  }

  // Shared state — network first so everyone sees each other's edits, with the
  // last good snapshot available offline.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (url.pathname === '/api/state') {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Static assets — stale-while-revalidate.
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
