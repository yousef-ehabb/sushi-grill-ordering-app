import { collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { INITIAL_CATEGORIES } from '../../data/mockData';
import type { Category } from '../../app/store/useStore';

const COLLECTION_NAME = 'categories';

export const categoriesService = {
  /**
   * Fetch all active categories ordered by sort_order
   */
  async getCategories(): Promise<Category[]> {
    if (!isFirebaseConfigured() || !db) {
      return INITIAL_CATEGORIES;
    }

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('is_active', '==', true)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.warn('[Firestore] No categories found, falling back to mock data');
        return INITIAL_CATEGORIES;
      }

      const categories = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Category, 'id'>),
      }));

      // Sort programmatically to avoid requiring a composite index
      return categories.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    } catch (error) {
      console.warn('[Firestore] Error fetching categories, using fallback:', error);
      return INITIAL_CATEGORIES;
    }
  },

  /**
   * Seed/Save category
   */
  async saveCategory(category: Category): Promise<void> {
    if (!isFirebaseConfigured() || !db) return;
    const docRef = doc(db, COLLECTION_NAME, category.id);
    await setDoc(docRef, category, { merge: true });
  },
};
