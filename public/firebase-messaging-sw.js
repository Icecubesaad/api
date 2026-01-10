// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase web config (these are public keys, safe to expose)
// Update these values from your Firebase Console -> Project Settings -> General -> Your apps
firebase.initializeApp({
  apiKey: "AIzaSyBcS21HPdSxotT7an5HcOsPs8vKzCFahqI",
  authDomain: "jobmate-122bd.firebaseapp.com",
  projectId: "jobmate-122bd",
  storageBucket: "jobmate-122bd.firebasestorage.app",
  messagingSenderId: "119527345940",
  appId: "1:119527345940:web:7d07c3f709bf7e068e7c01"
});

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
    requireInteraction: true,
    actions: [
      { action: 'checkin', title: '✅ Check In' },
      { action: 'dismiss', title: '❌ Dismiss' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked:', event);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  
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
