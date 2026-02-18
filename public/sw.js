// Service Worker for Push Notifications
// Handles push notifications even when the app is closed

const CACHE_NAME = 'sushi-grill-v1';
const NOTIFICATION_TITLE = 'سوشي أند جريل';

// Install event - cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  let data = {};
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: event.data.text() || NOTIFICATION_TITLE };
    }
  }

  const title = data.title || NOTIFICATION_TITLE;
  const options = {
    body: data.body || 'لديك عناصر في سلة المشتريات',
    icon: '/logo.jpg',
    badge: '/logo.jpg',
    image: data.image || '/logo.jpg',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || 'abandoned-cart',
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      orderId: data.orderId || null,
    },
    actions: data.actions || [
      {
        action: 'view',
        title: 'عرض السلة',
      },
      {
        action: 'dismiss',
        title: 'إغلاق',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event - open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clientList) => {
        // If app is already open, focus it
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification action buttons
self.addEventListener('notificationclick', (event) => {
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
  event.notification.close();
});

