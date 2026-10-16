import { collection, doc, writeBatch, getDocs, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import seedData from '../../../scripts/seed-data.json';

export const seedService = {
  /**
   * Seed categories, products, option groups, options, branches, and settings into Firestore
   */
  async seedAll(): Promise<{ success: boolean; message: string; count: Record<string, number> }> {
    if (!isFirebaseConfigured() || !db) {
      return {
        success: false,
        message: 'Firebase is not configured. Please add your credentials to .env first.',
        count: {},
      };
    }

    try {
      const counts: Record<string, number> = {
        categories: 0,
        products: 0,
        option_groups: 0,
        options: 0,
        branches: 0,
        settings: 0,
      };

      // 1. Settings
      if (seedData.restaurant_settings?.general) {
        const settingsRef = doc(db, 'settings', 'global');
        await setDoc(settingsRef, {
          is_website_open: seedData.restaurant_settings.general.is_open,
          closed_message: seedData.restaurant_settings.general.closed_message,
          delivery_fee: seedData.restaurant_settings.general.delivery_fee,
          min_order_amount: seedData.restaurant_settings.general.min_order_amount,
          estimated_delivery_time: seedData.restaurant_settings.general.estimated_delivery_time,
          updated_at: new Date().toISOString(),
        }, { merge: true });
        counts.settings = 1;
      }

      // 2. Branches
      if (seedData.restaurant_settings?.general?.contact?.branches) {
        for (const branch of seedData.restaurant_settings.general.contact.branches) {
          const branchRef = doc(db, 'branches', branch.id);
          await setDoc(branchRef, { ...branch, is_active: true }, { merge: true });
          counts.branches++;
        }
      }

      // 3. Categories
      if (seedData.categories) {
        for (const cat of seedData.categories) {
          const catRef = doc(db, 'categories', cat.id);
          await setDoc(catRef, cat, { merge: true });
          counts.categories++;
        }
      }

      // 4. Products
      if (seedData.products) {
        for (const prod of seedData.products) {
          const prodRef = doc(db, 'products', prod.id);
          await setDoc(prodRef, prod, { merge: true });
          counts.products++;
        }
      }

      // 5. Option Groups & Options (from products catalog)
      if (seedData.products) {
        for (const prod of seedData.products) {
          if (Array.isArray(prod.option_groups)) {
            for (const grp of prod.option_groups) {
              const grpRef = doc(db, 'option_groups', grp.id);
              await setDoc(grpRef, {
                id: grp.id,
                product_id: prod.id,
                name_ar: grp.title_ar,
                min_select: grp.min_select,
                max_select: grp.max_select,
                is_active: true,
                sort_order: 0,
              }, { merge: true });
              counts.option_groups++;

              if (Array.isArray(grp.options)) {
                for (const opt of grp.options) {
                  const optRef = doc(db, 'options', opt.id);
                  await setDoc(optRef, {
                    id: opt.id,
                    group_id: grp.id,
                    name_ar: opt.name_ar,
                    price_delta: opt.price_delta,
                    is_active: true,
                    sort_order: 0,
                  }, { merge: true });
                  counts.options++;
                }
              }
            }
          }
        }
      }

      return {
        success: true,
        message: 'Successfully seeded Pochinki Burger data into Firestore!',
        count: counts,
      };
    } catch (error: any) {
      console.error('[Firestore Seeder] Error seeding data:', error);
      return {
        success: false,
        message: error.message || 'Error occurred while seeding data.',
        count: {},
      };
    }
  },
};
