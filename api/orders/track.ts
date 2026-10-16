import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

interface MemoryBucket {
  count: number;
  resetAtMs: number;
}
const memoryStore = new Map<string, MemoryBucket>();

let mockDbOverride: any = null;
let mockConfiguredOverride: boolean | null = null;

export function setTrackMockDb(mockDb: any) {
  mockDbOverride = mockDb;
}

export function setTrackConfigured(configured: boolean | null) {
  mockConfiguredOverride = configured;
}

export function resetTrackMemoryRateLimiter(): void {
  memoryStore.clear();
}

export function getClientIp(req: any): string {
  if (!req || !req.headers) return '127.0.0.1';
  let rawIp = '';
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    rawIp = forwarded.split(',')[0].trim();
  } else if (typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip'].length > 0) {
    rawIp = req.headers['x-real-ip'].trim();
  } else {
    rawIp = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  }
  if (rawIp.startsWith('::ffff:')) rawIp = rawIp.slice(7);
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(rawIp)) rawIp = rawIp.split(':')[0];
  return rawIp.trim() || '127.0.0.1';
}

export async function checkRateLimit(
  identifier: string,
  config: { maxRequests: number; windowSeconds: number; prefix: string }
) {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  const key = `ratelimit:${config.prefix}:${encodeURIComponent(identifier || '127.0.0.1')}`;

  if (upstashUrl && upstashToken) {
    try {
      const pipelineRes = await fetch(`${upstashUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, config.windowSeconds, 'NX'],
          ['TTL', key],
        ]),
      });
      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        const count = Number(data[0]?.result) || 1;
        const ttl = Number(data[2]?.result) || config.windowSeconds;
        return {
          allowed: count <= config.maxRequests,
          limit: config.maxRequests,
          remaining: Math.max(0, config.maxRequests - count),
          resetAt: Math.floor(now / 1000) + (ttl > 0 ? ttl : config.windowSeconds),
          mode: 'upstash_redis' as const,
        };
      }
    } catch (err) {}
  }

  let bucket = memoryStore.get(key);
  if (!bucket || bucket.resetAtMs <= now) {
    bucket = { count: 1, resetAtMs: now + config.windowSeconds * 1000 };
    memoryStore.set(key, bucket);
  } else {
    bucket.count += 1;
  }

  return {
    allowed: bucket.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - bucket.count),
    resetAt: Math.ceil(bucket.resetAtMs / 1000),
    mode: 'in_memory_fallback' as const,
  };
}

export function normalizePhoneEgyptian(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return '0' + cleaned.slice(2);
  }
  return cleaned;
}

let appInstance: any = null;

export function isFirebaseAdminConfigured(): boolean {
  if (mockConfiguredOverride !== null) return mockConfiguredOverride;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return true;
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) return true;
  return false;
}

export function getTrackDb(): Firestore {
  if (mockDbOverride) return mockDbOverride;

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
        appInstance = firebase.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pochinki-burger',
        });
      }
    }
  }
  return getFirestore(appInstance);
}

async function resolveAdmin(): Promise<{ adminDb: Firestore; isConfigured: boolean }> {
  try {
    const serverAdmin = await import('../../src/server/firebaseAdmin');
    if (serverAdmin && typeof serverAdmin.getFirebaseAdmin === 'function') {
      return {
        adminDb: serverAdmin.getFirebaseAdmin().adminDb,
        isConfigured: serverAdmin.isFirebaseAdminConfigured(),
      };
    }
  } catch (e) {
    // In Vercel serverless environment, use self-contained getTrackDb
  }
  return {
    adminDb: getTrackDb(),
    isConfigured: isFirebaseAdminConfigured(),
  };
}

export default async function handler(req: any, res: any) {
  try {
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
    if (res.setHeader) {
      res.setHeader('X-RateLimit-Limit', String(rateLimitResult.limit));
      res.setHeader('X-RateLimit-Remaining', String(rateLimitResult.remaining));
      res.setHeader('X-RateLimit-Reset', String(rateLimitResult.resetAt));
      res.setHeader('X-RateLimit-Mode', rateLimitResult.mode);
      if (!rateLimitResult.allowed) {
        const retryAfter = Math.max(1, rateLimitResult.resetAt - Math.floor(Date.now() / 1000));
        res.setHeader('Retry-After', String(retryAfter));
      }
    }

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: 'لقد تجاوزت عدد محاولات الاستعلام المسموح بها، يرجى الانتظار قليلاً والمحاولة لاحقاً.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    const { orderId, phone } = req.query || {};

    if (!orderId || typeof orderId !== 'string' || !phone || typeof phone !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'يرجى تقديم رقم الطلب ورقم الهاتف للمتابعة',
        code: 'MISSING_PARAMS',
      });
    }

    const { adminDb, isConfigured } = await resolveAdmin();

    if (!isConfigured) {
      console.error('[API/orders/track] Firebase Admin credentials not configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'إعدادات خادم المتابعة غير مكتملة (يرجى ضبط متغيرات Firebase Admin في Vercel).',
        code: 'FIREBASE_CREDENTIALS_MISSING',
        details: 'Missing FIREBASE_SERVICE_ACCOUNT_KEY or (FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL) in server environment variables.',
      });
    }
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
