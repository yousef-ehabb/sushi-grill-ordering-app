import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import {
  INITIAL_PRODUCTS,
  INITIAL_OPTION_GROUPS_BY_PRODUCT,
  createOptionGroupsForProduct,
} from '../../data/mockData';
import type { Product, OptionGroup, ProductOption } from '../../app/store/useStore';

const PRODUCTS_COLLECTION = 'products';
const OPTION_GROUPS_COLLECTION = 'option_groups';
const OPTIONS_COLLECTION = 'options';

export const productsService = {
  /**
   * Fetch all available products
   */
  async getProducts(): Promise<Product[]> {
    if (!isFirebaseConfigured() || !db) {
      return INITIAL_PRODUCTS;
    }

    try {
      const snapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));

      if (snapshot.empty) {
        console.warn('[Firestore] No products found in Firestore, falling back to mock');
        return INITIAL_PRODUCTS;
      }

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Product, 'id'>),
      }));
    } catch (error) {
      console.warn('[Firestore] Error fetching products, using fallback:', error);
      return INITIAL_PRODUCTS;
    }
  },

  /**
   * Subscribe to real-time changes in products collection
   */
  subscribeToProducts(callback: (products: Product[]) => void): Unsubscribe {
    if (!isFirebaseConfigured() || !db) {
      callback(INITIAL_PRODUCTS);
      return () => {};
    }

    const colRef = collection(db, PRODUCTS_COLLECTION);
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (snapshot.empty) {
          callback(INITIAL_PRODUCTS);
          return;
        }

        const products = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Product, 'id'>),
        }));
        callback(products);
      },
      (error) => {
        console.warn('[Firestore] Error in products subscription:', error);
      }
    );
  },

  /**
   * Fetch option groups and their child options for a specific product
   */
  async getOptionGroupsForProduct(productId: string): Promise<OptionGroup[]> {
    if (!isFirebaseConfigured() || !db) {
      return INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId);
    }

    try {
      // Fetch all option groups and match those for this specific product or universal ('all' / unassigned)
      const groupsSnap = await getDocs(collection(db, OPTION_GROUPS_COLLECTION));

      if (groupsSnap.empty) {
        return INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId);
      }

      const matchingGroupDocs = groupsSnap.docs.filter((groupDoc) => {
        const data = groupDoc.data();
        if (data.is_active === false) return false;
        return data.product_id === productId || data.product_id === 'all' || !data.product_id;
      });

      if (matchingGroupDocs.length === 0) {
        return INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId);
      }

      const groups: OptionGroup[] = [];

      for (const groupDoc of matchingGroupDocs) {
        const groupData = groupDoc.data() as Omit<OptionGroup, 'id' | 'options'>;
        const groupId = groupDoc.id;

        // Fetch options for this group without composite index requirement
        const optionsQuery = query(
          collection(db, OPTIONS_COLLECTION),
          where('group_id', '==', groupId)
        );
        const optionsSnap = await getDocs(optionsQuery);

        const options: ProductOption[] = optionsSnap.docs
          .map((optDoc) => ({
            id: optDoc.id,
            ...(optDoc.data() as Omit<ProductOption, 'id'>),
          }))
          .filter((opt) => opt.is_active !== false);

        // Sort options by sort_order
        options.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        groups.push({
          id: groupId,
          ...groupData,
          options,
        });
      }

      // Sort groups by sort_order
      groups.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return groups.length > 0 ? groups : (INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId));
    } catch (error) {
      console.warn(`[Firestore] Error fetching option groups for ${productId}:`, error);
      return INITIAL_OPTION_GROUPS_BY_PRODUCT[productId] || createOptionGroupsForProduct(productId);
    }
  },

  /**
   * Batch save product with its option groups
   */
  async saveProduct(product: Product): Promise<void> {
    if (!isFirebaseConfigured() || !db) return;
    const docRef = doc(db, PRODUCTS_COLLECTION, product.id);
    await setDoc(docRef, product, { merge: true });
  },
};
