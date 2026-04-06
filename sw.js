/**
 * Service Worker — ETF Buy Advisor PWA
 *
 * Caching strategy:
 *   - Static assets (HTML, CSS, JS, icons): Cache-first, update in background
 *   - API/data requests: Network-first, fall back to cached data
 *   - Fonts: Cache-first with long TTL
 */

var CACHE_VERSION = 'etf-advisor-v1';
var STATIC_CACHE = CACHE_VERSION + '-static';
var DATA_CACHE = CACHE_VERSION + '-data';

var STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/data-service.js',
  './js/indicators.js',
  './js/scoring.js',
  './js/charts.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Data URL patterns to cache (network-first)
var DATA_PATTERNS = [
  'query1.finance.yahoo.com',
  'corsproxy.io',
  'api.allorigins.win',
  'alphavantage.co',
  'workers.dev/api',
];

// ── INSTALL ──────────────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      // Activate immediately without waiting for old SW to finish
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) {
            // Delete old version caches
            return name !== STATIC_CACHE && name !== DATA_CACHE;
          })
          .map(function(name) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Take control of all pages immediately
      return self.clients.claim();
    })
  );
});

// ── FETCH ────────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!url.startsWith('http')) return;

  // Check if this is a data/API request
  var isDataRequest = DATA_PATTERNS.some(function(pattern) {
    return url.indexOf(pattern) !== -1;
  });

  if (isDataRequest) {
    // Network-first for data: try network, fall back to cache
    event.respondWith(networkFirst(event.request, DATA_CACHE));
  } else if (url.indexOf('fonts.googleapis.com') !== -1 || url.indexOf('fonts.gstatic.com') !== -1) {
    // Cache-first for fonts (they rarely change)
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
  } else {
    // Stale-while-revalidate for static assets
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
  }
});

// ── CACHING STRATEGIES ───────────────────────────────────────────────

/**
 * Network-first: try network, cache the response, fall back to cache.
 * Best for data that should be fresh but can show stale if offline.
 */
function networkFirst(request, cacheName) {
  return fetch(request).then(function(response) {
    if (response.ok) {
      var clone = response.clone();
      caches.open(cacheName).then(function(cache) {
        cache.put(request, clone);
      });
    }
    return response;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      if (cached) {
        console.log('[SW] Serving cached data for:', request.url);
        return cached;
      }
      // Return a minimal error response
      return new Response(JSON.stringify({ error: 'Offline, no cached data available' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });
}

/**
 * Cache-first: serve from cache, only fetch if not cached.
 * Best for assets that rarely change (fonts, icons).
 */
function cacheFirst(request, cacheName) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(cacheName).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return response;
    });
  });
}

/**
 * Stale-while-revalidate: serve cached version immediately,
 * fetch update in background for next visit.
 * Best for static assets that update occasionally.
 */
function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then(function(cached) {
    var fetchPromise = fetch(request).then(function(response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(cacheName).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(function() {
      // Network failed, cached version (if any) already returned
      return cached;
    });

    // Return cached immediately, or wait for network
    return cached || fetchPromise;
  });
}

// ── MESSAGE HANDLING ─────────────────────────────────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
    caches.delete(DATA_CACHE).then(function() {
      console.log('[SW] Data cache cleared');
    });
  }
});
