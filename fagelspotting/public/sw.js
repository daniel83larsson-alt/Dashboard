// Minimal service worker -- just enough for install-to-home-screen
// eligibility on iOS/Android. No offline caching strategy for this POC.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through -- no caching. Presence of a fetch handler is what
  // qualifies the app as installable on most platforms.
});
