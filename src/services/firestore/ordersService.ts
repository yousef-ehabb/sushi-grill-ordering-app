import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
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
   * Create a new order with Dual Persistence (LocalStorage cache + Firestore)
   */
  async createOrder(orderData: Omit<Order, 'id' | 'created_at'>): Promise<string> {
    const orderId =
      isFirebaseConfigured() && db
        ? doc(collection(db, ORDERS_COLLECTION)).id
        : 'ord_' + Math.random().toString(36).substring(2, 9);

    const nowIso = new Date().toISOString();

    const localOrder: Order = {
      id: orderId,
      customer_name: orderData.customer_name?.trim() || 'عميل بوشنكي',
      customer_phone: orderData.customer_phone?.trim() || '',
      address: orderData.address?.trim() || '',
      user_id: orderData.user_id || undefined,
      type: orderData.type || 'pickup',
      branch: orderData.branch?.trim() || '',
      total: Number(orderData.total) || 0,
      status: 'new' as OrderStatus,
      created_at: nowIso,
      items: (orderData.items || []).map((item) => ({
        id: item.id || 'item_' + Math.random().toString(36).substring(2, 7),
        product_id: item.product_id || '',
        name_ar: item.name_ar || '',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        selected_option_ids: Array.isArray(item.selected_option_ids) ? item.selected_option_ids : [],
        special_instructions: item.special_instructions || '',
      })),
    };

    // 1. Dual Persistence: Save immediately to LocalStorage cache
    saveSingleOrderToCache(localOrder);

    // 2. Persist to Firestore if configured
    if (isFirebaseConfigured() && db) {
      try {
        const orderDocRef = doc(db, ORDERS_COLLECTION, orderId);
        const firestorePayload = sanitizeForFirestore({
          ...localOrder,
          user_id: localOrder.user_id || null,
          server_timestamp: serverTimestamp(),
        });
        await setDoc(orderDocRef, firestorePayload);
      } catch (error) {
        console.error('[Firestore] Error saving order to Firestore (saved locally in fallback):', error);
      }
    }

    return orderId;
  },

  /**
   * Fetch all orders using simple collection query without compound orderBy to avoid 400 Bad Request
   */
  async getAllOrders(): Promise<Order[]> {
    const cached = getStoredOrders();

    if (!isFirebaseConfigured() || !db) {
      return cached;
    }

    try {
      // Simple collection query WITHOUT compound orderBy
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
   * Fetch a single order by ID
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    const cached = getStoredOrders().find((o) => o.id === orderId);

    if (!isFirebaseConfigured() || !db) {
      return cached || null;
    }

    try {
      const docRef = doc(db, ORDERS_COLLECTION, orderId);
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
   * Subscribe in real-time to all orders for the Admin Screen
   * Simple collection query without compound orderBy to prevent 400 Bad Request & missing index errors
   */
  subscribeToAllOrders(
    callback: (orders: Order[]) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    // Deliver cached orders immediately
    const initialCached = getStoredOrders();
    if (initialCached.length > 0) {
      callback(initialCached);
    }

    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    // Simple collection query WITHOUT compound orderBy
    const colRef = collection(db, ORDERS_COLLECTION);

    return onSnapshot(
      colRef,
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
          callback(merged);
        } else if (snapshot.empty && currentCached.length > 0) {
          callback(currentCached);
        } else {
          callback([]);
        }
      },
      (error) => {
        console.error('[Firestore] Error in subscribeToAllOrders stream transport:', error);
        if (onError) onError(error);
        // Fallback to cached orders on stream error - NEVER wipe out existing orders
        const currentCached = getStoredOrders();
        if (currentCached.length > 0) {
          callback(currentCached);
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
