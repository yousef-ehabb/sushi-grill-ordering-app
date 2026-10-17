import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';

/**
 * Firebase Configuration for Pochinki Burger
 * Configured via Vite environment variables
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== 'your-api-key' &&
    firebaseConfig.projectId !== 'your-project-id'
  );
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export const ensureAnonymousAuth = async (): Promise<void> => {
  if (!isFirebaseConfigured() || !auth) return;
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
  } catch (error) {
    // If anonymous auth is disabled or unavailable, public rules guarantee access
    console.debug('[Firebase] Anonymous sign-in attempt completed:', error);
  }
};

if (isFirebaseConfigured()) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    
    // Enable multi-tab offline persistence with auto-detect long polling and undefined property safety
    try {
      db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      // Fallback if Firestore was already initialized (e.g. fast refresh/HMR)
      db = getFirestore(app);
    }

    auth = getAuth(app);

    // Auto sign in anonymously for guests if not authenticated
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        ensureAnonymousAuth().catch(() => {});
      }
    });
  } catch (error) {
    console.warn('[Firebase] Initialization error. App will fallback to resilient mock data:', error);
  }
} else {
  console.info(
    '[Firebase] Running in Mock/Offline mode. Add your Firebase keys in .env to connect to live Firestore.'
  );
}

export { app, db, auth, firebaseConfig };

