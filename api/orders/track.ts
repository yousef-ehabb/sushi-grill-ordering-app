import { getFirebaseAdmin, isFirebaseAdminConfigured } from '../../src/server/firebaseAdmin';
import { normalizePhoneEgyptian } from '../../src/server/orderEngine';
import { getClientIp, checkRateLimit, applyRateLimitHeaders } from '../../src/server/rateLimiter';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Rate Limiting Protection (30 track queries per 5 minutes per IP)
  const clientIp = getClientIp(req);
  const rateLimitResult = await checkRateLimit(clientIp, {
    prefix: 'order_track',
    maxRequests: 30,
    windowSeconds: 300,
  });
  applyRateLimitHeaders(res, rateLimitResult);

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      success: false,
      error: 'لقد تجاوزت عدد محاولات الاستعلام المسموح بها، يرجى الانتظار قليلاً والمحاولة لاحقاً.',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  }

  const { orderId, phone } = req.query;

  if (!orderId || typeof orderId !== 'string' || !phone || typeof phone !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'يرجى تقديم رقم الطلب ورقم الهاتف للمتابعة',
      code: 'MISSING_PARAMS',
    });
  }

  try {
    if (!isFirebaseAdminConfigured()) {
      console.error('[API/orders/track] Firebase Admin credentials not configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'إعدادات خادم المتابعة غير مكتملة (يرجى ضبط متغيرات Firebase Admin في Vercel).',
        code: 'FIREBASE_CREDENTIALS_MISSING',
        details: 'Missing FIREBASE_SERVICE_ACCOUNT_KEY or (FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL) in server environment variables.',
      });
    }

    const { adminDb } = getFirebaseAdmin();
    const normalizedInputPhone = normalizePhoneEgyptian(phone.trim());

    const cleanLookup = orderId.trim();
    let orderDoc: any = null;

    // 1. If lookup is numeric (e.g. "1001"), check by order_number first
    if (/^\d+$/.test(cleanLookup)) {
      const numericOrderNum = parseInt(cleanLookup, 10);
      const querySnap = await adminDb
        .collection('orders')
        .where('order_number', '==', numericOrderNum)
        .limit(1)
        .get();

      if (!querySnap.empty && querySnap.docs.length > 0) {
        orderDoc = querySnap.docs[0];
      }
    }

    // 2. Fallback: Lookup by Firestore document ID (supports legacy IDs or direct doc refs)
    if (!orderDoc) {
      const directDoc = await adminDb.collection('orders').doc(cleanLookup).get();
      if (directDoc.exists) {
        orderDoc = directDoc;
      }
    }

    if (!orderDoc || !orderDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على الطلب المطلوب',
        code: 'NOT_FOUND',
      });
    }

    const data = orderDoc.data() || {};
    const storedPhone = normalizePhoneEgyptian(data.customer_phone || '');

    // Prevent cross-customer enumeration: require exact phone match
    if (storedPhone !== normalizedInputPhone) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على الطلب المطلوب',
        code: 'NOT_FOUND',
      });
    }

    // Return sanitized public tracking representation
    return res.status(200).json({
      success: true,
      order: {
        id: orderDoc.id,
        order_number: data.order_number || null,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        status: data.status,
        type: data.type,
        branch: data.branch,
        subtotal: data.subtotal,
        delivery_fee: data.delivery_fee,
        total: data.total,
        created_at: data.created_at,
        items: data.items,
      },
    });
  } catch (err: any) {
    console.error('[API/orders/track] Error fetching order:', err);
    const isCredentialsError =
      err?.message?.includes('Could not load the default credentials') ||
      err?.message?.includes('NO_ADC_FOUND') ||
      err?.code === 16;

    return res.status(500).json({
      success: false,
      error: isCredentialsError
        ? 'إعدادات خادم المتابعة غير مكتملة (يرجى ضبط متغيرات Firebase Admin في Vercel).'
        : 'تعذر تحميل بيانات الطلب حالياً',
      code: isCredentialsError ? 'FIREBASE_CREDENTIALS_MISSING' : 'SERVER_ERROR',
      details: err?.message,
    });
  }
}
