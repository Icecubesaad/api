// Firebase Cloud Messaging Service Worker
// Config is loaded from /api/firebase-config endpoint
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config will be set by the main app via postMessage
let firebaseInitialized = false;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG' && !firebaseInitialized) {
    firebase.initializeApp(event.data.config);
    firebaseInitialized = true;
    initializeMessaging();
  }
});

function initializeMessaging() {
  const messaging = firebase.messaging();

  // Handle background messages
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);
    
    const notificationTitle = payload.notification?.title || 'JobMate Notification';
    const notificationOptions = {
      body: payload.notification?.body || 'You have a new notification',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: payload.data?.reminderId || 'jobmate-notification',
      data: payload.data,
      actions: [
        { action: 'checkin', title: '✅ Check In' },
        { action: 'dismiss', title: '❌ Dismiss' }
      ]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  
  // Build URL with check-in data
  let url = '/';
  if (data.action === 'checkin' || data.type === 'reminder_checkin') {
    url = `/?checkin=true&reminderId=${data.reminderId || ''}&eventTitle=${encodeURIComponent(data.eventTitle || '')}&projectId=${data.projectId || ''}`;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'CHECKIN_NOTIFICATION',
            data: data,
            notification: {
              title: event.notification.title,
              body: event.notification.body,
            }
          });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
