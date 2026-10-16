import { isFirebaseAdminConfigured } from '../src/server/firebaseAdmin';

export default function handler(req: any, res: any) {
  try {
    const configured = isFirebaseAdminConfigured();
    res.status(200).json({ status: 'ok', configured });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message, stack: err?.stack });
  }
}
