import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file without external dependencies
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        env[key] = val;
      }
    }
  }
  return env;
}

const env = loadEnv();

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCPi2WcuRrHF9rJMtEHhK90iPMDv6hsCKE',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'pochinki-burger.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'pochinki-burger',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'pochinki-burger.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '401976740458',
  appId: env.VITE_FIREBASE_APP_ID || '1:401976740458:web:a872ab6e70b86a81285813',
};

console.log('--- Pochinki Clean Slate Script ---');
console.log('Connecting to Firebase Project:', firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function cleanSlate() {
  try {
    console.log('Authenticating as Super Admin (admin@pochinki.com)...');
    await signInWithEmailAndPassword(auth, 'admin@pochinki.com', 'Pochinki@2026!');
    console.log('Super Admin authenticated successfully.');

    // 1. Clear orders
    console.log('Fetching orders collection...');
    const ordersSnap = await getDocs(collection(db, 'orders'));
    console.log(`Found ${ordersSnap.size} orders to delete.`);

    if (!ordersSnap.empty) {
      let batch = writeBatch(db);
      let count = 0;
      let totalDeleted = 0;

      for (const orderDoc of ordersSnap.docs) {
        batch.delete(orderDoc.ref);
        count++;
        totalDeleted++;
        if (count === 400) {
          await batch.commit();
          console.log(`Committed batch of ${count} orders deleted.`);
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${count} orders deleted.`);
      }
      console.log(`Successfully deleted all ${totalDeleted} orders.`);
    } else {
      console.log('Orders collection is already empty.');
    }

    // 2. Clear idempotency_records
    console.log('Fetching idempotency_records collection...');
    const idempSnap = await getDocs(collection(db, 'idempotency_records'));
    console.log(`Found ${idempSnap.size} idempotency records to delete.`);

    if (!idempSnap.empty) {
      let batch = writeBatch(db);
      for (const recDoc of idempSnap.docs) {
        batch.delete(recDoc.ref);
      }
      await batch.commit();
      console.log(`Successfully deleted ${idempSnap.size} idempotency records.`);
    }

    // 3. Reset order_counter in counters collection
    console.log('Resetting counters/order_counter to 1000...');
    const counterRef = doc(db, 'counters', 'order_counter');
    await setDoc(counterRef, {
      current_number: 1000,
      updated_at: serverTimestamp()
    }, { merge: true });
    console.log('Counter reset: Next order will be #1001.');

    console.log('\n=======================================');
    console.log(' DATABASE FRESH RESET COMPLETED SAFELY ');
    console.log('=======================================');
    console.log('Keep intact:');
    console.log('- Menu items & burgers');
    console.log('- Sauces and upgrades');
    console.log('- Admin accounts (admin, stadium_admin, caravan_admin)');
    console.log('- Branch & operational settings');
    console.log('\nCleared:');
    console.log('- All orders (0 orders remaining)');
    console.log('- All idempotency records');
    console.log('- Counter set to 1000 (next order #1001)');
    console.log('=======================================\n');
    process.exit(0);
  } catch (err) {
    console.error('Clean Slate failed:', err);
    process.exit(1);
  }
}

cleanSlate();
