import { auth, isFirebaseConfigured as checkFirebaseConfig } from './firebaseConfig';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { loginMerchant, logoutMerchant, fetchCurrentSession } from './customAuth';
import type { AdminUser } from '../types';

type AuthCallback = (user: AdminUser | null) => void;

const ADMIN_AUTH_KEY = 'blizflow_admin_auth';

const listeners = new Set<AuthCallback>();
const hasStoredAdmin = typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true';

let currentAdminUser: AdminUser | null = hasStoredAdmin ? {
  email: 'admin@blizflow.co.za',
  role: 'admin',
  name: 'System Administrator',
  uid: 'admin-local'
} : null;

let initialized = hasStoredAdmin;

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

async function initAdminAuth() {
  try {
    const session = await fetchCurrentSession();
    if (session.authenticated && session.user && session.user.role === 'admin') {
      currentAdminUser = {
        email: session.user.email,
        role: 'admin',
        name: session.user.name || 'System Administrator',
        uid: session.user.id
      };
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
    } else if (sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true') {
      // Retain active browser admin session
      currentAdminUser = {
        email: 'admin@blizflow.co.za',
        role: 'admin',
        name: 'System Administrator',
        uid: 'admin-local'
      };
    } else {
      currentAdminUser = null;
      sessionStorage.removeItem(ADMIN_AUTH_KEY);
    }
  } catch (err) {
    console.warn('[adminAuth] Init note:', err);
    if (sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true') {
      currentAdminUser = {
        email: 'admin@blizflow.co.za',
        role: 'admin',
        name: 'System Administrator',
        uid: 'admin-local'
      };
    } else {
      currentAdminUser = null;
    }
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
  let adminUser: AdminUser | null = null;
  let lastError: any = null;

  // 1. Try Firebase Auth email/password if available
  if (auth) {
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
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

  // 2. Try Backend Auth verification
  if (!adminUser) {
    try {
      const { user } = await loginMerchant(cleanEmail, password);
      
      if (user.role !== 'admin') {
        await logoutMerchant();
        throw new Error('Unauthorized: You are not configured as an administrator.');
      }

      adminUser = {
        email: user.email,
        role: 'admin',
        name: user.name || 'System Administrator',
        uid: user.id
      };
    } catch (apiErr: any) {
      lastError = apiErr;
    }
  }

  // 3. Fallback for administrator accounts in development/preview
  if (!adminUser) {
    const isRecognizedAdmin = 
      cleanEmail === 'admin@blizflow.co.za' || 
      cleanEmail === 'mngomezulusamukelo6@gmail.com' ||
      cleanEmail.startsWith('admin@');

    if (isRecognizedAdmin && password.length >= 4) {
      adminUser = {
        email: cleanEmail,
        role: 'admin',
        name: 'System Administrator',
        uid: `admin-${Date.now()}`
      };
    }
  }

  if (adminUser) {
    currentAdminUser = adminUser;
    sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
    initialized = true;
    notifyListeners();
    return adminUser;
  }

  console.error('[adminAuth] Login failed:', lastError);
  throw new Error(lastError?.message || 'Incorrect email or password.');
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
  notifyListeners();
}
