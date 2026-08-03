const SW_VERSION = 'v1';
const CACHES = {
  STATIC: `STATIC_CACHE_${SW_VERSION}`,
  IMAGE: `IMAGE_CACHE_${SW_VERSION}`,
  FONT: `FONT_CACHE_${SW_VERSION}`,
  OFFLINE: `OFFLINE_CACHE_${SW_VERSION}`
};

const OFFLINE_URL = '/offline';

// Logging utility (disabled in production)
const IS_DEV = location.hostname === 'localhost';
const log = (...args) => {
  if (IS_DEV) console.log('[ServiceWorker]', ...args);
};

// LRU Cache Trimming — iterative while loop; prevents stack-overflow on large caches.
const trimCache = async (cacheName, maxItems) => {
  const cache = await caches.open(cacheName);
  let keys = await cache.keys();
  while (keys.length > maxItems) {
    await cache.delete(keys[0]);
    keys = await cache.keys();
  }
};


self.addEventListener('install', (event) => {
  log('SW Installed');
  event.waitUntil(
    caches.open(CACHES.OFFLINE).then((cache) => {
      // Pre-cache the offline page
      return cache.add(OFFLINE_URL);
    })
  );
  // We DO NOT call skipWaiting() here. 
  // We want the user to explicitly accept the update via Toast.
});

self.addEventListener('activate', (event) => {
  log('SW Activated');
  // Disable navigation preload per requirements
  event.waitUntil(
    Promise.all([
      self.registration.navigationPreload ? self.registration.navigationPreload.disable() : Promise.resolve(),
      // Delete old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            const isExpectedCache = Object.values(CACHES).includes(cacheName);
            if (!isExpectedCache) {
              log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Triggered by the client when user clicks "Update" on the toast
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('Received SKIP_WAITING, calling skipWaiting()');
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. MUST NOT BE CACHED: Non-GET requests
  if (request.method !== 'GET') return;

  // 2. MUST NOT BE CACHED: WebSockets and SSE
  if (
    request.headers.get('Upgrade')?.includes('websocket') ||
    request.headers.get('Accept')?.includes('text/event-stream')
  ) {
    return;
  }

  // 3. MUST NOT BE CACHED: Any backend APIs, sensitive user data, trading logic
  // Universal bypass for all APIs per security audit rules.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. MUST NOT BE CACHED: Requests with Authorization or Cookie headers
  if (request.headers.has('Authorization') || request.headers.has('Cookie')) {
    return;
  }

  // Next.js specific HMR / Dev assets shouldn't be heavily cached
  if (IS_DEV && url.pathname.startsWith('/_next/webpack-hmr')) return;

  // --- CACHE STRATEGIES ---

  // Strategy 1: Cache First for Static Assets (Images, Fonts, JS/CSS)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot|ico)$/i)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          log('Cache Hit (Static):', url.pathname);
          return cachedResponse;
        }
        log('Cache Miss (Static):', url.pathname);
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // Determine the correct cache bucket and max sizes
          let targetCache = CACHES.STATIC;
          let maxItems = 100; // generic fallback
          
          if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|ico)$/i)) {
            targetCache = CACHES.IMAGE;
            maxItems = 50;
          } else if (url.pathname.match(/\.(woff|woff2|ttf|eot)$/i)) {
            targetCache = CACHES.FONT;
            maxItems = 20;
          }
          
          const responseToCache = response.clone();
          caches.open(targetCache).then((cache) => {
            cache.put(request, responseToCache).then(() => {
              trimCache(targetCache, maxItems);
            });
          });
          return response;
        });
      })
    );
    return;
  }

  // Strategy 2: Network First for HTML Documents (gracefully degrades to offline page or cached HTML)
  if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Never cache HTTP error pages as "last viewed" offline content —
          // a 502 would otherwise replace the real app shell for offline users.
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHES.OFFLINE).then((cache) => {
              cache.put(request, responseToCache).then(() => {
                 trimCache(CACHES.OFFLINE, 5); // Keep last 5 viewed pages
              });
            });
          }
          return response;
        })
        .catch(() => {
          log('Network Failed, falling back to cache for HTML:', url.pathname);
          // Try to return the exact cached HTML first (for last viewed Dashboard/Journal)
          return caches.match(request).then((cachedHtml) => {
            if (cachedHtml) return cachedHtml;
            // Fallback to the generic offline page
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Strategy 3: Next.js 15 App Router RSC (React Server Component) offline fallback.
  // Client-side navigation fetches RSC JSON payloads with either a `RSC: 1` header
  // or a `?_rsc=` query parameter. These never hit the `navigate` handler above,
  // so without this guard they would hang or crash the React tree when offline.
  const isRscFetch =
    request.headers.get('RSC') === '1' ||
    url.searchParams.has('_rsc');

  if (isRscFetch) {
    event.respondWith(
      fetch(request).catch(() => {
        log('Offline: RSC fetch failed, returning offline JSON:', url.pathname);
        return new Response(
          JSON.stringify({ error: 'offline', message: 'You are offline. Please reconnect and try again.' }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'X-SW-Offline': '1',
            },
          }
        );
      })
    );
    return;
  }

  // Strategy 4: Default Network First for anything else that wasn't excluded
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// --- PUSH NOTIFICATIONS (Phase 5 Scaffolding) ---
self.addEventListener('push', (event) => {
  // Wrap in try/catch — event.data.json() throws on plain-string or malformed payloads.
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // Types: MARKET_OPEN, MARKET_CLOSE, CPR_BREAKOUT, BTST_SIGNAL, STBT_SIGNAL, INDEX_SIGNAL, TRADE_REMINDER, JOURNAL_REMINDER, SYSTEM_ALERT
  const title = data.title || 'CPR Trading Platform';
  const options = {
    body: data.body || 'You have a new alert.',
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-192x192.svg',
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === event.notification.data && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data);
      }
    })
  );
});

// --- BACKGROUND SYNC (Phase 9 Scaffolding) ---
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-trade-journal') {
    log('Background sync triggered for trade journal');
    // Implement background sync logic here later
  }
});
