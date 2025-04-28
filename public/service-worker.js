// Service Worker Version
const CACHE_VERSION = 'v1';
const CACHE_NAME = `smallbizagent-cache-${CACHE_VERSION}`;

// Assets to cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/badge-72x72.png'
];

// Install handler: Cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate handler: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('smallbizagent-cache-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler: Serve from cache, falling back to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests and API calls
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('/api/') ||
    event.request.url.includes('/ws')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // Clone the request - request is a stream that can only be consumed once
        const fetchRequest = event.request.clone();

        // Make network request
        return fetch(fetchRequest)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response - it's a stream that can only be consumed once
            const responseToCache = response.clone();

            // Cache the new resource
            caches.open(CACHE_NAME)
              .then(cache => {
                // Don't cache API responses
                if (!event.request.url.includes('/api/')) {
                  cache.put(event.request, responseToCache);
                }
              });

            return response;
          })
          .catch(() => {
            // If network request fails and it's an HTML page, serve the offline page
            if (event.request.headers.get('Accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// Handle push notifications (if needed in the future)
self.addEventListener('push', event => {
  const options = {
    body: event.data.text(),
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'View'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('SmallBizAgent', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'explore') {
    clients.openWindow('/');
  } else {
    clients.openWindow('/');
  }
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});