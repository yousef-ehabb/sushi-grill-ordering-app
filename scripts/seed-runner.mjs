import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env
const envPath = resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = (match[2] || '').trim();
  }
});

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

console.log('[Seed] Initializing Firebase with project:', firebaseConfig.projectId);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Read seed-data.json
const dataPath = resolve(__dirname, './seed-data.json');
const seedData = JSON.parse(readFileSync(dataPath, 'utf8'));

async function runSeed() {
  console.log('[Seed] Starting database seed for Pochinki Burger...');

  // 1. Settings
  if (seedData.restaurant_settings?.general) {
    const gen = seedData.restaurant_settings.general;
    await setDoc(doc(db, 'settings', 'global'), {
      is_website_open: gen.is_open,
      closed_message: gen.closed_message,
      delivery_fee: gen.delivery_fee,
      min_order_amount: gen.min_order_amount,
      estimated_delivery_time: gen.estimated_delivery_time,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    console.log('✓ Seeded settings/global');
  }

  // 2. Branches
  if (seedData.restaurant_settings?.general?.contact?.branches) {
    for (const branch of seedData.restaurant_settings.general.contact.branches) {
      await setDoc(doc(db, 'branches', branch.id), {
        ...branch,
        is_active: true,
      }, { merge: true });
      console.log(`✓ Seeded branch: ${branch.name_ar}`);
    }
  }

  // 3. Categories
  if (seedData.categories) {
    for (const cat of seedData.categories) {
      await setDoc(doc(db, 'categories', cat.id), cat, { merge: true });
      console.log(`✓ Seeded category: ${cat.name_ar}`);
    }
  }

  // 4. Products
  if (seedData.products) {
    for (const prod of seedData.products) {
      await setDoc(doc(db, 'products', prod.id), prod, { merge: true });
      console.log(`✓ Seeded product: ${prod.name_ar} (${prod.price} ج.م)`);
    }
  }

  // 5. Option Groups
  if (seedData.option_groups) {
    for (const grp of seedData.option_groups) {
      await setDoc(doc(db, 'option_groups', grp.id), grp, { merge: true });
    }
    console.log(`✓ Seeded ${seedData.option_groups.length} option groups`);
  }

  // 6. Options
  if (seedData.options) {
    for (const opt of seedData.options) {
      await setDoc(doc(db, 'options', opt.id), opt, { merge: true });
    }
    console.log(`✓ Seeded ${seedData.options.length} options`);
  }

  console.log('\n🎉 ALL POCHINKI DATA SEEDED SUCCESSFULLY INTO LIVE FIRESTORE!');
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
