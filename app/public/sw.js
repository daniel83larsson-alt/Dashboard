// Bumped whenever the caching strategy itself changes (not on every deploy —
// the hashed Next.js asset URLs already invalidate themselves) — activate()
// below drops any cache under a different name, so a bump here is how to
// force every installed client to discard a stale strategy.
const STATIC_CACHE = 'dl-trainer-static-v1'

// Cache-first is only safe for content whose URL itself changes when the
// content changes — true for Next.js's hashed /_next/static/ bundles and
// for the (rarely-changing, non-personal) marketing screenshots/icons.
// Never true for a page or API response: those carry a specific user's
// data, and the app already sends Cache-Control: no-store on every
// authenticated page for exactly that reason (a stale cached page on a
// shared device showing the wrong person's data was a real incident
// earlier — this must never re-open that door). Navigation requests and
// anything not matched here fall straight through to the network, same as
// before this file existed.
function isCacheableStaticAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/marketing/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  )
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || !isCacheableStaticAsset(url)) return

  // Stale-while-revalidate: an already-installed app shows the cached
  // asset immediately (this is the whole point — no network round-trip
  // blocking first paint), while a fresh copy is fetched in the background
  // for next time. First-ever install still fetches from network like
  // before.
  event.respondWith(
    caches.open(STATIC_CACHE).then(async cache => {
      const cached = await cache.match(event.request)
      const network = fetch(event.request).then(res => {
        if (res.ok) cache.put(event.request, res.clone())
        return res
      }).catch(() => cached)
      return cached || network
    })
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
