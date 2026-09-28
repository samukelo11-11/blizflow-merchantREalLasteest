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
// Priority: environment variables → JSON applet config → fail loudly
// The JSON file is only used when env variables are absent (e.g. AI Studio).
// Never commit the JSON file to a public repository.
// ─────────────────────────────────────────────────────────────────────────────

// Attempt to load the applet config — gracefully handle missing file
let appletConfig: Record<string, string> = {};
try {
  // This import is resolved at build time by Vite.
  // If the file does not exist at this path the build will fail with a
  // clear "Cannot find module" error rather than a silent runtime failure.
  const raw = await import('../../firebase-applet-config.json');
  appletConfig = raw.default || raw;
} catch {
  // File not present — will rely on env variables only
  if (import.meta.env.DEV) {
    console.info('[firebaseConfig] firebase-applet-config.json not found — using env variables only.');
  }
}

function getFirebaseConfig() {
  // Env variables take priority; fall back to JSON applet config values
  const apiKey           = import.meta.env.VITE_FIREBASE_API_KEY            || appletConfig.apiKey            || '';
  const authDomain       = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || appletConfig.authDomain        || '';
  const projectId        = import.meta.env.VITE_FIREBASE_PROJECT_ID         || appletConfig.projectId         || '';
  const storageBucket    = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || appletConfig.storageBucket     || '';
  const messagingSenderId= import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| appletConfig.messagingSenderId || '';
  const appId            = import.meta.env.VITE_FIREBASE_APP_ID             || appletConfig.appId             || '';
  const measurementId    = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || appletConfig.measurementId     || '';
  const databaseId       = import.meta.env.VITE_FIREBASE_DATABASE_ID        || appletConfig.firestoreDatabaseId || '(default)';

  // Startup diagnostic — always visible in console so you can see
  // exactly what the app resolved before Firebase is initialised
  console.info('[firebaseConfig] Resolved config:', {
    apiKey:      apiKey      ? `${apiKey.substring(0, 8)}...` : 'MISSING',
    authDomain:  authDomain  || 'MISSING',
    projectId:   projectId   || 'MISSING',
    appId:       appId       ? `${appId.substring(0, 12)}...` : 'MISSING',
    databaseId,
    source: import.meta.env.VITE_FIREBASE_API_KEY
      ? 'env variables'
      : appletConfig.apiKey
        ? 'applet config JSON'
        : 'NONE — will fail',
  });

  const isValid =
    !!apiKey &&
    apiKey !== 'mock-api-key' &&
    apiKey !== 'unconfigured' &&
    apiKey.trim() !== '' &&
    !!projectId &&
    !!appId;

  if (!isValid) {
    const missing: string[] = [];
    if (!apiKey || apiKey === 'mock-api-key' || apiKey === 'unconfigured') missing.push('FIREBASE_API_KEY');
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!appId)     missing.push('FIREBASE_APP_ID');
    if (!authDomain) missing.push('FIREBASE_AUTH_DOMAIN');

    console.error(
      '[firebaseConfig] ❌ Firebase credentials missing or invalid.',
      '\nMissing:', missing.join(', '),
      '\nFix: set VITE_* environment variables or provide a valid firebase-applet-config.json at the project root.'
    );

    // Return placeholder so the module loads without crashing.
    // isFirebaseConfigured() returns false so callers can gate on it.
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
const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore — persistent cache only in browser environments
const firestoreSettings: FirestoreSettings = { ignoreUndefinedProperties: true };
if (typeof window !== 'undefined') {
  firestoreSettings.localCache = persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  });
}
export const db = initializeFirestore(app, firestoreSettings, databaseId);

// ── Operation types ──────────────────────────────────────────────────────────

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
    userId?:       string | null;
    emailMasked?:  string | null;
    emailVerified?: boolean | null;
    isAnonymous?:  boolean | null;
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
      userId:        auth.currentUser?.uid           ?? null,
      emailMasked:   maskEmail(auth.currentUser?.email),
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous:   auth.currentUser?.isAnonymous   ?? null,
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
  const o = auth.app.options;
  return (
    !!o.apiKey &&
    o.apiKey !== 'mock-api-key' &&
    o.apiKey !== 'unconfigured' &&
    !!o.projectId &&
    !!o.appId
  );
}