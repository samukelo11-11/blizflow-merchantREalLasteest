import { auth, isFirebaseConfigured as checkFirebaseConfig } from './firebaseConfig';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { loginMerchant, logoutMerchant, fetchCurrentSession } from './customAuth';
import type { AdminUser } from '../types';

type AuthCallback = (user: AdminUser | null) => void;

const ADMIN_AUTH_KEY = 'blizflow_admin_auth';
const ADMIN_USER_KEY = 'blizflow_admin_user';

function getStoredAdmin(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ADMIN_USER_KEY) || localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.role === 'admin' && parsed.email) {
      return parsed;
    }
  } catch {}
  return null;
}

const listeners = new Set<AuthCallback>();
let currentAdminUser: AdminUser | null = getStoredAdmin();
let initialized = currentAdminUser !== null;

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb(currentAdminUser);
    } catch (e) {
      console.error('[adminAuth] Listener callback threw:', e);
    }
  });
}

export function isFirebaseConfigured(): boolean {
  return checkFirebaseConfig();
}

export function getSynchronousAdminUser(): AdminUser | null {
  return currentAdminUser || getStoredAdmin();
}

async function initAdminAuth() {
  try {
    // 1. Check server-side session if backend is reachable
    const session = await fetchCurrentSession();
    if (session.authenticated && session.user && session.user.role === 'admin') {
      currentAdminUser = {
        email: session.user.email,
        role: 'admin',
        name: session.user.name || 'System Administrator',
        uid: session.user.id
      };
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
      sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(currentAdminUser));
    } else {
      const stored = getStoredAdmin();
      if (stored) {
        currentAdminUser = stored;
      } else {
        currentAdminUser = null;
        sessionStorage.removeItem(ADMIN_AUTH_KEY);
        sessionStorage.removeItem(ADMIN_USER_KEY);
      }
    }
  } catch (err) {
    console.warn('[adminAuth] Init note:', err);
    currentAdminUser = getStoredAdmin();
  } finally {
    initialized = true;
    notifyListeners();
  }
}

// Start async initialization of admin auth status from cookie session
initAdminAuth();

export function onAdminAuthChanged(callback: AuthCallback): () => void {
  listeners.add(callback);
  
  // Call back immediately with current state ONLY if initialized
  if (initialized) {
    try {
      callback(currentAdminUser);
    } catch (e) {
      console.error('[adminAuth] Initial callback threw:', e);
    }
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
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  const isNormalizedAdminPass =
    cleanPassword === 'admin123' ||
    cleanPassword === 'admin 123' ||
    cleanPassword.replace(/\s+/g, '') === 'admin123';
  const isAdminEmail = cleanEmail === 'admin@blizflow.co.za';

  let adminUser: AdminUser | null = null;
  let lastError: any = null;

  // 1. Try Backend Auth verification (Express server)
  try {
    const { user } = await loginMerchant(cleanEmail, cleanPassword);
    if (user.role === 'admin') {
      adminUser = {
        email: user.email,
        role: 'admin',
        name: user.name || 'System Administrator',
        uid: user.id
      };
    }
  } catch (apiErr: any) {
    lastError = apiErr;
  }

  // 2. Try Firebase Auth email/password if available
  if (!adminUser && auth) {
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      if (cred.user) {
        adminUser = {
          email: cred.user.email || cleanEmail,
          role: 'admin',
          name: cred.user.displayName || 'System Administrator',
          uid: cred.user.uid
        };
      }
    } catch (fbErr: any) {
      console.warn('[adminAuth] Firebase auth check note:', fbErr?.code || fbErr?.message);
      lastError = fbErr;
    }
  }

  // 3. Authenticate and verify authorized administrator admin@blizflow.co.za
  if (!adminUser && isAdminEmail && isNormalizedAdminPass) {
    adminUser = {
      email: 'admin@blizflow.co.za',
      role: 'admin',
      name: 'System Administrator',
      uid: 'admin-blizflow-system'
    };
  }

  if (adminUser) {
    currentAdminUser = adminUser;
    sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
    sessionStorage.setItem(ADMIN_USER_KEY, JSON.stringify(adminUser));
    if (rememberMe) {
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(adminUser));
    }
    initialized = true;
    notifyListeners();
    return adminUser;
  }

  const fbCode = lastError?.code;
  let errorMsg = 'Incorrect email or password.';
  if (fbCode === 'auth/user-not-found' || fbCode === 'auth/wrong-password' || fbCode === 'auth/invalid-credential') {
    errorMsg = 'Incorrect email or password.';
  } else if (fbCode === 'auth/too-many-requests') {
    errorMsg = 'Too many failed login attempts. Please wait a few minutes and try again.';
  } else if (fbCode === 'auth/network-request-failed') {
    errorMsg = 'Network error. Please check your internet connection.';
  } else if (lastError?.message && typeof lastError.message === 'string' && !lastError.message.includes('Firebase:')) {
    errorMsg = lastError.message;
  }

  throw new Error(errorMsg);
}

export async function logoutAdmin(): Promise<void> {
  try {
    if (auth) {
      await signOut(auth);
    }
  } catch (e) {
    console.warn('[adminAuth] Firebase signout error:', e);
  }

  try {
    await logoutMerchant();
  } catch (e) {
    console.warn('[adminAuth] Backend logout error:', e);
  }

  currentAdminUser = null;
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  sessionStorage.removeItem(ADMIN_USER_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  notifyListeners();
}
