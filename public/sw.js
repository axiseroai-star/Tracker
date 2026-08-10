// Minimal service worker (§16h) — just enough presence for the browser to
// treat the app as installable. No offline caching/data sync for v1 by
// design (installability + faster launch is the whole goal here).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally a pass-through — no caching strategy for v1.
});
