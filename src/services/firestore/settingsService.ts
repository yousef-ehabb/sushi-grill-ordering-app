import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { INITIAL_GLOBAL_SETTINGS, INITIAL_BUSINESS_RULES } from '../../data/mockData';
import type { GlobalSettings, BusinessRule } from '../../app/store/useStore';

const SETTINGS_COLLECTION = 'settings';
const GLOBAL_DOC_ID = 'global';

export const settingsService = {
  /**
   * Fetch current global settings
   */
  async getGlobalSettings(): Promise<GlobalSettings> {
    if (!isFirebaseConfigured() || !db) {
      return INITIAL_GLOBAL_SETTINGS;
    }

    try {
      const docRef = doc(db, SETTINGS_COLLECTION, GLOBAL_DOC_ID);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        return INITIAL_GLOBAL_SETTINGS;
      }

      return {
        id: snap.id,
        ...(snap.data() as Omit<GlobalSettings, 'id'>),
      };
    } catch (error) {
      console.warn('[Firestore] Error getting global settings:', error);
      return INITIAL_GLOBAL_SETTINGS;
    }
  },

  /**
   * Subscribe to real-time changes in global restaurant settings
   */
  subscribeToGlobalSettings(callback: (settings: GlobalSettings) => void): Unsubscribe {
    if (!isFirebaseConfigured() || !db) {
      callback(INITIAL_GLOBAL_SETTINGS);
      return () => {};
    }

    const docRef = doc(db, SETTINGS_COLLECTION, GLOBAL_DOC_ID);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          callback({
            id: snap.id,
            ...(snap.data() as Omit<GlobalSettings, 'id'>),
          });
        } else {
          callback(INITIAL_GLOBAL_SETTINGS);
        }
      },
      (error) => {
        console.warn('[Firestore] Error in settings subscription:', error);
        callback(INITIAL_GLOBAL_SETTINGS);
      }
    );
  },

  /**
   * Update global settings (for Admin/Staff)
   */
  async updateGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
    if (!isFirebaseConfigured() || !db) return;
    const docRef = doc(db, SETTINGS_COLLECTION, GLOBAL_DOC_ID);
    await setDoc(
      docRef,
      {
        ...settings,
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );
  },

  /**
   * Fetch business rules (e.g., min quantities)
   */
  async getBusinessRules(): Promise<BusinessRule[]> {
    return INITIAL_BUSINESS_RULES;
  },
};
