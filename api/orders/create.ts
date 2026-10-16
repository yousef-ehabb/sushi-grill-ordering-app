import { getFirebaseAdmin, isFirebaseAdminConfigured } from '../../src/server/firebaseAdmin';
import { processOrderCreation } from '../../src/server/orderEngine';
import { getClientIp, checkRateLimit, applyRateLimitHeaders } from '../../src/server/rateLimiter';

export default async function handler(req: any, res: any) {
  try {
    // 1. CORS & Preflight handling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // 2. Rate Limiting Protection (10 orders per 10 minutes per IP)
    const clientIp = getClientIp(req);
    const rateLimitResult = await checkRateLimit(clientIp, {
      prefix: 'order_create',
      maxRequests: 10,
      windowSeconds: 600,
    });
    applyRateLimitHeaders(res, rateLimitResult);

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: 'لقد تجاوزت الحد المسموح به من الطلبات مؤقتاً، يرجى الانتظار والمحاولة لاحقاً.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }
    if (!isFirebaseAdminConfigured()) {
      console.error('[API/create-order] Firebase Admin credentials not configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'إعدادات خادم قاعدة البيانات غير مكتملة (يرجى ضبط متغيرات Firebase Admin في Vercel).',
        code: 'FIREBASE_CREDENTIALS_MISSING',
        details: 'Missing FIREBASE_SERVICE_ACCOUNT_KEY or (FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL) in server environment variables.',
      });
    }

    const { adminDb, adminAuth } = getFirebaseAdmin();

    // 2. Authentication extraction (optional for guests, verified for signed-in users)
    let authenticatedUserId: string | null = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1]?.trim();
      if (idToken) {
        try {
          const decoded = await adminAuth.verifyIdToken(idToken);
          authenticatedUserId = decoded.uid;
        } catch (tokenErr) {
          console.warn('[API/create-order] Invalid auth token provided:', tokenErr);
          return res.status(401).json({
            success: false,
            error: 'جلسة تسجيل الدخول غير صالحة أو منتهية، يرجى إعادة تسجيل الدخول',
            code: 'INVALID_TOKEN',
          });
        }
      }
    }

    // 3. Parse body
    let body: any;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        error: 'صيغة البيانات غير صحيحة (JSON غير صالح)',
        code: 'INVALID_JSON',
      });
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'بيانات الطلب غير صالحة',
        code: 'INVALID_PAYLOAD',
      });
    }

    // 4. Server-authoritative order processing
    const result = await processOrderCreation(adminDb, body, authenticatedUserId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: result.code,
      });
    }

    return res.status(200).json({
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      subtotal: result.subtotal,
      deliveryFee: result.deliveryFee,
      isDuplicate: result.isDuplicate,
    });
  } catch (error: any) {
    console.error('[API/create-order] Internal error:', error);
    const isCredentialsError =
      error?.message?.includes('Could not load the default credentials') ||
      error?.message?.includes('NO_ADC_FOUND') ||
      error?.code === 16;

    return res.status(500).json({
      success: false,
      error: isCredentialsError
        ? 'إعدادات خادم قاعدة البيانات غير مكتملة (يرجى ضبط متغيرات Firebase Admin في Vercel).'
        : 'حدث خطأ غير متوقع في معالجة طلبك، يرجى المحاولة مرة أخرى.',
      code: isCredentialsError ? 'FIREBASE_CREDENTIALS_MISSING' : 'SERVER_ERROR',
      details: error?.message,
    });
  }
}
