import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req: any, res: any) {
  try {
    const firebase = (admin as any).default || admin;
    const existingApps = firebase.apps;
    let app: any;
    if (existingApps && existingApps.length > 0) {
      app = existingApps[0];
    } else {
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (serviceAccountKey) {
        const parsed = JSON.parse(serviceAccountKey);
        const certFn = firebase.cert || (firebase.credential && firebase.credential.cert);
        app = firebase.initializeApp({
          credential: certFn ? certFn(parsed) : undefined,
          projectId: parsed.project_id || 'pochinki-burger',
        });
      } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
      }
    }

    const db = getFirestore(app);
    const snap = await db.collection('orders').limit(3).get();
    const orders = snap.docs.map(doc => ({ id: doc.id, order_number: doc.data().order_number }));

    res.status(200).json({
      success: true,
      message: 'Self-contained endpoint connected and queried Firestore successfully!',
      count: orders.length,
      orders,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message,
      stack: err?.stack,
    });
  }
}
