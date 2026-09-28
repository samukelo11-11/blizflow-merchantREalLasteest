import {
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type Unsubscribe
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import type { AdminUser } from '../types';

type AuthCallback = (user: AdminUser | null) => void;

const ADMIN_AUTH_KEY = 'blizflow_admin_auth';
const USER_STORAGE_KEY = 'blizflow_user';

// FIX 7: Max age for a remembered admin session (8 hours)
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const listeners = new Set<AuthCallback>();
let authUnsubscribe: Unsubscribe | null = null;

export function isFirebaseConfigured(): boolean {
  const options = auth.app.options;
  return (
    !!options.apiKey &&
    options.apiKey !== 'mock-api-key' &&
    !!options.projectId &&
    !!options.appId
  );
}

// FIX 2: Do NOT pre-populate currentAdminUser from localStorage.
// The only source of truth is Firebase Auth + Firestore verification.
// Callers receive null until onAuthStateChanged fires and confirms identity.
let currentAdminUser: AdminUser | null = null;
let initialized = false;

// FIX 4: Track whether loginAdmin already completed Firestore verification
// so the onAuthStateChanged listener does not double-notify with a second fetch.
let _loginVerifiedUid: string | null = null;

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb(currentAdminUser);
    } catch (e) {
      console.error('[adminAuth] Listener callback threw:', e);
    }
  });
}

// FIX 7: Validates a cached session object has not exceeded max age
function isCachedSessionValid(parsed: Record<string, unknown>): boolean {
  if (!parsed.cachedAt || typeof parsed.cachedAt !== 'number') return false;
  return Date.now() - parsed.cachedAt < SESSION_MAX_AGE_MS;
}

function persistAdminUser(adminUser: AdminUser, rememberMe: boolean): void {
  // FIX 7: Store cachedAt timestamp so we can enforce max age on restore
  const payload = JSON.stringify({ ...adminUser, cachedAt: Date.now() });
  sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
  if (rememberMe) {
    localStorage.setItem(USER_STORAGE_KEY, payload);
  } else {
    sessionStorage.setItem(USER_STORAGE_KEY, payload);
  }
}

function clearPersistedSession(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
}

function initAuthListener() {
  if (authUnsubscribe) return;

  authUnsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!isFirebaseConfigured()) {
      currentAdminUser = null;
      initialized = true;
      notifyListeners();
      return;
    }

    if (user) {
      // FIX 4: If loginAdmin already verified this UID, skip the second
      // Firestore fetch to avoid double-notification and redundant reads.
      if (_loginVerifiedUid === user.uid && currentAdminUser !== null) {
        _loginVerifiedUid = null;
        initialized = true;
        // Already notified by loginAdmin — do not notify again
        return;
      }

      try {
        const docRef = doc(db, 'adminUsers', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists() && docSnap.data().role === 'admin') {
          const data = docSnap.data();
          currentAdminUser = {
            email: user.email || data.email,
            role: 'admin',
            name: data.name || 'System Administrator',
            uid: user.uid
          };
          // Persist with rememberMe=false (session-only) for listener-restored sessions
          persistAdminUser(currentAdminUser, false);
        } else {
          console.warn('[adminAuth] Unauthorized admin login attempt:', user.email);
          // Sign out before clearing state so Firebase session is terminated first
          await signOut(auth);
          currentAdminUser = null;
          clearPersistedSession();
        }
      } catch (error) {
        console.warn('[adminAuth] Error verifying admin status:', error);
        currentAdminUser = null;
        clearPersistedSession();
      }
    } else {
      // FIX 6: No sandbox fallback — null auth state always means logged out.
      // Sandbox/dev tooling should use Firebase Auth emulator instead.
      currentAdminUser = null;
      clearPersistedSession();
    }

    initialized = true;
    notifyListeners();
  });
}

initAuthListener();

export function onAdminAuthChanged(callback: AuthCallback): () => void {
  listeners.add(callback);

  // FIX 2: Only immediately call back with a cached user if Firebase has
  // already confirmed the session (initialized = true). Before that, send
  // null so callers do not act on unverified cached state.
  try {
    callback(initialized ? currentAdminUser : null);
  } catch (e) {
    console.error('[adminAuth] Initial callback threw:', e);
  }

  return () => {
    listeners.delete(callback);
  };
}

export async function loginAdmin(
  email: string,
  password: string,
  rememberMe: boolean
): Promise<AdminUser> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Please ensure Firebase credentials are properly initialized before using admin login.'
    );
  }

  // FIX 1: Removed sandbox fallback entirely. If Firebase Auth throws
  // operation-not-allowed, it is a real configuration error that must be
  // fixed in the Firebase console, not silently bypassed with a fake session.

  const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, persistence);

  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, email, password);
  } catch (err: unknown) {
    const code = (err && typeof err === 'object' && 'code' in err)
      ? (err as { code: string }).code
      : '';
    const message = (err && typeof err === 'object' && 'message' in err)
      ? (err as { message: string }).message
      : '';

    if (
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-credential'
    ) {
      throw new Error('Incorrect email or password.');
    } else if (code === 'auth/invalid-email') {
      throw new Error('Please enter a valid email address.');
    } else if (code === 'auth/operation-not-allowed') {
      // FIX 1: Surface this as a real error, not a fallback trigger.
      throw new Error(
        'Email/password sign-in is not enabled in Firebase Console. ' +
        'Enable it under Authentication → Sign-in method.'
      );
    } else if (message.includes('permission-denied')) {
      throw new Error('Insufficient permissions to access the administrator database.');
    } else {
      throw new Error(message || 'Sign-in failed. Please try again.');
    }
  }

  const user = userCredential.user;

  const docRef = doc(db, 'adminUsers', user.uid);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists() || docSnap.data().role !== 'admin') {
    await signOut(auth);
    throw new Error('Unauthorized: You are not configured as an administrator.');
  }

  const data = docSnap.data();
  const adminUser: AdminUser = {
    email: user.email || data.email,
    role: 'admin',
    name: data.name || 'System Administrator',
    uid: user.uid
  };

  // FIX 4: Mark this UID as verified so onAuthStateChanged skips re-fetching
  _loginVerifiedUid = user.uid;
  currentAdminUser = adminUser;
  persistAdminUser(adminUser, rememberMe);
  initialized = true;
  notifyListeners();

  return adminUser;
}

export async function logoutAdmin(): Promise<void> {
  // FIX 5: Sign out Firebase FIRST, then clear local state.
  // This ensures the Firebase session is terminated even if local
  // cleanup throws, and prevents the UI racing ahead of the sign-out.
  if (isFirebaseConfigured()) {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('[adminAuth] Firebase sign-out error:', e);
      // Still clear local state even if Firebase sign-out fails
    }
  }

  currentAdminUser = null;
  _loginVerifiedUid = null;
  clearPersistedSession();
  notifyListeners();
}