import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

/*
 * Firebase Web configuration. These identifiers are safe to expose in a
 * browser; protect user data with Firebase Authentication and Firestore rules.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCFcxfWgHFwsKewE_dOCbXEr-9NYN0N10Y',
  authDomain: 'school-helping-ai.firebaseapp.com',
  projectId: 'school-helping-ai',
  storageBucket: 'school-helping-ai.firebasestorage.app',
  messagingSenderId: '252849456657',
  appId: '1:252849456657:web:9c414910589dbfe84293b0',
  measurementId: 'G-392LJNWFDL'
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const authReady = setPersistence(auth, browserLocalPersistence);

// The backend is the only place where private AI and service credentials live.
const isLocalApiHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const configuredApiUrl = window.__API_BASE_URL__ || '';
export const API_BASE_URL = isLocalApiHost
  ? (configuredApiUrl || 'http://localhost:3000')
  : '';
