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

function parseFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(parseFirestoreValue);
  }
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  return val;
}

function parseFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    res[k] = parseFirestoreValue(v);
  }
  const nameParts = (doc.name || '').split('/');
  res.id = nameParts[nameParts.length - 1];
  return res;
}

async function fetchOrderViaRest(orderLookup: string): Promise<any | null> {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'pochinki-burger';
  const clean = orderLookup.replace(/^#/, '').trim();

  // 1. If numeric order number, query by order_number
  if (/^\d+$/.test(clean)) {
    const num = parseInt(clean, 10);
    try {
      const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
      const qRes = await fetch(runQueryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'orders' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'order_number' },
                op: 'EQUAL',
                value: { integerValue: num },
              },
            },
            limit: 1,
          },
        }),
      });
      if (qRes.ok) {
        const queryResults = await qRes.json();
        if (Array.isArray(queryResults) && queryResults[0]?.document) {
          return parseFirestoreDoc(queryResults[0].document);
        }
      }
    } catch (e) {
      console.warn('[TrackAPI] REST query failed for numeric order:', e);
    }
  }

  // 2. Direct document fetch by ID
  try {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/orders/${clean}`;
    const docRes = await fetch(docUrl);
    if (docRes.ok) {
      const docData = await docRes.json();
      return parseFirestoreDoc(docData);
    }
  } catch (e) {
    console.warn('[TrackAPI] REST direct doc fetch failed:', e);
  }

  return null;
}

export default async function handler(req: any, res: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // Rate Limiting Protection (60 track queries per 5 minutes per IP)
    const clientIp = getClientIp(req);
    const rateLimitResult = await checkRateLimit(clientIp, {
      prefix: 'order_track',
      maxRequests: 60,
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

    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'يرجى تقديم رقم أو معرّف الطلب للمتابعة',
        code: 'MISSING_PARAMS',
      });
    }

    const cleanLookup = orderId.replace(/^#/, '').trim();
    const inputPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedInputPhone = inputPhone ? normalizePhoneEgyptian(inputPhone) : '';

    let orderData: any = null;

    // Try resolving via Firebase Admin first
    const { adminDb, isConfigured } = await resolveAdmin();

    if (isConfigured && adminDb) {
      try {
        if (/^\d+$/.test(cleanLookup)) {
          const numericOrderNum = parseInt(cleanLookup, 10);
          const querySnap = await adminDb
            .collection('orders')
            .where('order_number', '==', numericOrderNum)
            .limit(1)
            .get();

          if (!querySnap.empty && querySnap.docs.length > 0) {
            orderData = { id: querySnap.docs[0].id, ...querySnap.docs[0].data() };
          }
        }

        if (!orderData) {
          const directDoc = await adminDb.collection('orders').doc(cleanLookup).get();
          if (directDoc.exists) {
            orderData = { id: directDoc.id, ...directDoc.data() };
          }
        }
      } catch (adminErr) {
        console.warn('[TrackAPI] Admin SDK fetch failed, falling back to REST API:', adminErr);
      }
    }

    // Fallback: Query Firestore REST API directly (public read enabled in security rules)
    if (!orderData) {
      orderData = await fetchOrderViaRest(cleanLookup);
    }

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'لم يتم العثور على الطلب المطلوب',
        code: 'NOT_FOUND',
      });
    }

    // Phone verification:
    // If phone is provided, ensure it matches customer phone
    // If phone is not provided, allow if lookup is a long unique doc ID (length >= 15);
    // require phone if lookup is numeric order number
    const storedPhone = normalizePhoneEgyptian(orderData.customer_phone || '');
    if (normalizedInputPhone) {
      if (storedPhone && storedPhone !== normalizedInputPhone) {
        return res.status(404).json({
          success: false,
          error: 'لم يتم العثور على الطلب المطلوب بهذا الرقم',
          code: 'NOT_FOUND',
        });
      }
    } else if (/^\d+$/.test(cleanLookup) && storedPhone) {
      return res.status(400).json({
        success: false,
        error: 'يرجى تقديم رقم الهاتف لتأكيد هوية صاحب الطلب',
        code: 'PHONE_REQUIRED',
      });
    }

    // Return sanitized live tracking representation
    return res.status(200).json({
      success: true,
      order: {
        id: orderData.id,
        order_number: orderData.order_number || null,
        customer_name: orderData.customer_name,
        customer_phone: orderData.customer_phone,
        status: orderData.status,
        type: orderData.type,
        branch: orderData.branch,
        subtotal: orderData.subtotal,
        delivery_fee: orderData.delivery_fee,
        total: orderData.total,
        created_at: orderData.created_at,
        items: orderData.items,
      },
    });
  } catch (err: any) {
    console.error('[API/orders/track] Error fetching order:', err);
    return res.status(500).json({
      success: false,
      error: 'تعذر تحميل بيانات الطلب حالياً',
      code: 'SERVER_ERROR',
      details: err?.message,
    });
  }
}
