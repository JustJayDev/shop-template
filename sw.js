// Service worker — offline cache for the shop template.
// Bump CACHE whenever any precached file changes.
//
// Strategy:
//   - data/*.json  -> NETWORK-FIRST. The menu must never be stale; a shop
//                     changing prices has to be reflected on the next visit.
//                     Cache is only a fallback when the network is down.
//   - everything else -> CACHE-FIRST.

const CACHE = "shop-v5";

const PRECACHE = [
  "./",
  "index.html",
  "404.html",
  "css/style.css",
  "js/menu.js",
  "js/i18n.js",
  "manifest.json",
  "assets/favicon.svg"
];

// Data files are handled network-first, never served stale-first.
function isDataRequest(pathname) {
  return /\/data\/.*\.json$/.test(pathname);
}

// --- Install: precache individually so one 404 can't abort the whole install ---
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(
        PRECACHE.map(function (file) {
          return cache.add(file).catch(function () {
            // A single missing asset must not break the service worker.
            return undefined;
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// --- Activate: drop old caches ---
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// --- Fetch ---
self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for JSON data: always try the network so prices are fresh.
  if (isDataRequest(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || Response.error();
          });
        })
    );
    return;
  }

  // Cache-first for everything else.
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req)
        .then(function (res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(req, copy);
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match("index.html");
        });
    })
  );
});