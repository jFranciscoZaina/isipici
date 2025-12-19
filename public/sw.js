// sw.js (sin cache) — solo para que la app sea instalable de forma más consistente
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Passthrough: no intercepta ni cachea, solo deja que todo vaya a red normal.
self.addEventListener("fetch", () => {});
