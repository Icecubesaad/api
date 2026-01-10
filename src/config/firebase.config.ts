// Firebase Client Configuration
// IMPORTANT: This must match the Firebase project used in the backend (.env)
// Current project: jobmate-122bd
export const firebaseConfig = {
  apiKey: "AIzaSyBcS21HPdSxotT7an5HcOsPs8vKzCFahqI",
  authDomain: "jobmate-122bd.firebaseapp.com",
  projectId: "jobmate-122bd",
  storageBucket: "jobmate-122bd.firebasestorage.app",
  messagingSenderId: "119527345940",
  appId: "1:119527345940:web:7d07c3f709bf7e068e7c01"
};

// VAPID Key for Web Push Notifications
// Get this from: Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// Generate a key pair if you don't have one
export const VAPID_KEY = 'YOUR_VAPID_KEY_HERE'; // TODO: Replace with actual VAPID key from Firebase Console