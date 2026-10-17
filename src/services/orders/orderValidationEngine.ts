import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import type { CartItem, Order, OrderItem, OrderStatus } from '../../app/store/useStore';

export interface ValidatedOrderPayload {
  customer_name: string;
  customer_phone: string;
  address?: string;
  user_id?: string | null;
  type: 'pickup' | 'delivery';
  branch: string;
  items: CartItem[];
  idempotency_key?: string;
}

export interface TrustedOrderResult {
  success: boolean;
  orderId?: string;
  recalculatedTotal?: number;
  deliveryFee?: number;
  subtotal?: number;
  error?: string;
}

/**
 * @deprecated Client-side order recalculation is superseded by the server-authoritative
 * engine in `src/server/orderEngine.ts`. All orders are validated and priced on the server.
 */
export async function validateAndRecalculateOrder(
  payload: ValidatedOrderPayload
): Promise<{
  isValid: boolean;
  error?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  verifiedItems: OrderItem[];
}> {
  if (!payload.items || payload.items.length === 0) {
    return { isValid: false, error: 'سلة المشتريات فارغة', subtotal: 0, deliveryFee: 0, total: 0, verifiedItems: [] };
  }

  if (!payload.customer_phone || !payload.customer_phone.trim()) {
    return { isValid: false, error: 'رقم الهاتف مطلوب', subtotal: 0, deliveryFee: 0, total: 0, verifiedItems: [] };
  }

  if (!isFirebaseConfigured() || !db) {
    // Offline / Mock fallback calculation
    const subtotal = payload.items.reduce((sum, item) => {
      const itemUnitPrice = (Number(item.price) || 0) + (Number(item.optionsPrice) || 0);
      return sum + itemUnitPrice * (Number(item.quantity) || 1);
    }, 0);
    const deliveryFee = payload.type === 'delivery' ? 25 : 0;
    const verifiedItems: OrderItem[] = payload.items.map((item) => ({
      id: 'item_' + Math.random().toString(36).substring(2, 7),
      product_id: item.id,
      name_ar: item.name_ar,
      quantity: Number(item.quantity) || 1,
      unit_price: (Number(item.price) || 0) + (Number(item.optionsPrice) || 0),
      selected_option_ids: Array.isArray(item.selectedOptionIds) ? item.selectedOptionIds : [],
      special_instructions: item.specialInstructions || '',
    }));

    return {
      isValid: true,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      verifiedItems,
    };
  }

  try {
    // 1. Fetch Global Settings for Branch status and Delivery Fees
    const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
    const settings = settingsDoc.exists() ? settingsDoc.data() : null;

    if (settings) {
      // Check branch open status
      const branchConfig = settings.branches?.[payload.branch];
      if (branchConfig && branchConfig.is_open === false) {
        return {
          isValid: false,
          error: `${payload.branch} مغلق حالياً ولا يستقبل طلبات جديدة.`,
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
          verifiedItems: [],
        };
      }
    }

    // 2. Fetch all products referenced in the order directly from Firestore
    const verifiedItems: OrderItem[] = [];
    let calculatedSubtotal = 0;

    for (const item of payload.items) {
      if (!item.id) {
        return { isValid: false, error: 'صنف غير معروف في السلة', subtotal: 0, deliveryFee: 0, total: 0, verifiedItems: [] };
      }

      const productDoc = await getDoc(doc(db, 'products', item.id));
      if (!productDoc.exists()) {
        return {
          isValid: false,
          error: `الصنف "${item.name_ar}" لم يعد موجوداً في القائمة`,
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
          verifiedItems: [],
        };
      }

      const productData = productDoc.data();
      if (!productData.is_available) {
        return {
          isValid: false,
          error: `الصنف "${productData.name_ar || item.name_ar}" غير متاح حالياً`,
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
          verifiedItems: [],
        };
      }

      // Check branch-specific availability
      if (payload.branch && productData.branch_availability) {
        if (productData.branch_availability[payload.branch] === false) {
          return {
            isValid: false,
            error: `الصنف "${productData.name_ar || item.name_ar}" غير متاح في ${payload.branch}`,
            subtotal: 0,
            deliveryFee: 0,
            total: 0,
            verifiedItems: [],
          };
        }
      }

      const verifiedBasePrice = Number(productData.price) || 0;
      let verifiedOptionsTotal = 0;
      const selectedOptionIds = Array.isArray(item.selectedOptionIds) ? item.selectedOptionIds : [];

      // 3. Verify options and their real prices from options collection
      if (selectedOptionIds.length > 0) {
        for (const rawOptionId of selectedOptionIds) {
          let optId = rawOptionId;
          let optionDoc = await getDoc(doc(db, 'options', optId));
          if (!optionDoc.exists()) {
            const legacyPrefixMap: Record<string, string> = {
              'opt-hot': 'opt-spicy-sauce',
              'opt-spicy': 'opt-spicy-sauce',
              'opt-ranch': 'opt-ranch-sauce',
              'opt-texas': 'opt-texas-sauce',
              'opt-cheddar': 'opt-cheddar-sauce',
              'opt-extra-fries': 'opt-extra-fries-sauce',
            };
            for (const [prefix, targetId] of Object.entries(legacyPrefixMap)) {
              if (rawOptionId.startsWith(prefix)) {
                const candidateDoc = await getDoc(doc(db, 'options', targetId));
                if (candidateDoc.exists()) {
                  optionDoc = candidateDoc;
                  optId = targetId;
                  break;
                }
              }
            }
          }

          if (optionDoc.exists()) {
            const optData = optionDoc.data();
            if (optData.is_available === false || optData.is_active === false || optData.available === false) {
              return {
                isValid: false,
                error: `الإضافة "${optData.name_ar || optId}" غير متوفرة حالياً`,
                subtotal: 0,
                deliveryFee: 0,
                total: 0,
                verifiedItems: [],
              };
            }
            const branchMap = optData.branch_availability || optData.branchAvailability;
            if (payload.branch && branchMap && branchMap[payload.branch] === false) {
              return {
                isValid: false,
                error: `الإضافة "${optData.name_ar || optId}" غير متاحة في ${payload.branch}`,
                subtotal: 0,
                deliveryFee: 0,
                total: 0,
                verifiedItems: [],
              };
            }
            verifiedOptionsTotal += Number(optData.price_delta ?? optData.price) || 0;
          }
        }
      }

      const itemQuantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const verifiedUnitPrice = verifiedBasePrice + verifiedOptionsTotal;
      calculatedSubtotal += verifiedUnitPrice * itemQuantity;

      verifiedItems.push({
        id: 'item_' + Math.random().toString(36).substring(2, 7),
        product_id: item.id,
        name_ar: productData.name_ar || item.name_ar,
        quantity: itemQuantity,
        unit_price: verifiedUnitPrice,
        selected_option_ids: selectedOptionIds,
        special_instructions: typeof item.specialInstructions === 'string' ? item.specialInstructions.trim().slice(0, 300) : '',
      });
    }

    // 4. Determine verified delivery fee
    let verifiedDeliveryFee = 0;
    if (payload.type === 'delivery') {
      const branchFee = settings?.branches?.[payload.branch]?.delivery_fee;
      const globalFee = settings?.delivery_fee;
      verifiedDeliveryFee = typeof branchFee === 'number' ? branchFee : (typeof globalFee === 'number' ? globalFee : 25);
    }

    const calculatedTotal = calculatedSubtotal + verifiedDeliveryFee;

    return {
      isValid: true,
      subtotal: calculatedSubtotal,
      deliveryFee: verifiedDeliveryFee,
      total: calculatedTotal,
      verifiedItems,
    };
  } catch (error: any) {
    console.error('[OrderValidationEngine] Error verifying order prices:', error);
    return {
      isValid: false,
      error: 'تعذر التحقق من أسعار الأصناف في الخادم، يرجى المحاولة مرة أخرى.',
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      verifiedItems: [],
    };
  }
}
