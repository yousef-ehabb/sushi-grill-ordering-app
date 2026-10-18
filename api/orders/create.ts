import admin from 'firebase-admin';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// ----------------- Self-Contained Fallbacks for Vercel Serverless Runtime -----------------

interface MemoryBucket {
  count: number;
  resetAtMs: number;
}
const memoryStore = new Map<string, MemoryBucket>();

let appInstance: any = null;

function isCreateFirebaseConfigured(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return true;
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) return true;
  return false;
}

function initFirebaseApp() {
  const firebase = (admin as any).default || admin;
  if (!appInstance) {
    const existing = firebase.apps;
    if (existing && existing.length > 0 && existing[0]) {
      appInstance = existing[0];
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
          console.error('[FirebaseAdmin] Error parsing key in create order:', err);
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
          console.error('[FirebaseAdmin] Error initializing key in create order:', err);
        }
      }

      if (!appInstance) {
        appInstance = firebase.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'pochinki-burger',
        });
      }
    }
  }
  return appInstance;
}

function getCreateDb(): Firestore {
  const app = initFirebaseApp();
  return getFirestore(app);
}

function getCreateAuth(): any {
  const firebase = (admin as any).default || admin;
  const app = initFirebaseApp();
  if (typeof firebase.auth === 'function') {
    return firebase.auth(app);
  }
  return {
    verifyIdToken: async () => {
      throw new Error('Auth verifyIdToken unavailable');
    },
  };
}

function getFieldValue(): any {
  const firebase = (admin as any).default || admin;
  if (firebase.firestore && firebase.firestore.FieldValue) {
    return firebase.firestore.FieldValue;
  }
  return {
    serverTimestamp: () => new Date().toISOString(),
    increment: (n: number) => n,
  };
}

function localGetClientIp(req: any): string {
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

async function localCheckRateLimit(
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

function localApplyRateLimitHeaders(res: any, result: any): void {
  if (!res || !res.setHeader) return;
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetAt));
  res.setHeader('X-RateLimit-Mode', result.mode);
  if (!result.allowed) {
    const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
    res.setHeader('Retry-After', String(retryAfter));
  }
}

function validateEgyptianPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  if (/^01[0125][0-9]{8}$/.test(cleaned)) return true;
  if (/^201[0125][0-9]{8}$/.test(cleaned)) return true;
  return false;
}

function cleanEgyptianPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return '0' + cleaned.slice(2);
  }
  return cleaned;
}

async function localProcessOrderCreation(
  db: Firestore,
  payload: any,
  authenticatedUserId: string | null = null,
  fieldValueFactory: any = getFieldValue()
) {
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'بيانات الطلب غير صالحة', code: 'INVALID_PAYLOAD' };
  }

  const name = typeof payload.customer_name === 'string' ? payload.customer_name.trim() : '';
  if (!name || name.length < 2 || name.length > 100) {
    return { success: false, error: 'يرجى إدخال اسم صحيح (بين 2 و 100 حرف)', code: 'INVALID_NAME' };
  }

  const rawPhone = typeof payload.customer_phone === 'string' ? payload.customer_phone.trim() : '';
  if (!validateEgyptianPhone(rawPhone)) {
    return { success: false, error: 'يرجى إدخال رقم هاتف مصري صحيح (11 رقم يبدأ بـ 01)', code: 'INVALID_PHONE' };
  }
  const normalizedPhone = cleanEgyptianPhone(rawPhone);

  if (payload.type !== 'pickup' && payload.type !== 'delivery') {
    return { success: false, error: 'نوع الطلب يجب أن يكون استلام أو توصيل', code: 'INVALID_ORDER_TYPE' };
  }

  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  if (payload.type === 'delivery') {
    if (!address || address.length < 3 || address.length > 250) {
      return { success: false, error: 'يرجى إدخال عنوان توصيل صحيح (3 أحرف على الأقل)', code: 'INVALID_ADDRESS' };
    }
  }

  const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
  if (!branch) {
    return { success: false, error: 'يرجى تحديد الفرع', code: 'INVALID_BRANCH' };
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { success: false, error: 'سلة المشتريات فارغة', code: 'EMPTY_CART' };
  }

  if (payload.items.length > 30) {
    return { success: false, error: 'تجاوزت الحد الأقصى للأصناف في طلب واحد (30 صنف)', code: 'TOO_MANY_ITEMS' };
  }

  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : null;

  if (settings) {
    if (settings.is_website_open === false) {
      const closedMessage = settings.closed_message || 'المطعم مغلق حالياً ولا يستقبل طلبات جديدة.';
      return { success: false, error: closedMessage, code: 'WEBSITE_CLOSED' };
    }

    if (settings.branches && typeof settings.branches === 'object' && Object.keys(settings.branches).length > 0) {
      const branchConfig = settings.branches[branch];
      if (!branchConfig) {
        return { success: false, error: `الفرع المحدد (${branch}) غير موجود في النظام`, code: 'INVALID_BRANCH' };
      }
      if (branchConfig.is_open === false) {
        return { success: false, error: `${branch} مغلق حالياً ولا يستقبل طلبات جديدة.`, code: 'BRANCH_CLOSED' };
      }
    }
  }

  const verifiedItems: any[] = [];
  let calculatedSubtotal = 0;

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i];
    if (!item || !item.product_id) {
      return { success: false, error: `بيانات الصنف رقم ${i + 1} غير صحيحة`, code: 'INVALID_ITEM' };
    }

    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      return { success: false, error: 'الكمية غير صالحة (يجب أن تكون بين 1 و 50)', code: 'INVALID_QUANTITY' };
    }

    const productDoc = await db.collection('products').doc(item.product_id).get();
    if (!productDoc.exists) {
      return { success: false, error: `أحد الأصناف المطلوبة غير موجود بالقائمة`, code: 'PRODUCT_NOT_FOUND' };
    }

    const productData = productDoc.data() || {};
    if (productData.is_available === false) {
      return { success: false, error: `الصنف "${productData.name_ar || 'المطلوب'}" غير متوفر حالياً`, code: 'PRODUCT_UNAVAILABLE' };
    }

    if (productData.branch_availability && productData.branch_availability[branch] === false) {
      return { success: false, error: `الصنف "${productData.name_ar || 'المطلوب'}" غير متاح في ${branch}`, code: 'BRANCH_UNAVAILABLE' };
    }

    const basePrice = Number(productData.price) || 0;
    if (basePrice < 0) {
      return { success: false, error: 'سعر الصنف غير صالح في النظام', code: 'INVALID_PRICE' };
    }

    let optionsPriceTotal = 0;
    const selectedOptionIds = Array.isArray(item.selected_option_ids)
      ? item.selected_option_ids.filter((id: any) => typeof id === 'string')
      : [];

    if (selectedOptionIds.length > 15) {
      return { success: false, error: 'تجاوزت الحد الأقصى للإضافات للصنف الواحد', code: 'TOO_MANY_OPTIONS' };
    }

    const resolvedOptionIds: string[] = [];
    for (const rawOptId of selectedOptionIds) {
      let optId = rawOptId;
      let optDoc = await db.collection('options').doc(optId).get();

      // Backward-compatible aliasing for legacy / product-suffixed option IDs (e.g. opt-hot-prod-akm)
      if (!optDoc.exists) {
        const legacyPrefixMap: Record<string, string> = {
          'opt-hot': 'opt-spicy-sauce',
          'opt-spicy': 'opt-spicy-sauce',
          'opt-ranch': 'opt-ranch-sauce',
          'opt-texas': 'opt-texas-sauce',
          'opt-cheddar': 'opt-cheddar-sauce',
          'opt-extra-fries': 'opt-extra-fries-sauce',
        };
        for (const [prefix, targetId] of Object.entries(legacyPrefixMap)) {
          if (rawOptId.startsWith(prefix)) {
            const candidateDoc = await db.collection('options').doc(targetId).get();
            if (candidateDoc.exists) {
              optDoc = candidateDoc;
              optId = targetId;
              break;
            }
          }
        }
      }

      if (!optDoc.exists) {
        return { success: false, error: `أحد الإضافات المطلوبة غير موجودة في القائمة`, code: 'OPTION_NOT_FOUND' };
      }

      const optData = optDoc.data() || {};
      if (optData.is_available === false || optData.is_active === false) {
        return { success: false, error: `الإضافة "${optData.name_ar || optId}" غير متوفرة حالياً`, code: 'OPTION_UNAVAILABLE' };
      }

      if (optData.branch_availability && optData.branch_availability[branch] === false) {
        return { success: false, error: `الإضافة "${optData.name_ar || optId}" غير متاحة في ${branch}`, code: 'OPTION_BRANCH_UNAVAILABLE' };
      }

      optionsPriceTotal += Number(optData.price_delta ?? optData.price) || 0;
      resolvedOptionIds.push(optId);
    }

    const unitPrice = basePrice + optionsPriceTotal;
    calculatedSubtotal += unitPrice * qty;

    verifiedItems.push({
      id: 'item_' + Math.random().toString(36).substring(2, 8),
      product_id: item.product_id,
      name_ar: productData.name_ar || '',
      quantity: qty,
      unit_price: unitPrice,
      selected_option_ids: resolvedOptionIds,
      special_instructions: typeof item.special_instructions === 'string'
        ? item.special_instructions.trim().slice(0, 200)
        : '',
    });
  }

  if (settings && typeof settings.min_order_amount === 'number' && settings.min_order_amount > 0) {
    if (calculatedSubtotal < settings.min_order_amount) {
      return {
        success: false,
        error: `الحد الأدنى لقيمة الطلب هو ${settings.min_order_amount} ج.م (قيمة سلتك: ${calculatedSubtotal} ج.م)`,
        code: 'MIN_ORDER_AMOUNT_NOT_MET',
      };
    }
  }

  let deliveryFee = 0;
  if (payload.type === 'delivery') {
    if (typeof payload.delivery_fee === 'number') {
      deliveryFee = payload.delivery_fee;
    } else {
      const branchFee = settings?.branches?.[branch]?.delivery_fee;
      const globalFee = settings?.delivery_fee;
      deliveryFee = typeof branchFee === 'number' ? branchFee : (typeof globalFee === 'number' ? globalFee : 0);
    }
  }

  const finalTotal = calculatedSubtotal + deliveryFee;

  const idempotencyKey = payload.idempotency_key?.trim();
  const scopePrefix = authenticatedUserId ? `usr_${authenticatedUserId}` : `phone_${normalizedPhone}`;
  const safeIdempKey = idempotencyKey && idempotencyKey.length <= 128
    ? `${scopePrefix}_${idempotencyKey}`
    : `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const idempDocRef = db.collection('idempotency_records').doc(safeIdempKey);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const idempSnap = await transaction.get(idempDocRef);
      if (idempSnap.exists) {
        const existing = idempSnap.data();
        if (existing?.customer_phone && existing.customer_phone !== normalizedPhone) {
          throw new Error('IDEMPOTENCY_CUSTOMER_MISMATCH');
        }
        return {
          orderId: existing?.order_id as string,
          orderNumber: existing?.order_number as number | undefined,
          total: existing?.total as number,
          isDuplicate: true,
        };
      }

      const counterDocRef = db.collection('counters').doc('order_counter');
      const counterSnap = await transaction.get(counterDocRef);
      const counterData = counterSnap.data();

      const baseStartNumber = typeof settings?.initial_order_number === 'number'
        ? settings.initial_order_number
        : (typeof counterData?.start_number === 'number' ? counterData.start_number : 1001);

      const nextOrderNumber = counterSnap.exists && typeof counterData?.current_number === 'number'
        ? counterData.current_number + 1
        : baseStartNumber;

      transaction.set(counterDocRef, {
        current_number: nextOrderNumber,
        updated_at: fieldValueFactory.serverTimestamp(),
      }, { merge: true });

      const newOrderRef = db.collection('orders').doc();
      const orderId = newOrderRef.id;

      const orderRecord = {
        id: orderId,
        order_number: nextOrderNumber,
        customer_name: name,
        customer_phone: normalizedPhone,
        address: payload.type === 'delivery' ? address : '',
        user_id: authenticatedUserId || null,
        type: payload.type,
        branch,
        subtotal: calculatedSubtotal,
        delivery_fee: deliveryFee,
        total: finalTotal,
        status: 'new',
        idempotency_key: safeIdempKey,
        created_at: new Date().toISOString(),
        server_timestamp: fieldValueFactory.serverTimestamp(),
        items: verifiedItems,
      };

      transaction.set(idempDocRef, {
        order_id: orderId,
        order_number: nextOrderNumber,
        customer_phone: normalizedPhone,
        user_id: authenticatedUserId || null,
        total: finalTotal,
        created_at: fieldValueFactory.serverTimestamp(),
      });

      transaction.set(newOrderRef, orderRecord);

      return {
        orderId,
        orderNumber: nextOrderNumber,
        total: finalTotal,
        isDuplicate: false,
      };
    });

    return {
      success: true,
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      subtotal: calculatedSubtotal,
      deliveryFee,
      isDuplicate: result.isDuplicate,
    };
  } catch (err: any) {
    console.error('[OrderEngine] Atomic transaction failure in create order:', err);
    return {
      success: false,
      error: 'فشل حفظ الطلب في قاعدة البيانات، يرجى إعادة المحاولة.',
      code: 'TRANSACTION_FAILED',
    };
  }
}

async function resolveDependencies() {
  let dbGetter: () => any = () => ({ adminDb: getCreateDb(), adminAuth: getCreateAuth() });
  let isConfiguredGetter: () => boolean = isCreateFirebaseConfigured;
  let orderEngineGetter: (db: any, payload: any, userId?: any, fieldValue?: any) => Promise<any> = localProcessOrderCreation;
  let ipGetter: (req: any) => string = localGetClientIp;
  let rateLimitGetter: (ip: string, cfg: any) => Promise<any> = localCheckRateLimit;
  let rateLimitHeadersGetter: (res: any, result: any) => void = localApplyRateLimitHeaders;

  try {
    const serverAdmin = await import('../../src/server/firebaseAdmin');
    if (serverAdmin && typeof serverAdmin.getFirebaseAdmin === 'function') {
      dbGetter = serverAdmin.getFirebaseAdmin;
      isConfiguredGetter = serverAdmin.isFirebaseAdminConfigured;
    }
  } catch (e) {}

  try {
    const serverEngine = await import('../../src/server/orderEngine');
    if (serverEngine && typeof serverEngine.processOrderCreation === 'function') {
      orderEngineGetter = serverEngine.processOrderCreation;
    }
  } catch (e) {}

  try {
    const serverRate = await import('../../src/server/rateLimiter');
    if (serverRate && typeof serverRate.checkRateLimit === 'function') {
      ipGetter = serverRate.getClientIp;
      rateLimitGetter = serverRate.checkRateLimit;
      rateLimitHeadersGetter = serverRate.applyRateLimitHeaders;
    }
  } catch (e) {}

  return {
    getFirebaseAdmin: dbGetter,
    isFirebaseAdminConfigured: isConfiguredGetter,
    processOrderCreation: orderEngineGetter,
    getClientIp: ipGetter,
    checkRateLimit: rateLimitGetter,
    applyRateLimitHeaders: rateLimitHeadersGetter,
  };
}

// ----------------- Exported Serverless Handler -----------------

export default async function handler(req: any, res: any) {
  try {
    const deps = await resolveDependencies();

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
    const clientIp = deps.getClientIp(req);
    const rateLimitResult = await deps.checkRateLimit(clientIp, {
      prefix: 'order_create',
      maxRequests: 10,
      windowSeconds: 600,
    });
    deps.applyRateLimitHeaders(res, rateLimitResult);

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: 'لقد تجاوزت الحد المسموح به من الطلبات مؤقتاً، يرجى الانتظار والمحاولة لاحقاً.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    if (!deps.isFirebaseAdminConfigured()) {
      console.error('[API/create-order] Firebase Admin credentials not configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'إعدادات خادم قاعدة البيانات غير مكتملة (يرجى ضبط متغيرات Firebase Admin في Vercel).',
        code: 'FIREBASE_CREDENTIALS_MISSING',
        details: 'Missing FIREBASE_SERVICE_ACCOUNT_KEY or (FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL) in server environment variables.',
      });
    }

    const { adminDb, adminAuth } = deps.getFirebaseAdmin();

    // 3. Authentication extraction (100% optional - customer checkout is public and never rejected due to expired/invalid tokens)
    let authenticatedUserId: string | null = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1]?.trim();
      if (idToken && adminAuth && typeof adminAuth.verifyIdToken === 'function') {
        try {
          const decoded = await adminAuth.verifyIdToken(idToken);
          authenticatedUserId = decoded?.uid || null;
        } catch (tokenErr) {
          // Public customer orders must NEVER be rejected due to an expired/invalid token
          console.warn('[API/create-order] Invalid or expired auth token provided, proceeding as guest checkout:', tokenErr);
          authenticatedUserId = null;
        }
      }
    }

    // 4. Parse body
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

    // 5. Server-authoritative order processing
    const result = await deps.processOrderCreation(adminDb, body, authenticatedUserId);

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
