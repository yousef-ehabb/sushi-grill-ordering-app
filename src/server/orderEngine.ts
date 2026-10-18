import { type Firestore, FieldValue } from 'firebase-admin/firestore';

export interface ServerOrderItemInput {
  product_id: string;
  quantity: number;
  selected_option_ids?: string[];
  special_instructions?: string;
}

export interface CreateOrderServerRequest {
  customer_name: string;
  customer_phone: string;
  address?: string;
  type: 'pickup' | 'delivery';
  branch: string;
  items: ServerOrderItemInput[];
  idempotency_key?: string;
  client_total?: number;
}

export interface VerifiedOrderItem {
  id: string;
  product_id: string;
  name_ar: string;
  quantity: number;
  unit_price: number;
  selected_option_ids: string[];
  special_instructions: string;
}

export interface CreateOrderServerResult {
  success: boolean;
  orderId?: string;
  orderNumber?: number;
  total?: number;
  subtotal?: number;
  deliveryFee?: number;
  isDuplicate?: boolean;
  error?: string;
  code?: string;
}

export function validatePhoneEgyptian(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  // Matches 010xxxxxxxx, 011xxxxxxxx, 012xxxxxxxx, 015xxxxxxxx (11 digits)
  // or +2010xxxxxxxx (12 digits with country code)
  if (/^01[0125][0-9]{8}$/.test(cleaned)) return true;
  if (/^201[0125][0-9]{8}$/.test(cleaned)) return true;
  return false;
}

export function normalizePhoneEgyptian(phone: string): string {
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return '0' + cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Server-authoritative order validator and atomic creator.
 * Takes a Firestore database instance (admin.firestore.Firestore or test mock)
 * and executes calculation and atomic transaction.
 */
export async function processOrderCreation(
  db: Firestore,
  payload: CreateOrderServerRequest,
  authenticatedUserId: string | null = null,
  fieldValueFactory: any = FieldValue
): Promise<CreateOrderServerResult> {
  // 1. Basic structural input validation
  if (!payload || typeof payload !== 'object') {
    return { success: false, error: 'بيانات الطلب غير صالحة', code: 'INVALID_PAYLOAD' };
  }

  const name = typeof payload.customer_name === 'string' ? payload.customer_name.trim() : '';
  if (!name || name.length < 2 || name.length > 100) {
    return { success: false, error: 'يرجى إدخال اسم صحيح (بين 2 و 100 حرف)', code: 'INVALID_NAME' };
  }

  const rawPhone = typeof payload.customer_phone === 'string' ? payload.customer_phone.trim() : '';
  if (!validatePhoneEgyptian(rawPhone)) {
    return { success: false, error: 'يرجى إدخال رقم هاتف مصري صحيح (11 رقم يبدأ بـ 01)', code: 'INVALID_PHONE' };
  }
  const normalizedPhone = normalizePhoneEgyptian(rawPhone);

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

  // 2. Fetch Global Settings for Restaurant & Branch status
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

  // 3. Server-side product and option verification
  const verifiedItems: VerifiedOrderItem[] = [];
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

    // Verify option add-ons from options collection
    let optionsPriceTotal = 0;
    const selectedOptionIds = Array.isArray(item.selected_option_ids)
      ? item.selected_option_ids.filter((id) => typeof id === 'string')
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

  // 4. Verify Minimum Order Requirement
  if (settings && typeof settings.min_order_amount === 'number' && settings.min_order_amount > 0) {
    if (calculatedSubtotal < settings.min_order_amount) {
      return {
        success: false,
        error: `الحد الأدنى لقيمة الطلب هو ${settings.min_order_amount} ج.م (قيمة سلتك: ${calculatedSubtotal} ج.م)`,
        code: 'MIN_ORDER_AMOUNT_NOT_MET',
      };
    }
  }

  // 5. Calculate authoritative delivery fee
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

  // 6. Atomic Idempotency & Order Insertion via Firestore Transaction
  const idempotencyKey = payload.idempotency_key?.trim();
  const scopePrefix = authenticatedUserId ? `usr_${authenticatedUserId}` : `phone_${normalizedPhone}`;
  const safeIdempKey = idempotencyKey && idempotencyKey.length <= 128
    ? `${scopePrefix}_${idempotencyKey}`
    : `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const idempDocRef = db.collection('idempotency_records').doc(safeIdempKey);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // Step A: Check if idempotency record already exists
      const idempSnap = await transaction.get(idempDocRef);
      if (idempSnap.exists) {
        const existing = idempSnap.data();
        // Defensive check: cross-customer verification
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

      // Step B: Atomically allocate sequential order number
      const counterDocRef = db.collection('counters').doc('order_counter');
      const counterSnap = await transaction.get(counterDocRef);
      const counterData = counterSnap.data();

      // Configurable starting number from settings or counter doc (default 1001)
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

      // Step C: Atomically create order
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

      // Set idempotency record
      transaction.set(idempDocRef, {
        order_id: orderId,
        order_number: nextOrderNumber,
        customer_phone: normalizedPhone,
        user_id: authenticatedUserId || null,
        total: finalTotal,
        created_at: fieldValueFactory.serverTimestamp(),
      });

      // Set order record
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
    console.error('[OrderEngine] Atomic transaction failure:', err);
    return {
      success: false,
      error: 'فشل حفظ الطلب في قاعدة البيانات، يرجى إعادة المحاولة.',
      code: 'TRANSACTION_FAILED',
    };
  }
}
