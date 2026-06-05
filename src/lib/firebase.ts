import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
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

const isSessionStorageSupported = (): boolean => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return false;
    }
    window.sessionStorage.setItem('__firebase_probe__', '1');
    window.sessionStorage.removeItem('__firebase_probe__');
    return true;
  } catch (err) {
    return false;
  }
};

// Compile a safe array of persistence layers based on actual browser capabilities
const getSafePersistenceArray = () => {
  const persistences = [];

  // signInWithPopup / signInWithRedirect rely on indexedDBLocalPersistence to synchronize credentials or state.
  // We include indexedDBLocalPersistence if supported so that Google Login works flawlessly inside standalone view windows.
  if (isIndexedDBSupported()) {
    persistences.push(indexedDBLocalPersistence);
  }
  if (isLocalStorageSupported()) {
    persistences.push(browserLocalPersistence);
  }
  if (isSessionStorageSupported()) {
    persistences.push(browserSessionPersistence);
  }
  persistences.push(inMemoryPersistence);
  return persistences;
};

// Safe initialization of Firebase Auth
let safeAuth;
try {
  safeAuth = initializeAuth(app, {
    persistence: getSafePersistenceArray()
  });
} catch (error) {
  try {
    safeAuth = getAuth(app);
  } catch (getAuthError) {
    console.error("Critical: Could not initialize or retrieve Firebase Auth", getAuthError);
    // Ultimate fallback as single value
    safeAuth = initializeAuth(app, {
      persistence: inMemoryPersistence
    });
  }
}

export const auth = safeAuth;
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
