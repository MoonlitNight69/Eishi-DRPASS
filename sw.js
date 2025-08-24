const CACHE_NAME = 'emergency-system-v1.0.1';
const OFFLINE_URL = '/offline.html';

// Critical files to cache immediately for offline functionality
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json'
];

// Install event - cache critical resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching critical files');
        // Use addAll with error handling for each file
        return Promise.all(
          STATIC_CACHE_URLS.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err);
              // Don't fail the entire installation for one file
              return Promise.resolve();
            });
          })
        );
      })
      .then(() => {
        console.log('[SW] Installation complete, taking control immediately');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] Service Worker activated and ready');
    })
  );
});

// Fetch event - implement cache-first strategy with network fallback
self.addEventListener('fetch', (event) => {
  // Skip non-HTTP requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Skip cross-origin requests unless they're for assets we need
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // If we have a cached version, use it
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // Otherwise, fetch from network
        console.log('[SW] Fetching from network:', event.request.url);
        return fetch(event.request.clone())
          .then((networkResponse) => {
            // Check if response is valid
            if (!networkResponse || 
                networkResponse.status !== 200 || 
                networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Cache successful responses for future use
            const responseToCache = networkResponse.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Only cache GET requests
                if (event.request.method === 'GET') {
                  cache.put(event.request, responseToCache);
                }
              })
              .catch((err) => {
                console.warn('[SW] Failed to cache response:', err);
              });

            return networkResponse;
          })
          .catch((error) => {
            console.log('[SW] Network fetch failed:', error);
            
            // For HTML requests, serve the offline page
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match(OFFLINE_URL).then((offlineResponse) => {
                if (offlineResponse) {
                  return offlineResponse;
                }
                
                // Fallback offline HTML if offline.html is not cached
                return new Response(`
                  <!DOCTYPE html>
                  <html lang="en">
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Offline - Emergency System</title>
                    <style>
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                        color: #333;
                      }
                      .offline-container {
                        background: rgba(255, 255, 255, 0.95);
                        padding: 40px;
                        border-radius: 20px;
                        text-align: center;
                        max-width: 400px;
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                      }
                      .offline-icon { font-size: 64px; margin-bottom: 20px; }
                      h1 { color: #dc2626; margin-bottom: 20px; }
                      .btn {
                        background: #3b82f6;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 16px;
                        margin: 10px;
                        text-decoration: none;
                        display: inline-block;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="offline-container">
                      <div class="offline-icon">📱</div>
                      <h1>You're Offline</h1>
                      <p>The Emergency System is working offline. All features are available.</p>
                      <button class="btn" onclick="window.history.back()">Go Back</button>
                      <button class="btn" onclick="location.reload()">Retry Connection</button>
                    </div>
                  </body>
                  </html>
                `, {
                  headers: {
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-cache'
                  }
                });
              });
            }
            
            // For other requests, return a network error
            throw error;
          });
      })
  );
});

// Background Sync for queued data (when connection returns)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'emergency-data-sync') {
    event.waitUntil(syncEmergencyData());
  } else if (event.tag === 'student-scans-sync') {
    event.waitUntil(syncStudentScans());
  }
});

// Push notifications for emergency alerts
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'Emergency notification received',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [300, 100, 300, 100, 300],
    tag: 'emergency-alert',
    requireInteraction: true,
    data: {
      url: '/?emergency=true',
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'Open App',
        icon: '/icons/icon-192.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('🚨 Emergency Alert', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Check if app is already open
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Open new window if app is not open
          if (clients.openWindow) {
            return clients.openWindow('/?emergency=true');
          }
        })
    );
  }
});

// Message handling from the main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'CACHE_EMERGENCY_DATA') {
    // Cache emergency data for offline use
    caches.open(CACHE_NAME).then((cache) => {
      const response = new Response(JSON.stringify(event.data.payload));
      cache.put('/emergency-data.json', response);
    });
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Sync functions
async function syncEmergencyData() {
  try {
    // Get cached emergency data
    const cache = await caches.open(CACHE_NAME);
    const cachedData = await cache.match('/emergency-data.json');
    
    if (cachedData) {
      const data = await cachedData.json();
      console.log('[SW] Syncing emergency data:', data);
      
      // Here you would send the data to your server
      // For now, we'll just log it
      
      // Remove from cache after successful sync
      await cache.delete('/emergency-data.json');
      console.log('[SW] Emergency data synced successfully');
    }
  } catch (error) {
    console.error('[SW] Emergency data sync failed:', error);
    throw error;
  }
}

async function syncStudentScans() {
  try {
    // Get cached student scan data
    const cache = await caches.open(CACHE_NAME);
    const cachedData = await cache.match('/student-scans.json');
    
    if (cachedData) {
      const scans = await cachedData.json();
      console.log('[SW] Syncing student scans:', scans);
      
      // Here you would send scan data to your server
      // For now, we'll just log it
      
      // Remove from cache after successful sync
      await cache.delete('/student-scans.json');
      console.log('[SW] Student scans synced successfully');
    }
  } catch (error) {
    console.error('[SW] Student scans sync failed:', error);
    throw error;
  }
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync triggered:', event.tag);
  
  if (event.tag === 'emergency-system-sync') {
    event.waitUntil(
      Promise.all([
        syncEmergencyData(),
        syncStudentScans()
      ])
    );
  }
});

// Handle app unloading gracefully
self.addEventListener('beforeunload', (event) => {
  console.log('[SW] App is unloading, caching final state...');
  
  // Trigger background sync when app closes
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.sync.register('emergency-data-sync');
    });
  }
});

console.log('[SW] Service Worker script loaded successfully');
