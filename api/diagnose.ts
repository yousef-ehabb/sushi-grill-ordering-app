export default async function handler(req: any, res: any) {
  const steps: any[] = [];
  try {
    steps.push('start');
    
    // step 1: test admin import
    const admin = await import('firebase-admin');
    steps.push({ step: 'firebase-admin', ok: true });
    
    // step 2: test firestore import
    const firestore = await import('firebase-admin/firestore');
    steps.push({ step: 'firebase-admin/firestore', ok: true });

    // step 3: test rateLimiter import
    const rateLimiter = await import('../src/server/rateLimiter');
    steps.push({ step: 'rateLimiter', ok: true });

    // step 4: test firebaseAdmin import
    const firebaseAdmin = await import('../src/server/firebaseAdmin');
    steps.push({ step: 'firebaseAdmin', ok: true });

    // step 5: test getFirebaseAdmin execution
    const adminInst = firebaseAdmin.getFirebaseAdmin();
    steps.push({ step: 'getFirebaseAdmin()', ok: true, hasDb: !!adminInst.adminDb });

    // step 6: test orderEngine import
    const orderEngine = await import('../src/server/orderEngine');
    steps.push({ step: 'orderEngine', ok: true });

    res.status(200).json({ success: true, steps });
  } catch (err: any) {
    res.status(500).json({ success: false, steps, error: err?.message, stack: err?.stack });
  }
}
