# Firebase Configuration Guide

This document explains how Firebase is configured in the JobMate application.

## Overview

JobMate uses Firebase for:
- **Authentication**: Google Sign-In via Firebase Auth
- **Push Notifications**: Firebase Cloud Messaging (FCM)

## Configuration Files

### Backend Configuration (.env)

The backend uses Firebase Admin SDK with service account credentials:

```env
FIREBASE_PROJECT_ID=jobmate-122bd
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@jobmate-122bd.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FCM_SERVER_KEY=119527345940
```

### Frontend Configuration

#### 1. Firebase Test Page (`public/firebase-test.html`)
The test page uses the Firebase client SDK with the following configuration:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBqsjyXHLtYUbzUeZ4HnsT8awjoI-BVQ8U",
  authDomain: "jobmate-122bd.firebaseapp.com",
  projectId: "jobmate-122bd",
  storageBucket: "jobmate-122bd.firebasestorage.app",
  messagingSenderId: "119527345940",
  appId: "1:119527345940:web:a533a9afaa0819ac44f0c3",
  measurementId: "G-G5WX61SLH6"
};
```

#### 2. Service Worker (`public/firebase-messaging-sw.js`)
The service worker handles background push notifications with the same configuration.

#### 3. TypeScript Config (`src/config/firebase.config.ts`)
Centralized Firebase client configuration for TypeScript imports.

## Security

### Service Account Key
The Firebase service account key is stored in:
- `.env` file (for backend)
- `firebase-service-account.json` (reference file, gitignored)

**Important**: Never commit these files to version control!

### .gitignore Entries
```
firebase-service-account.json
*-firebase-adminsdk-*.json
```

## Testing Firebase Integration

### 1. Start the Application
```bash
npm run start:dev
```

### 2. Open Firebase Test Page
Navigate to: `http://localhost:3000/firebase-test.html`

### 3. Test Authentication
1. Click "Sign in with Google (Popup)" or "Sign in with Google (Redirect)"
2. Complete Google authentication
3. Verify the ID token is obtained
4. Click "Test /auth/google-signin" to authenticate with backend
5. Verify JWT token is received

### 4. Test Push Notifications
1. After signing in, click "Enable Notifications"
2. Grant notification permission when prompted
3. Verify FCM token is obtained
4. Click "Register Token with Backend" to save the token
5. Backend can now send push notifications to this device

## Firebase Console Setup

To get these credentials from Firebase Console:

### 1. Service Account Key (Backend)
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Download the JSON file
4. Extract values for `.env`:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

### 2. Web App Config (Frontend)
1. Go to Firebase Console → Project Settings → General
2. Scroll to "Your apps" section
3. Select your web app or create a new one
4. Copy the `firebaseConfig` object
5. Update `public/firebase-test.html` and `src/config/firebase.config.ts`

### 3. FCM Server Key
1. Go to Firebase Console → Project Settings → Cloud Messaging
2. Copy the "Sender ID" (messagingSenderId)
3. Update `FCM_SERVER_KEY` in `.env`

## Architecture

### Backend (NestJS)
- `src/auth/firebase.strategy.ts` - Passport strategy for Firebase JWT validation
- `src/auth/firebase-auth.guard.ts` - Guard for protecting routes with Firebase auth
- `src/auth/auth.service.ts` - Handles Google Sign-In with Firebase tokens
- `src/notifications/notifications.service.ts` - Sends push notifications via FCM

### Frontend (HTML/JavaScript)
- `public/firebase-test.html` - Test page for Firebase features
- `public/firebase-messaging-sw.js` - Service worker for background notifications
- `src/config/firebase.config.ts` - TypeScript configuration export

## Troubleshooting

### "Firebase Admin initialization failed"
- Check that `.env` has valid credentials
- Ensure private key includes `BEGIN PRIVATE KEY` and `END PRIVATE KEY`
- Verify no extra quotes or escaping issues

### "Invalid Google token"
- Ensure frontend uses the same Firebase project
- Check that `authDomain` matches in both frontend and Firebase Console
- Verify Google Sign-In is enabled in Firebase Console → Authentication

### "No FCM token"
- Ensure HTTPS or localhost (required for service workers)
- Check notification permissions are granted
- Verify service worker is registered successfully
- Check browser console for errors

## Current Configuration

**Project**: jobmate-122bd  
**Sender ID**: 119527345940  
**Auth Domain**: jobmate-122bd.firebaseapp.com  
**Service Account**: firebase-adminsdk-fbsvc@jobmate-122bd.iam.gserviceaccount.com
