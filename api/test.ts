import admin from 'firebase-admin';

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
        app = firebase.initializeApp({
          credential: firebase.credential.cert(parsed),
          projectId: parsed.project_id || 'pochinki-burger',
        });
      } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
      }
    }

    const db = firebase.firestore(app);
    const collections = await db.listCollections();
    const collectionIds = collections.map((c: any) => c.id);

    res.status(200).json({
      status: 'ok',
      connected: true,
      collections: collectionIds,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err?.message,
      stack: err?.stack,
    });
  }
}
