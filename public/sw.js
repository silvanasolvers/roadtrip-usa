// Service worker: makes the board usable with no signal (Zion Canyon,
// Yosemite Valley and the Page highway all have zero coverage).
//
// Strategy:
//   - navigations: network-first, fall back to the cached shell so the app
//     opens offline and shows the last synced state.
//   - built assets (index-*.js/css): cache-first — they are fingerprinted, so a
//     new build is a new URL and there is nothing to invalidate.
//   - other same-origin files: network-first, cached copy as offline fallback.
//   - /api/state reads: network-first, cached copy as the offline fallback.
//   - writes (POST) are never cached.
//
// The old version used stale-while-revalidate for everything and never refreshed
// the shell, so after a deploy the app kept running the previous build and the
// redesign was invisible until the cache expired.
const CACHE = 'roadtrip-usa-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest']
// Vite output is fingerprinted: safe to keep forever, and it lets the app open
// instantly offline in a park with no coverage.
const FINGERPRINTED = /^\/assets\/index-[A-Za-z0-9_-]+\.(js|css)$/

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
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

  // HTML navigations — network first so a deploy is picked up immediately,
  // offline shell as fallback.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put('/index.html', copy)).catch(() => {})
          }
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

  // Fingerprinted build output — cache first. A new build gets a new filename,
  // so a hit here is never stale.
  if (FINGERPRINTED.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {})
        }
        return res
      }))
    )
    return
  }

  // Everything else (icons, manifest, uploaded files) — network first, cache as
  // the offline fallback rather than serving a possibly stale copy first.
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
