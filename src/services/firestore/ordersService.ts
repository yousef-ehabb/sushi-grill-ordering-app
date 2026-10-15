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
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import type { Order, OrderStatus } from '../../app/store/useStore';

const ORDERS_COLLECTION = 'orders';

export const ordersService = {
  /**
   * Create a new order in Firestore
   */
  async createOrder(orderData: Omit<Order, 'id' | 'created_at'>): Promise<string> {
    if (!isFirebaseConfigured() || !db) {
      // Mock mode: generate local ID
      const mockId = 'ord_' + Math.random().toString(36).substring(2, 9);
      console.info('[Mock] Order created locally:', mockId);
      return mockId;
    }

    try {
      const ordersRef = collection(db, ORDERS_COLLECTION);
      const newOrderDoc = doc(ordersRef);

      // Cleanly sanitize payload to prevent Firestore undefined errors
      const orderPayload: Record<string, any> = {
        id: newOrderDoc.id,
        customer_name: orderData.customer_name?.trim() || 'عميل بوشنكي',
        customer_phone: orderData.customer_phone?.trim() || '',
        address: orderData.address?.trim() || '',
        user_id: orderData.user_id || null,
        type: orderData.type || 'pickup',
        total: Number(orderData.total) || 0,
        status: 'new' as OrderStatus,
        created_at: new Date().toISOString(),
        server_timestamp: serverTimestamp(),
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

      await setDoc(newOrderDoc, orderPayload);
      return newOrderDoc.id;
    } catch (error) {
      console.error('[Firestore] Error creating order:', error);
      throw error;
    }
  },

  /**
   * Fetch all orders sorted by creation date (for Admin view)
   */
  async getAllOrders(): Promise<Order[]> {
    if (!isFirebaseConfigured() || !db) {
      return [];
    }

    try {
      const q = query(
        collection(db, ORDERS_COLLECTION),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Order, 'id'>),
      }));
    } catch (error) {
      console.error('[Firestore] Error fetching orders with orderBy, trying fallback:', error);
      try {
        const snapshot = await getDocs(collection(db, ORDERS_COLLECTION));
        const orders = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Order, 'id'>),
        }));
        return orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } catch (fallbackError) {
        console.error('[Firestore] Error fetching all orders fallback:', fallbackError);
        return [];
      }
    }
  },

  /**
   * Fetch a single order by ID
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    if (!isFirebaseConfigured() || !db) {
      return null;
    }

    try {
      const docRef = doc(db, ORDERS_COLLECTION, orderId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) return null;

      return {
        id: snap.id,
        ...(snap.data() as Omit<Order, 'id'>),
      };
    } catch (error) {
      console.error(`[Firestore] Error fetching order ${orderId}:`, error);
      return null;
    }
  },

  /**
   * Subscribe in real-time to a specific order (for customer tracking)
   */
  subscribeToOrder(orderId: string, callback: (order: Order | null) => void): Unsubscribe {
    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    const docRef = doc(db, ORDERS_COLLECTION, orderId);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          callback({
            id: snap.id,
            ...(snap.data() as Omit<Order, 'id'>),
          });
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error(`[Firestore] Real-time error for order ${orderId}:`, error);
      }
    );
  },

  /**
   * Subscribe in real-time to active orders for the Kitchen / Admin screen
   */
  subscribeToKitchenOrders(callback: (orders: Order[]) => void): Unsubscribe {
    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    const q = query(
      collection(db, ORDERS_COLLECTION),
      where('status', 'in', ['new', 'preparing', 'ready', 'out_for_delivery'])
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const orders: Order[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Order, 'id'>),
        }));
        // Sort programmatically to avoid requiring a composite index
        orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        callback(orders);
      },
      (error) => {
        console.error('[Firestore] Error subscribing to kitchen orders:', error);
      }
    );
  },

  /**
   * Subscribe in real-time to all orders for the Admin Screen
   */
  subscribeToAllOrders(callback: (orders: Order[]) => void): Unsubscribe {
    if (!isFirebaseConfigured() || !db) {
      return () => {};
    }

    const q = query(
      collection(db, ORDERS_COLLECTION),
      orderBy('created_at', 'desc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const orders: Order[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Order, 'id'>),
        }));
        callback(orders);
      },
      (error) => {
        console.error('[Firestore] Error subscribing to all orders:', error);
      }
    );
  },

  /**
   * Update the status of an order (Admin / Kitchen Staff)
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
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
