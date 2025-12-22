// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
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
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
