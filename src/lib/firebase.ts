import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  memoryLocalCache
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Helper functions to safely probe storage capabilities inside sandboxed/restricted iframe environments
const isIndexedDBSupported = (): boolean => {
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return false;
    }
    // Probe opening a test database; if it throws synchrononously (SecurityError), indexedDb is blocked/unsupported
    window.indexedDB.open('__firebase_probe__');
    return true;
  } catch (err) {
    return false;
  }
};

const isLocalStorageSupported = (): boolean => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    window.localStorage.setItem('__firebase_probe__', '1');
    window.localStorage.removeItem('__firebase_probe__');
    return true;
  } catch (err) {
    return false;
  }
};

// Standard and robust initialization of Firebase Auth
export const auth = getAuth(app);
export const storage = getStorage(app);

// Initialize Firestore safely with IndexedDB support checks
let safeDb;
try {
  if (isIndexedDBSupported() && isLocalStorageSupported()) {
    safeDb = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      experimentalForceLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  } else {
    safeDb = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalForceLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  }
} catch (error) {
  console.warn("Firestore custom initialization failed, falling back to standard getFirestore", error);
  safeDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = safeDb;
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const registerWithEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);
export const loginWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const logout = () => signOut(auth);
