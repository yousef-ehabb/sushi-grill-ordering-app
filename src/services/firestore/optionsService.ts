import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { INITIAL_OPTION_GROUPS_BY_PRODUCT, createOptionGroupsForProduct } from '../../data/mockData';
import type { OptionGroup, ProductOption } from '../../app/store/useStore';

const OPTION_GROUPS_COLLECTION = 'option_groups';
const OPTIONS_COLLECTION = 'options';
const STORAGE_KEY = 'pochinki_all_option_groups';

export function getCachedOptionGroups(): OptionGroup[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

export function saveCachedOptionGroups(groups: OptionGroup[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Ignore quota errors
  }
}

export function getDefaultOptionGroups(): OptionGroup[] {
  const cached = getCachedOptionGroups();
  if (cached && cached.length > 0) return cached;
  return createOptionGroupsForProduct('all');
}

export const optionsService = {
  /**
   * Fetch all option groups with their options from Firestore
   */
  async getOptionGroups(): Promise<OptionGroup[]> {
    if (!isFirebaseConfigured() || !db) {
      return getDefaultOptionGroups();
    }

    try {
      const [groupsSnap, optionsSnap] = await Promise.all([
        getDocs(collection(db, OPTION_GROUPS_COLLECTION)),
        getDocs(collection(db, OPTIONS_COLLECTION)),
      ]);

      if (groupsSnap.empty) {
        return getDefaultOptionGroups();
      }

      const allOptions: ProductOption[] = optionsSnap.docs.map((docSnap) => {
        const raw = docSnap.data() as any;
        const branchMap = {
          ...(raw.branch_availability || {}),
          ...(raw.branchAvailability || {}),
        };
        return {
          id: docSnap.id,
          ...raw,
          branch_availability: branchMap,
          branchAvailability: branchMap,
          is_active: raw.is_active !== false && raw.available !== false,
          available: raw.available !== false && raw.is_active !== false,
        };
      });

      const groups: OptionGroup[] = groupsSnap.docs.map((docSnap) => {
        const groupData = docSnap.data() as Omit<OptionGroup, 'id' | 'options'>;
        const groupId = docSnap.id;
        const groupOptions = allOptions
          .filter((opt) => opt.group_id === groupId)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return {
          id: groupId,
          ...groupData,
          options: groupOptions,
        };
      });

      groups.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      saveCachedOptionGroups(groups);
      return groups;
    } catch (error) {
      console.warn('[optionsService] Error getting option groups, using fallback:', error);
      return getDefaultOptionGroups();
    }
  },

  /**
   * Real-time live subscription to both option_groups and options in Firestore.
   * Whenever an admin toggles availability, edits price, adds, or deletes an option,
   * this subscription fires automatically across all customer devices and admin panels.
   */
  subscribeToOptionGroups(callback: (groups: OptionGroup[]) => void): Unsubscribe {
    const defaultGroups = getDefaultOptionGroups();
    if (!isFirebaseConfigured() || !db) {
      callback(defaultGroups);
      return () => {};
    }

    let latestGroupDocs: any[] | null = null;
    let latestOptionDocs: any[] | null = null;

    const emitCombined = () => {
      if (!latestGroupDocs || !latestOptionDocs) return;

      if (latestGroupDocs.length === 0) {
        callback(defaultGroups);
        return;
      }

      const allOptions: ProductOption[] = latestOptionDocs.map((docSnap) => {
        const raw = docSnap.data() as any;
        const branchMap = {
          ...(raw.branch_availability || {}),
          ...(raw.branchAvailability || {}),
        };
        return {
          id: docSnap.id,
          ...raw,
          branch_availability: branchMap,
          branchAvailability: branchMap,
          is_active: raw.is_active !== false && raw.available !== false,
          available: raw.available !== false && raw.is_active !== false,
        };
      });

      const assembledGroups: OptionGroup[] = latestGroupDocs.map((docSnap) => {
        const groupData = docSnap.data() as Omit<OptionGroup, 'id' | 'options'>;
        const groupId = docSnap.id;
        const groupOptions = allOptions
          .filter((opt) => opt.group_id === groupId)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return {
          id: groupId,
          ...groupData,
          options: groupOptions,
        };
      });

      assembledGroups.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      saveCachedOptionGroups(assembledGroups);
      callback(assembledGroups);
    };

    let unsubGroups: Unsubscribe;
    let unsubOptions: Unsubscribe;

    try {
      unsubGroups = onSnapshot(
        collection(db, OPTION_GROUPS_COLLECTION),
        (snap) => {
          latestGroupDocs = snap.docs;
          emitCombined();
        },
        (err) => {
          console.warn('[optionsService] Error subscribing to option_groups:', err);
          callback(defaultGroups);
        }
      );

      unsubOptions = onSnapshot(
        collection(db, OPTIONS_COLLECTION),
        (snap) => {
          latestOptionDocs = snap.docs;
          emitCombined();
        },
        (err) => {
          console.warn('[optionsService] Error subscribing to options:', err);
          callback(defaultGroups);
        }
      );
    } catch (e) {
      console.warn('[optionsService] Error establishing snapshot listeners:', e);
      callback(defaultGroups);
      return () => {};
    }

    return () => {
      if (unsubGroups) unsubGroups();
      if (unsubOptions) unsubOptions();
    };
  },

  /**
   * Update an option using setDoc with merge:true (safe against missing docs)
   */
  async updateOption(optionId: string, data: Partial<ProductOption>): Promise<void> {
    if (!isFirebaseConfigured() || !db) return;
    const docRef = doc(db, OPTIONS_COLLECTION, optionId);
    await setDoc(docRef, data, { merge: true });
  },

  /**
   * Create a new option inside a group
   */
  async createOption(groupId: string, data: Omit<ProductOption, 'id' | 'group_id'> & { group_id?: string }): Promise<string> {
    if (!isFirebaseConfigured() || !db) throw new Error('Firebase not configured');
    const docRef = await addDoc(collection(db, OPTIONS_COLLECTION), {
      ...data,
      group_id: groupId,
    });
    return docRef.id;
  },

  /**
   * Delete an option
   */
  async deleteOption(optionId: string): Promise<void> {
    if (!isFirebaseConfigured() || !db) return;
    await deleteDoc(doc(db, OPTIONS_COLLECTION, optionId));
  },
};
