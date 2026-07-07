self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // No offline caching strategy — this exists only so the app qualifies as
  // an installable PWA. Every request just goes to the network as normal.
})
