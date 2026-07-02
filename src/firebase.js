import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if credentials are correct / not placeholders
const isConfigured = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'your-api-key-here' &&
  firebaseConfig.projectId;

let app = null;
let db = null;
let storage = null;
let auth = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);
    console.log('⚡ Firebase successfully initialized and active.');
  } catch (error) {
    console.error('❌ Error initializing Firebase:', error);
  }
} else {
  console.warn('⚠️ Firebase credentials missing or placeholder found. Running in Local Mock Mode.');
}

export { db, storage, auth };
export const isFirebaseActive = !!(db && storage);
export default app;
