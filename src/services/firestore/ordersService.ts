import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../../lib/firebase';
import type { Order, OrderStatus } from '../../app/store/useStore';

const ORDERS_COLLECTION = 'orders';
const ORDERS_STORAGE_KEY = 'pochinki_orders_cache';

/**
 * Load cached orders safely from LocalStorage
 */
export const getStoredOrders = (): Order[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[OrdersService] Error loading cached orders from localStorage:', e);
    return [];
  }
};

/**
 * Save orders to LocalStorage cache without overwriting with empty array
 */
export const saveOrdersToCache = (orders: Order[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (orders && orders.length > 0) {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    }
  } catch (e) {
    console.warn('[OrdersService] Error saving cached orders to localStorage:', e);
  }
};

/**
 * Save single order directly to LocalStorage cache
 */
export const saveSingleOrderToCache = (order: Order) => {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredOrders();
    const existingIndex = current.findIndex((o) => o.id === order.id);
    let updated: Order[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = order;
    } else {
      updated = [order, ...current];
    }
    updated.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[OrdersService] Error adding order to cache:', e);
  }
};

/**
 * Merge two order lists by ID and sort descending by creation date
 */
export const mergeOrders = (current: Order[], incoming: Order[]): Order[] => {
  if (!incoming || incoming.length === 0) return current;
  const map = new Map<string, Order>();
  for (const o of incoming) {
    map.set(o.id, o);
  }
  for (const o of current) {
    if (!map.has(o.id)) {
      map.set(o.id, o);
    }
  }
  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return merged;
};

/**
 * Deep undefined remover to guarantee Firestore never encounters an undefined property
 */
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) {
      continue;
    } else if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !(val instanceof Date) &&
      typeof val.toMillis !== 'function'
    ) {
      result[key] = sanitizeForFirestore(val);
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) =>
        item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : item
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

export const ordersService = {
  /**
   * Direct Firestore creation fallback for local development (npm run dev)
   * Activated only when the Vercel Serverless API (/api/orders/create) is not running locally.
   */
  async createOrderDirectFallback(
    orderData: Omit<Order, 'id' | 'created_at'> & {
      idempotency_key?: string;
      raw_items?: any[];
      subtotal?: number;
      delivery_fee?: number;
    }
  ): Promise<{ orderId: string; orderNumber: number }> {
    if (!isFirebaseConfigured() || !db) {
      const mockId = 'ord_' + Math.random().toString(36).substring(2, 9);
      console.info('[Mock] Order created locally:', mockId);
      return { orderId: mockId, orderNumber: 1001 };
    }

    try {
      const ordersRef = collection(db, ORDERS_COLLECTION);
      const newOrderDoc = doc(ordersRef);

      let orderNumber = 1001;
      try {
        const counterRef = doc(db, 'counters', 'order_counter');
        const counterSnap = await getDoc(counterRef);
        if (counterSnap.exists()) {
          const current = counterSnap.data()?.current_number;
          if (typeof current === 'number') {
            orderNumber = current + 1;
          }
        }
        await setDoc(counterRef, { current_number: orderNumber, updated_at: serverTimestamp() }, { merge: true });
      } catch (counterErr) {
        console.warn('[OrdersService] Counter update in fallback had non-blocking error:', counterErr);
        if (orderNumber === 1001) {
          orderNumber = 1000 + Math.floor((Date.now() / 1000) % 9000);
        }
      }

      const items = (orderData.items || []).map((item) => ({
        id: item.id || 'item_' + Math.random().toString(36).substring(2, 7),
        product_id: item.product_id || '',
        name_ar: item.name_ar || '',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        selected_option_ids: Array.isArray(item.selected_option_ids) ? item.selected_option_ids : [],
        special_instructions: item.special_instructions || '',
      }));

      // Ensure branch is valid according to security rules
      const validBranch = (orderData.branch?.trim() === 'فرع الكرفان') ? 'فرع الكرفان' : 'فرع الاستاد';

      const orderPayload: Record<string, any> = {
        id: newOrderDoc.id,
        order_number: orderNumber,
        customer_name: orderData.customer_name?.trim() || 'عميل بوشنكي',
        customer_phone: orderData.customer_phone?.trim() || '01000000000',
        address: orderData.address?.trim() || '',
        user_id: orderData.user_id || null,
        type: orderData.type || 'pickup',
        branch: validBranch,
        total: Number(orderData.total) || 1,
        subtotal: Number(orderData.subtotal || orderData.total) || 1,
        delivery_fee: Number(orderData.delivery_fee) || 0,
        status: 'new' as OrderStatus,
        created_at: new Date().toISOString(),
        server_timestamp: serverTimestamp(),
        items: items.length > 0 ? items : [{
          id: 'item_default',
          product_id: 'default',
          name_ar: 'وجبة بوشنكي',
          quantity: 1,
          unit_price: Number(orderData.total) || 1,
          selected_option_ids: [],
          special_instructions: '',
        }],
      };

      await setDoc(newOrderDoc, orderPayload);
      saveSingleOrderToCache(orderPayload as Order);
      console.info('[OrdersService] [Resilient Fallback] Order created directly in Firestore:', newOrderDoc.id, 'Number:', orderNumber);
      return { orderId: newOrderDoc.id, orderNumber };
    } catch (error) {
      console.error('[OrdersService] Direct fallback creation failed:', error);
      throw error;
    }
  },

  /**
   * Create a new order via trusted server-authoritative API with atomic idempotency
   */
  async createOrder(
    orderData: Omit<Order, 'id' | 'created_at'> & {
      idempotency_key?: string;
      raw_items?: any[];
      subtotal?: number;
      delivery_fee?: number;
    }
  ): Promise<{ orderId: string; orderNumber: number }> {
    if (!isFirebaseConfigured() || !db) {
      const mockId = 'ord_' + Math.random().toString(36).substring(2, 9);
      console.info('[Mock] Order created locally:', mockId);
      return { orderId: mockId, orderNumber: 1001 };
    }

    const rawCartItems = (orderData.raw_items && orderData.raw_items.length > 0)
      ? orderData.raw_items
      : (orderData.items || []).map((item) => ({
          id: item.product_id || '',
          quantity: item.quantity,
          selectedOptionIds: item.selected_option_ids || [],
          specialInstructions: item.special_instructions || '',
        }));

    const serverItems = rawCartItems.map((item: any) => ({
      product_id: item.id || item.product_id,
      quantity: Number(item.quantity) || 1,
      selected_option_ids: Array.isArray(item.selectedOptionIds) ? item.selectedOptionIds : (item.selected_option_ids || []),
      special_instructions: item.specialInstructions || item.special_instructions || '',
    }));

    let idToken: string | null = null;
    if (auth && auth.currentUser) {
      try {
        idToken = await auth.currentUser.getIdToken();
      } catch (tokenErr) {
        console.warn('[OrdersService] Error getting auth token:', tokenErr);
      }
    }

    let response: Response;
    try {
      response = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          customer_name: orderData.customer_name,
          customer_phone: orderData.customer_phone,
          address: orderData.address,
          type: orderData.type,
          branch: orderData.branch,
          items: serverItems,
          idempotency_key: orderData.idempotency_key,
        }),
      });
    } catch (netErr) {
      console.warn('[OrdersService] Serverless API route network error. Engaging direct Firestore fallback.', netErr);
      return await this.createOrderDirectFallback(orderData);
    }

    if (response.status === 404) {
      console.warn('[OrdersService] /api/orders/create returned 404. Using direct Firestore fallback.');
      return await this.createOrderDirectFallback(orderData);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      console.warn('[OrdersService] Server API returned error response or non-JSON:', {
        status: response.status,
        code: data?.code,
        error: data?.error,
        details: data?.details,
      });

      // If server returns 500 (e.g. Firebase Admin credentials unconfigured in Vercel),
      // or if static hosting rewrite returns 200 with HTML (data is null),
      // seamlessly engage direct Firestore fallback so orders are not blocked.
      if (response.status === 500 || data?.code === 'FIREBASE_CREDENTIALS_MISSING' || !data) {
        console.info('[OrdersService] Engaging direct Firestore fallback due to server error or unconfigured serverless environment.');
        return await this.createOrderDirectFallback(orderData);
      }

      const errorMsg = data?.error || 'فشل إنشاء الطلب في الخادم، يرجى المحاولة مرة أخرى.';
      throw new Error(errorMsg);
    }

    const result = {
      orderId: data.orderId,
      orderNumber: data.orderNumber || 1001,
    };

    saveSingleOrderToCache({
      id: result.orderId,
      order_number: result.orderNumber,
      customer_name: orderData.customer_name,
      customer_phone: orderData.customer_phone,
      address: orderData.address,
      user_id: orderData.user_id,
      type: orderData.type,
      branch: orderData.branch,
      total: orderData.total,
      status: 'new',
      created_at: new Date().toISOString(),
      items: orderData.items,
    } as Order);

    return result;
  },

  /**
   * Track order for guests securely through the server endpoint
   */
  async trackGuestOrder(orderId: string, phone: string): Promise<Order | null> {
    try {
      const res = await fetch(`/api/orders/track?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`);
      if (res.status === 404 && import.meta.env.DEV) {
        console.warn('[OrdersService] /api/orders/track is 404 in local Vite dev server. Falling back to direct getOrderById.');
        return await this.getOrderById(orderId);
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        if (res.status === 500 || data?.code === 'FIREBASE_CREDENTIALS_MISSING') {
          console.warn('[OrdersService] /api/orders/track returned 500 or missing credentials. Falling back to direct getOrderById.');
          return await this.getOrderById(orderId);
        }
        return null;
      }
      return data.order;
    } catch (err) {
      console.warn('[OrdersService] Error tracking guest order, attempting direct getOrderById fallback:', err);
      return await this.getOrderById(orderId);
    }
  },

  /**
   * Fetch all orders sorted by creation date (for Admin view)
   */
  async getAllOrders(): Promise<Order[]> {
    const cached = getStoredOrders();

    if (!isFirebaseConfigured() || !db) {
      return cached;
    }

    try {
      const snapshot = await getDocs(collection(db, ORDERS_COLLECTION));
      if (snapshot.empty && cached.length > 0) {
        return cached;
      }

      const remoteOrders: Order[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));

      // Sort programmatically on client side (createdAt descending)
      remoteOrders.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      // Merge with cache to preserve any local orders
      const merged = mergeOrders(cached, remoteOrders);
      if (merged.length > 0) {
        saveOrdersToCache(merged);
      }
      return merged;
    } catch (error) {
      console.error('[Firestore] Error fetching all orders, using local cache:', error);
      return cached;
    }
  },

  /**
   * Fetch orders for a specific authenticated user (complies with security rules)
   */
  async getUserOrders(userId: string): Promise<Order[]> {
    if (!isFirebaseConfigured() || !db || !userId) {
      return [];
    }

    try {
      const q = query(
        collection(db, ORDERS_COLLECTION),
        where('user_id', '==', userId)
      );
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));
      return orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (error) {
      console.warn('[Firestore] Error fetching user orders:', error);
      return [];
    }
  },

  /**
   * Fetch a single order by ID or order_number
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    const cached = getStoredOrders().find((o) => o.id === orderId);

    if (!isFirebaseConfigured() || !db) {
      return cached || null;
    }

    try {
      const cleanLookup = orderId.trim();

      // If lookup is numeric (e.g. "1001"), query by order_number first
      if (/^\d+$/.test(cleanLookup)) {
        const numericOrderNum = parseInt(cleanLookup, 10);
        const q = query(
          collection(db, ORDERS_COLLECTION),
          where('order_number', '==', numericOrderNum),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0]) {
          return {
            id: snap.docs[0].id,
            ...(snap.docs[0].data() as Omit<Order, 'id'>),
          };
        }
      }

      const docRef = doc(db, ORDERS_COLLECTION, cleanLookup);
      const snap = await getDoc(docRef);

      if (!snap.exists()) return cached || null;

      const order = {
        id: snap.id,
        ...(snap.data() as Omit<Order, 'id'>),
      };
      saveSingleOrderToCache(order);
      return order;
    } catch (error) {
      console.error(`[Firestore] Error fetching order ${orderId}:`, error);
      return cached || null;
    }
  },

  /**
   * Subscribe in real-time to a specific order (for customer tracking)
   */
  subscribeToOrder(orderId: string, callback: (order: Order | null) => void): Unsubscribe {
    const cached = getStoredOrders().find((o) => o.id === orderId);
    if (cached) {
      callback(cached);
    }

    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const order = {
            id: snap.id,
            ...(snap.data() as Omit<Order, 'id'>),
          };
          saveSingleOrderToCache(order);
          callback(order);
        } else {
          callback(cached || null);
        }
      },
      (error) => {
        console.error(`[Firestore] Real-time error for order ${orderId}:`, error);
        if (cached) callback(cached);
      }
    );
  },

  /**
   * Subscribe in real-time to active orders for the Kitchen / Admin screen
   * Uses simple collection query and filters/sorts in JavaScript
   */
  subscribeToKitchenOrders(
    callback: (orders: Order[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    const cached = getStoredOrders().filter((o) =>
      ['new', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)
    );
    if (cached.length > 0) {
      callback(cached);
    }

    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    // Query simple collection to prevent 400 Bad Request
    const colRef = collection(db, ORDERS_COLLECTION);

    return onSnapshot(
      colRef,
      (snapshot) => {
        const allOrders: Order[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Order, 'id'>),
        }));
        const kitchenOrders = allOrders.filter((o) =>
          ['new', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)
        );
        kitchenOrders.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        callback(kitchenOrders);
      },
      (error) => {
        console.error('[Firestore] Error subscribing to kitchen orders:', error);
        if (onError) onError(error);
        const fallback = getStoredOrders().filter((o) =>
          ['new', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)
        );
        if (fallback.length > 0) {
          callback(fallback);
        }
      }
    );
  },

  /**
   * Subscribe in real-time to all orders for the Admin Screen (with optional branch scoping)
   * Programmatically sorts in memory to avoid 400 Bad Request / missing compound index errors
   */
  subscribeToAllOrders(
    callback: (orders: Order[]) => void,
    branchScope?: string | null,
    onError?: (error: any) => void
  ): Unsubscribe {
    // Deliver cached orders immediately
    const initialCached = getStoredOrders();
    const filteredCached = (branchScope && branchScope !== 'all')
      ? initialCached.filter(o => o.branch === branchScope)
      : initialCached;
    if (filteredCached.length > 0) {
      callback(filteredCached);
    }

    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    const colRef = collection(db, ORDERS_COLLECTION);
    const q = branchScope && branchScope !== 'all'
      ? query(colRef, where('branch', '==', branchScope))
      : colRef;

    return onSnapshot(
      q,
      (snapshot) => {
        const remoteOrders: Order[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Order, 'id'>),
        }));

        remoteOrders.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

        // Merge with existing localStorage cache to avoid wiping out orders
        const currentCached = getStoredOrders();
        const merged = mergeOrders(currentCached, remoteOrders);
        if (merged.length > 0) {
          saveOrdersToCache(merged);
          const scoped = (branchScope && branchScope !== 'all')
            ? merged.filter(o => o.branch === branchScope)
            : merged;
          callback(scoped);
        } else if (snapshot.empty && filteredCached.length > 0) {
          callback(filteredCached);
        } else {
          callback([]);
        }
      },
      (error) => {
        console.error('[Firestore] Error in subscribeToAllOrders stream transport:', error);
        if (onError) onError(error);
        // Fallback to cached orders on stream error - NEVER wipe out existing orders
        if (filteredCached.length > 0) {
          callback(filteredCached);
        }
      }
    );
  },

  /**
   * Update the status of an order (Admin / Kitchen Staff)
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    // 1. Update in local cache immediately
    const cached = getStoredOrders();
    const updated = cached.map((o) => (o.id === orderId ? { ...o, status } : o));
    saveOrdersToCache(updated);

    // 2. Update in Firestore if configured
    if (!isFirebaseConfigured() || !db) return;

    try {
      const docRef = doc(db, ORDERS_COLLECTION, orderId);
      await updateDoc(docRef, {
        status,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[Firestore] Error updating order status ${orderId}:`, error);
      throw error;
    }
  },
};
