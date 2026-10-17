import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  const groupsSnap = await getDocs(collection(db, 'option_groups'));
  console.log(`=== option_groups: ${groupsSnap.size} docs ===`);
  groupsSnap.forEach(d => console.log(d.id, '=>', JSON.stringify(d.data())));

  const optionsSnap = await getDocs(collection(db, 'options'));
  console.log(`=== options: ${optionsSnap.size} docs ===`);
  optionsSnap.forEach(d => console.log(d.id, '=>', JSON.stringify(d.data())));
  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
