import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import type { App } from 'firebase-admin/app';

let appInstance: App | null = null;

export function isFirebaseAdminConfigured(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return true;
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) return true;
  return false;
}

export function getFirebaseAdmin(): {
  adminApp: App;
  adminDb: Firestore;
  adminAuth: Auth;
} {
  const firebase = (admin as any).default || admin;

  if (!appInstance) {
    const existingApps = firebase.apps;
    if (existingApps && existingApps.length > 0 && existingApps[0]) {
      appInstance = existingApps[0];
    } else {
      const certFn = firebase.cert || (firebase.credential && firebase.credential.cert);
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccountKey) {
        try {
          const parsed = JSON.parse(serviceAccountKey);
          appInstance = firebase.initializeApp({
            credential: certFn ? certFn(parsed) : undefined,
            projectId: parsed.project_id || process.env.VITE_FIREBASE_PROJECT_ID || 'pochinki-burger',
          });
        } catch (err) {
          console.error('[FirebaseAdmin] Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:', err);
        }
      }

      if (!appInstance && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        try {
          const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
          appInstance = firebase.initializeApp({
            credential: certFn
              ? certFn({
                  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pochinki-burger',
                  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                  privateKey,
                })
              : undefined,
          });
        } catch (err) {
          console.error('[FirebaseAdmin] Error initializing with private key env vars:', err);
        }
      }

      if (!appInstance) {
        console.warn(
          '[FirebaseAdmin] Warning: Neither FIREBASE_SERVICE_ACCOUNT_KEY nor (FIREBASE_PRIVATE_KEY & FIREBASE_CLIENT_EMAIL) are configured. ' +
          'Falling back to default credentials which may fail in serverless cloud environments (e.g. Vercel).'
        );
        appInstance = firebase.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pochinki-burger',
        });
      }
    }
  }

  return {
    adminApp: appInstance as App,
    adminDb: getFirestore(appInstance as App),
    adminAuth: getAuth(appInstance as App),
  };
}
