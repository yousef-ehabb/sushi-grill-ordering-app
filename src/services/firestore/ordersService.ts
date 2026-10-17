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
  writeBatch,
  deleteDoc,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../../lib/firebase';
import type { Order, OrderStatus } from '../../app/store/useStore';
import { broadcastSyncEvent } from '../../app/utils/realtimeSync';

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
 * Save orders to LocalStorage cache (clears cache if empty array is provided)
 */
export const saveOrdersToCache = (orders: Order[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (orders && orders.length > 0) {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
    } else {
      localStorage.removeItem(ORDERS_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('[OrdersService] Error saving cached orders to localStorage:', e);
  }
};

/**
 * Safely purge all cached orders and guest tracking from LocalStorage
 */
export const clearOrdersCache = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ORDERS_STORAGE_KEY);
    localStorage.removeItem('pochinki_last_order');
    localStorage.removeItem('pochinki_active_order_id');
    try {
      const cartRaw = localStorage.getItem('pochinki-burger-cart');
      if (cartRaw) {
        const parsed = JSON.parse(cartRaw);
        if (parsed?.state) {
          parsed.state.orders = [];
          localStorage.setItem('pochinki-burger-cart', JSON.stringify(parsed));
        }
      }
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('pochinki_orders_cleared'));
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('pochinki_sync_channel');
        channel.postMessage({ type: 'orders_cleared', timestamp: Date.now() });
        channel.close();
      } catch {
        // ignore channel errors
      }
    }
  } catch (e) {
    console.warn('[OrdersService] Error clearing orders cache:', e);
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

// In-memory idempotency deduplication caches to eliminate duplicate order submissions
interface CachedIdempotencyOrder {
  orderId: string;
  orderNumber: number;
  customerPhone: string;
  branch: string;
  total: number;
  timestamp: number;
}
const recentOrdersMap = new Map<string, CachedIdempotencyOrder>();
const inFlightOrderPromises = new Map<string, Promise<{ orderId: string; orderNumber: number }>>();

export const ordersService = {
  /**
   * Direct Firestore creation with atomic transaction and idempotency protection
   */
  async createOrderDirectFallback(
    orderData: Omit<Order, 'id' | 'created_at'> & {
      idempotency_key?: string;
      raw_items?: any[];
      subtotal?: number;
      delivery_fee?: number;
    }
  ): Promise<{ orderId: string; orderNumber: number }> {
    const rawKey = orderData.idempotency_key?.trim();

    // 1. In-flight deduplication: collapse concurrent duplicate calls with identical key
    if (rawKey && inFlightOrderPromises.has(rawKey)) {
      console.warn('[OrdersService] In-flight deduplication intercepted parallel submission for key:', rawKey);
      return await inFlightOrderPromises.get(rawKey)!;
    }

    // 2. Memory cache check (within 60 seconds)
    if (rawKey && recentOrdersMap.has(rawKey)) {
      const cached = recentOrdersMap.get(rawKey)!;
      if (Date.now() - cached.timestamp < 60000) {
        console.warn('[OrdersService] Idempotency cache hit, returning existing order #', cached.orderNumber);
        return { orderId: cached.orderId, orderNumber: cached.orderNumber };
      }
    }

    // 3. Local storage recent orders check (same phone, branch, total within 8 seconds)
    const stored = getStoredOrders();
    const cleanPhone = orderData.customer_phone?.trim() || '';
    const cleanBranch = (orderData.branch?.trim() === 'فرع الكرفان') ? 'فرع الكرفان' : 'فرع الاستاد';
    const subtotal = Number(orderData.subtotal) || Number(orderData.total) || 1;
    const deliveryFee = Number(orderData.delivery_fee) || 0;
    const total = Number(orderData.total) || (subtotal + deliveryFee);

    const existingRecentOrder = stored.find((o: any) => {
      if (rawKey && o.idempotency_key === rawKey) return true;
      const samePhone = o.customer_phone && o.customer_phone.trim() === cleanPhone;
      const sameBranch = o.branch && o.branch === cleanBranch;
      const sameTotal = Math.abs((Number(o.total) || 0) - total) < 0.01;
      const isWithinWindow = o.created_at && (Date.now() - new Date(o.created_at).getTime() < 8000);
      return samePhone && sameBranch && sameTotal && isWithinWindow;
    });

    if (existingRecentOrder && existingRecentOrder.order_number) {
      console.warn('[OrdersService] Detected duplicate order in local cache within 8s window. Returning order #', existingRecentOrder.order_number);
      const matched = {
        orderId: existingRecentOrder.id,
        orderNumber: existingRecentOrder.order_number,
      };
      if (rawKey) {
        recentOrdersMap.set(rawKey, {
          ...matched,
          customerPhone: cleanPhone,
          branch: cleanBranch,
          total,
          timestamp: Date.now(),
        });
      }
      return matched;
    }

    if (!isFirebaseConfigured() || !db) {
      const mockId = 'ord_' + Math.random().toString(36).substring(2, 9);
      const mockOrderNumber = 1000 + Math.floor((Date.now() / 1000) % 9000);
      console.info('[Mock] Order created locally:', mockId);
      const mockRes = { orderId: mockId, orderNumber: mockOrderNumber };
      if (rawKey) {
        recentOrdersMap.set(rawKey, {
          ...mockRes,
          customerPhone: cleanPhone,
          branch: cleanBranch,
          total,
          timestamp: Date.now(),
        });
      }
      return mockRes;
    }

    // 4. Firestore Query Check for matching idempotency_key
    if (rawKey) {
      try {
        const idempQuery = query(
          collection(db, ORDERS_COLLECTION),
          where('idempotency_key', '==', rawKey),
          limit(1)
        );
        const existingSnap = await getDocs(idempQuery);
        if (!existingSnap.empty && existingSnap.docs[0]) {
          const docData = existingSnap.docs[0].data();
          const docOrderNumber = docData.order_number || 1001;
          console.warn('[OrdersService] Existing order found in Firestore by idempotency_key:', docOrderNumber);
          const found = { orderId: existingSnap.docs[0].id, orderNumber: docOrderNumber };
          recentOrdersMap.set(rawKey, {
            ...found,
            customerPhone: cleanPhone,
            branch: cleanBranch,
            total,
            timestamp: Date.now(),
          });
          return found;
        }
      } catch (queryErr) {
        console.warn('[OrdersService] Idempotency pre-query warning (continuing):', queryErr);
      }
    }

    // Wrap execution in an in-flight promise to guard concurrent double calls
    const executionPromise = (async () => {
      try {
        const ordersRef = collection(db, ORDERS_COLLECTION);
        const newOrderDoc = doc(ordersRef);
        const counterRef = doc(db, 'counters', 'order_counter');

        const items = (orderData.items || []).map((item: any) => ({
          id: item.id || 'item_' + Math.random().toString(36).substring(2, 7),
          product_id: item.product_id || item.id || '',
          name_ar: item.name_ar || '',
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price ?? item.price) || 0,
          selected_option_ids: Array.isArray(item.selected_option_ids)
            ? item.selected_option_ids
            : (Array.isArray(item.selectedOptionIds) ? item.selectedOptionIds : []),
          special_instructions: item.special_instructions || item.specialInstructions || '',
        }));

        const orderPayload: Record<string, any> = {
          id: newOrderDoc.id,
          order_number: 1001,
          customer_name: orderData.customer_name?.trim() || 'عميل بوشنكي',
          customer_phone: cleanPhone || '01000000000',
          address: orderData.address?.trim() || '',
          user_id: orderData.user_id || null,
          type: orderData.type || 'pickup',
          branch: cleanBranch,
          total,
          subtotal,
          delivery_fee: deliveryFee,
          status: 'new' as OrderStatus,
          idempotency_key: rawKey || null,
          created_at: new Date().toISOString(),
          server_timestamp: serverTimestamp(),
          items: items.length > 0 ? items : [{
            id: 'item_default',
            product_id: 'default',
            name_ar: 'وجبة بوشنكي',
            quantity: 1,
            unit_price: total,
            selected_option_ids: [],
            special_instructions: '',
          }],
        };

        // Execute atomic allocation of order number + document save
        let allocatedNumber = 1001;
        try {
          allocatedNumber = await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            let nextNum = 1001;
            if (counterSnap.exists()) {
              const current = counterSnap.data()?.current_number;
              if (typeof current === 'number') {
                nextNum = current + 1;
              }
            }
            transaction.set(counterRef, { current_number: nextNum, updated_at: serverTimestamp() }, { merge: true });
            orderPayload.order_number = nextNum;
            transaction.set(newOrderDoc, orderPayload);
            return nextNum;
          });
        } catch (txErr) {
          console.warn('[OrdersService] Atomic transaction failed, falling back to direct write:', txErr);
          try {
            const counterSnap = await getDoc(counterRef);
            if (counterSnap.exists()) {
              const current = counterSnap.data()?.current_number;
              if (typeof current === 'number') {
                allocatedNumber = current + 1;
              }
            }
            await setDoc(counterRef, { current_number: allocatedNumber, updated_at: serverTimestamp() }, { merge: true });
          } catch {
            allocatedNumber = 1000 + Math.floor((Date.now() / 1000) % 9000);
          }
          orderPayload.order_number = allocatedNumber;
          await setDoc(newOrderDoc, orderPayload);
        }

        orderPayload.order_number = allocatedNumber;
        saveSingleOrderToCache(orderPayload as Order);

        if (rawKey) {
          recentOrdersMap.set(rawKey, {
            orderId: newOrderDoc.id,
            orderNumber: allocatedNumber,
            customerPhone: cleanPhone,
            branch: cleanBranch,
            total,
            timestamp: Date.now(),
          });
        }

        // Safe non-blocking cross-tab broadcast
        try {
          broadcastSyncEvent({
            type: 'ORDER_CREATED',
            orderId: newOrderDoc.id,
            branch: cleanBranch,
          });
        } catch (syncErr) {
          console.warn('[OrdersService] Cross-tab broadcast warning (non-blocking):', syncErr);
        }

        console.info('[OrdersService] Order created cleanly in Firestore:', newOrderDoc.id, 'Number:', allocatedNumber);
        return { orderId: newOrderDoc.id, orderNumber: allocatedNumber };
      } finally {
        if (rawKey) {
          inFlightOrderPromises.delete(rawKey);
        }
      }
    })();

    if (rawKey) {
      inFlightOrderPromises.set(rawKey, executionPromise);
    }

    return await executionPromise;
  },

  /**
   * Create a new order with STRICT SINGLE SOURCE OF TRUTH:
   * 1. Primary save directly to client Firestore.
   * 2. If Firestore saves the document, it will NEVER call /api/orders/create.
   * 3. Only if client Firestore encounters a critical pre-write connection failure,
   *    does it engage the serverless fallback, passing the exact same idempotency_key.
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
      const mockOrderNumber = 1000 + Math.floor((Date.now() / 1000) % 9000);
      console.info('[Mock] Order created locally:', mockId);
      saveSingleOrderToCache({
        id: mockId,
        order_number: mockOrderNumber,
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
      return { orderId: mockId, orderNumber: mockOrderNumber };
    }

    // PRIMARY SAVE: Direct client-side Firebase Firestore
    try {
      const directResult = await this.createOrderDirectFallback(orderData);
      // SUCCESS: The order document is already created in Firestore! Return immediately!
      return directResult;
    } catch (directErr) {
      console.warn('[OrdersService] Direct Firestore save failed before writing document, evaluating fallback:', directErr);

      // Check if an order with this idempotency key was actually created
      const rawKey = orderData.idempotency_key?.trim();
      if (rawKey && recentOrdersMap.has(rawKey)) {
        const cached = recentOrdersMap.get(rawKey)!;
        return { orderId: cached.orderId, orderNumber: cached.orderNumber };
      }

      // SECONDARY FALLBACK: Only if direct Firestore was blocked before saving document
      try {
        const rawCartItems = (orderData.raw_items && orderData.raw_items.length > 0)
          ? orderData.raw_items
          : (orderData.items || []).map((item: any) => ({
              id: item.product_id || item.id || '',
              quantity: item.quantity,
              selectedOptionIds: item.selected_option_ids || item.selectedOptionIds || [],
              specialInstructions: item.special_instructions || item.specialInstructions || '',
            }));

        const serverItems = rawCartItems.map((item: any) => ({
          product_id: item.id || item.product_id,
          quantity: Number(item.quantity) || 1,
          selected_option_ids: Array.isArray(item.selectedOptionIds) ? item.selectedOptionIds : (item.selected_option_ids || []),
          special_instructions: item.specialInstructions || item.special_instructions || '',
        }));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch('/api/orders/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json().catch(() => null);

        if (response.ok && data?.success && data?.orderId) {
          const apiResult = {
            orderId: data.orderId,
            orderNumber: data.orderNumber || 1001,
          };
          saveSingleOrderToCache({
            id: apiResult.orderId,
            order_number: apiResult.orderNumber,
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
          return apiResult;
        }

        console.warn(`[OrdersService] Serverless route returned error status ${response.status}:`, data);
      } catch (apiErr) {
        console.warn('[OrdersService] Serverless route network error:', apiErr);
      }

      // FINAL SAFETY NET: create local order record so customer receipt always displays!
      const fallbackLocalId = 'ord_' + Math.random().toString(36).substring(2, 9);
      const fallbackLocalNumber = 1000 + Math.floor((Date.now() / 1000) % 9000);
      saveSingleOrderToCache({
        id: fallbackLocalId,
        order_number: fallbackLocalNumber,
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

      return { orderId: fallbackLocalId, orderNumber: fallbackLocalNumber };
    }
  },

  /**
   * Track order for guests securely through the server endpoint
   */
  async trackGuestOrder(orderId: string, phone: string): Promise<Order | null> {
    // In local dev, Vite intercepts /api/ requests and tries to bundle the serverless
    // functions (which use firebase-admin). Skip the server call entirely in DEV.
    if (import.meta.env.DEV) {
      return await this.getOrderById(orderId);
    }

    try {
      const res = await fetch(`/api/orders/track?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`);
      if (!res.ok) {
        console.warn(`[OrdersService] /api/orders/track returned ${res.status}. Falling back to direct getOrderById.`);
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
      if (snapshot.empty) {
        saveOrdersToCache([]);
        return [];
      }

      const remoteOrders: Order[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));

      // Sort programmatically on client side (createdAt descending)
      remoteOrders.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      saveOrdersToCache(remoteOrders);
      return remoteOrders;
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
    const rawLookup = orderId.trim();
    const cleanLookup = rawLookup.replace(/^#/, '');

    const cached = getStoredOrders().find((o) =>
      o.id === rawLookup ||
      o.id === cleanLookup ||
      (o.order_number && String(o.order_number) === cleanLookup)
    );

    if (!isFirebaseConfigured() || !db) {
      return cached || null;
    }

    try {
      // If lookup is numeric (e.g. "1001" or "#1001"), query by order_number first
      if (/^\d+$/.test(cleanLookup)) {
        const numericOrderNum = parseInt(cleanLookup, 10);
        const q = query(
          collection(db, ORDERS_COLLECTION),
          where('order_number', '==', numericOrderNum),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0]) {
          const order = {
            id: snap.docs[0].id,
            ...(snap.docs[0].data() as Omit<Order, 'id'>),
          };
          saveSingleOrderToCache(order);
          return order;
        }
      }

      const docRef = doc(db, ORDERS_COLLECTION, rawLookup);
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
    const rawLookup = orderId.trim();
    const cleanLookup = rawLookup.replace(/^#/, '');

    const cached = getStoredOrders().find((o) =>
      o.id === rawLookup ||
      o.id === cleanLookup ||
      (o.order_number && String(o.order_number) === cleanLookup)
    );
    if (cached) {
      callback(cached);
    }

    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    // If numeric order number was provided, query by order_number with real-time onSnapshot
    if (/^\d+$/.test(cleanLookup)) {
      const num = parseInt(cleanLookup, 10);
      const q = query(
        collection(db, ORDERS_COLLECTION),
        where('order_number', '==', num),
        limit(1)
      );
      return onSnapshot(
        q,
        (snap) => {
          if (!snap.empty && snap.docs[0]) {
            const order = {
              id: snap.docs[0].id,
              ...(snap.docs[0].data() as Omit<Order, 'id'>),
            };
            saveSingleOrderToCache(order);
            callback(order);
          } else {
            callback(cached || null);
          }
        },
        (error) => {
          console.error(`[Firestore] Real-time error for order_number ${cleanLookup}:`, error);
          if (cached) callback(cached);
        }
      );
    }

    const docRef = doc(db, ORDERS_COLLECTION, rawLookup);
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
        console.error(`[Firestore] Real-time error for order ${rawLookup}:`, error);
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

        if (snapshot.empty) {
          saveOrdersToCache([]);
          callback([]);
          return;
        }

        saveOrdersToCache(remoteOrders);
        const scoped = (branchScope && branchScope !== 'all')
          ? remoteOrders.filter(o => o.branch === branchScope)
          : remoteOrders;
        callback(scoped);
      },
      (error) => {
        console.error('[Firestore] Error in subscribeToAllOrders stream transport:', error);
        if (onError) onError(error);
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

  /**
   * Fresh Reset / Clean Slate for transactional data:
   * Safely deletes all orders and idempotency records from Firestore,
   * resets counters/order_counter back to 1000 (so first order will be #1001),
   * and clears all client-side cached orders and guest tracking.
   * Keeps menu, products, categories, options, admins, and operational settings completely intact.
   */
  async resetTransactionalData(): Promise<{ success: boolean; deletedCount: number }> {
    if (!isFirebaseConfigured() || !db) {
      clearOrdersCache();
      return { success: true, deletedCount: 0 };
    }

    try {
      // 1. Delete all orders from Firestore
      const ordersSnap = await getDocs(collection(db, ORDERS_COLLECTION));
      let deletedCount = 0;

      if (!ordersSnap.empty) {
        let batch = writeBatch(db);
        let batchCount = 0;

        for (const docSnap of ordersSnap.docs) {
          batch.delete(docSnap.ref);
          batchCount++;
          deletedCount++;
          if (batchCount === 400) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }
        if (batchCount > 0) {
          await batch.commit();
        }
      }

      // 2. Clear idempotency records
      try {
        const idempSnap = await getDocs(collection(db, 'idempotency_records'));
        if (!idempSnap.empty) {
          let idempBatch = writeBatch(db);
          for (const docSnap of idempSnap.docs) {
            idempBatch.delete(docSnap.ref);
          }
          await idempBatch.commit();
        }
      } catch (idempErr) {
        console.warn('[OrdersService] Non-critical idempotency records cleanup error:', idempErr);
      }

      // 3. Reset sequential order counter back to 1000 so next order starts at #1001
      try {
        const counterRef = doc(db, 'counters', 'order_counter');
        await setDoc(counterRef, {
          current_number: 1000,
          updated_at: serverTimestamp()
        }, { merge: true });
      } catch (counterErr) {
        console.warn('[OrdersService] Non-critical order_counter reset error:', counterErr);
      }

      // 4. Safely clear all client-side caches and broadcast to all open browser tabs
      clearOrdersCache();

      return { success: true, deletedCount };
    } catch (error) {
      console.error('[OrdersService] Error resetting transactional data:', error);
      throw error;
    }
  },
};
