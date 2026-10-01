import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type FirestoreSettings
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG SOURCES
// Priority: environment variables (e.g. Vercel) → JSON applet config (AI Studio)
// Vite eager glob safely imports the file if present without failing the build if absent.
// ─────────────────────────────────────────────────────────────────────────────

import appletConfigJson from '@/firebase-applet-config.json';

const appletConfig: Record<string, string> = (appletConfigJson as any)?.default || appletConfigJson || {};

function getFirebaseConfig() {
  const apiKey            = appletConfig.apiKey            || import.meta.env.VITE_FIREBASE_API_KEY             || '';
  const authDomain        = appletConfig.authDomain        || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || '';
  const projectId         = appletConfig.projectId         || import.meta.env.VITE_FIREBASE_PROJECT_ID          || '';
  const storageBucket     = appletConfig.storageBucket     || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || '';
  const messagingSenderId = appletConfig.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '';
  const appId             = appletConfig.appId             || import.meta.env.VITE_FIREBASE_APP_ID              || '';
  const measurementId     = appletConfig.measurementId     || import.meta.env.VITE_FIREBASE_MEASUREMENT_ID      || '';
  const databaseId        = appletConfig.firestoreDatabaseId || import.meta.env.VITE_FIREBASE_DATABASE_ID         || '(default)';

  const isValid = !!apiKey && apiKey !== 'mock-api-key' && apiKey !== 'unconfigured' && !!projectId && !!appId;

  if (!isValid) {
    console.error('[firebaseConfig] Missing environment variables. Set VITE_FIREBASE_* in Vercel or environment.');
    return {
      apiKey:            'unconfigured',
      authDomain:        'unconfigured.firebaseapp.com',
      projectId:         'unconfigured',
      storageBucket:     'unconfigured.appspot.com',
      messagingSenderId: '000000000000',
      appId:             '1:000000000000:web:000000',
      measurementId:     '',
      databaseId:        '(default)',
    };
  }

  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, measurementId, databaseId };
}

const { databaseId, ...firebaseConfig } = getFirebaseConfig();
const app = initializeApp(firebaseConfig);

const firestoreSettings: FirestoreSettings = { ignoreUndefinedProperties: true };
if (typeof window !== 'undefined') {
  firestoreSettings.localCache = persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  });
}
export const db = initializeFirestore(app, firestoreSettings, databaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST   = 'list',
  GET    = 'get',
  WRITE  = 'write',
}

export interface FirestoreErrorInfo {
  code: string;
  message: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?:        string | null;
    emailMasked?:   string | null;
    emailVerified?: boolean | null;
    isAnonymous?:   boolean | null;
  };
}

export class FirestoreOperationError extends Error {
  public readonly info: FirestoreErrorInfo;
  constructor(info: FirestoreErrorInfo) {
    super(info.message);
    this.name = 'FirestoreOperationError';
    this.info = info;
  }
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  if (local.length <= 3) return `***@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const raw     = error as Record<string, unknown> | null;
  const code    = typeof raw?.code === 'string' ? raw.code : 'unknown';
  const message = error instanceof Error ? error.message : String(error);

  const info: FirestoreErrorInfo = {
    code,
    message,
    operationType,
    path,
    authInfo: {
      userId:        null,
      emailMasked:   null,
      emailVerified: null,
      isAnonymous:   null,
    },
  };

  if (import.meta.env.DEV) {
    console.error('[firebaseConfig] Firestore Error:', info);
  } else {
    console.error('[firebaseConfig] Firestore Error:', {
      code:          info.code,
      operationType: info.operationType,
      path:          info.path,
    });
  }

  throw new FirestoreOperationError(info);
}

export function isFirebaseConfigured(): boolean {
  const o = app.options;
  return (
    !!o.apiKey &&
    o.apiKey !== 'mock-api-key' &&
    o.apiKey !== 'unconfigured' &&
    !!o.projectId &&
    !!o.appId
  );
}
