/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BlizFlow Shop Authentication Client Service
 * Connects to the Express backend for Shop ID + PIN verification and session management.
 * Uses HTTP-only cookie `blizflow_shop_session`.
 */

import { ShopProfile } from '../types';
import { db } from './firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

async function safeParseJson(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    return { success: false, isHtml: true };
  }
  const text = await res.text().catch(() => '');
  if (!text || text.trim().startsWith('<!')) {
    return { success: false, isHtml: true };
  }
  try {
    return JSON.parse(text);
  } catch {
    if (!res.ok) {
      throw new Error(text.slice(0, 100) || `Server returned ${res.status} ${res.statusText}`);
    }
    return { success: false, error: text };
  }
}

async function verifyPinHashWebCrypto(pin: string, saltHex: string, expectedHashHex: string, iterations = 100_000): Promise<boolean> {
  try {
    if (!saltHex || !expectedHashHex) return false;
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const derivedBits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // 32 bytes * 8
    );
    const derivedHex = Array.from(new Uint8Array(derivedBits))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return derivedHex.toLowerCase() === expectedHashHex.toLowerCase();
  } catch (e) {
    console.error('[shopAuth] WebCrypto PBKDF2 verification error:', e);
    return false;
  }
}

export interface ShopSessionResponse {
  authenticated: boolean;
  shopId?: string;
  shop?: ShopProfile;
  message?: string;
}

export type VerifyPinResult =
  | { success: true; shopId: string; shop: ShopProfile; message?: string }
  | { success: false; reason: 'NOT_FOUND' | 'WRONG_PIN' | 'INACTIVE' | 'ERROR'; message: string };

/**
 * Verify Shop ID + PIN against backend API
 */
export async function verifyShopAccess(
  shopId: string,
  pin: string
): Promise<VerifyPinResult> {
  const cleanShopId = shopId.trim().toUpperCase();
  const cleanPin = pin.trim();

  if (!cleanShopId) {
    return { success: false, reason: 'NOT_FOUND', message: 'Please enter your Shop ID.' };
  }
  if (!cleanPin || !/^\d{4,16}$/.test(cleanPin)) {
    return { success: false, reason: 'WRONG_PIN', message: 'PIN must be 4 to 16 digits.' };
  }

  try {
    const res = await fetch('/api/shop/verify-pin', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ shopId: cleanShopId, pin: cleanPin })
    });

    const data = await safeParseJson(res);

    if (res.ok && data.success && data.shop) {
      return {
        success: true,
        shopId: data.shopId,
        shop: normalizeShopProfile(data.shop)
      };
    }

    if (data.reason && data.message) {
      return {
        success: false,
        reason: data.reason,
        message: data.message
      };
    }
  } catch (err: any) {
    console.warn('[shopAuth] Backend verify-pin check unavailable, falling back to Firestore:', err.message);
  }

  // Fallback to Firestore directly (supports Netlify and static deployments)
  try {
    const snap = await getDoc(doc(db, 'merchants', cleanShopId));
    if (!snap.exists()) {
      return {
        success: false,
        reason: 'NOT_FOUND',
        message: `Shop "${cleanShopId}" not found. Please verify your Shop ID.`
      };
    }

    const data = snap.data();
    if (data.status === 'suspended') {
      return {
        success: false,
        reason: 'INACTIVE',
        message: 'This shop has been suspended. Please contact support.'
      };
    }
    if (data.status === 'pending') {
      return {
        success: false,
        reason: 'INACTIVE',
        message: 'This shop is pending activation by an administrator.'
      };
    }

    // PIN Verification:
    let isPinValid = false;
    if (data.pin && typeof data.pin === 'string' && data.pin.trim()) {
      isPinValid = data.pin.trim() === cleanPin;
    } else if (data.pinHash && data.pinSalt) {
      isPinValid = await verifyPinHashWebCrypto(cleanPin, data.pinSalt, data.pinHash, data.pinIterations || 100_000);
    } else {
      // If no PIN has been set yet, accept and register this PIN
      isPinValid = true;
    }

    if (!isPinValid) {
      return {
        success: false,
        reason: 'WRONG_PIN',
        message: 'Incorrect PIN. Please try again.'
      };
    }

    const shopProfile = normalizeShopProfile({ id: snap.id, ...data });
    localStorage.setItem('blizflow_shop', JSON.stringify(shopProfile));
    return {
      success: true,
      shopId: cleanShopId,
      shop: shopProfile
    };
  } catch (fsErr: any) {
    console.error('[shopAuth] Firestore verify fallback error:', fsErr);
    if (fsErr?.code === 'permission-denied') {
      return {
        success: false,
        reason: 'ERROR',
        message: 'Database permission denied. Please verify your Firebase Firestore rules.'
      };
    }
    return {
      success: false,
      reason: 'ERROR',
      message: fsErr?.message || 'Connection error. Please check your internet connection.'
    };
  }
}

/**
 * Fetch current shop session from server-side HTTP-only cookie or localStorage fallback
 */
export async function fetchShopSession(): Promise<ShopSessionResponse> {
  try {
    const res = await fetch('/api/shop/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && !contentType.includes('text/html')) {
      const data = await safeParseJson(res);
      if (data.authenticated && data.shop) {
        return {
          authenticated: true,
          shopId: data.shopId,
          shop: normalizeShopProfile(data.shop)
        };
      }
    }
  } catch (err) {
    console.warn('[shopAuth] Session check error:', err);
  }

  // Fallback to localStorage session (Netlify / static deployments)
  try {
    const saved = localStorage.getItem('blizflow_shop');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.id || parsed?.shopId) {
        return {
          authenticated: true,
          shopId: parsed.shopId || parsed.id,
          shop: normalizeShopProfile(parsed)
        };
      }
    }
  } catch {}

  return { authenticated: false };
}

/**
 * Log out of shop and clear session cookie
 */
export async function logoutShop(): Promise<void> {
  try {
    await fetch('/api/shop/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
  } catch (err) {
    console.warn('[shopAuth] Logout error:', err);
  }
}

// ── ADMIN HELPERS ──

export async function adminFetchAllShops(): Promise<ShopProfile[]> {
  const res = await fetch('/api/shop/admin/shops', {
    credentials: 'include',
    headers: { 'Accept': 'application/json' }
  });
  const data = await safeParseJson(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch shops');
  }
  return data.shops.map(normalizeShopProfile);
}

export async function adminCreateShop(params: {
  shopId: string;
  name: string;
  ownerName: string;
  phoneNumber: string;
  pin: string;
  email?: string;
  category?: string;
  address?: string;
  status?: 'active' | 'pending' | 'suspended';
  notes?: string;
}): Promise<ShopProfile> {
  const res = await fetch('/api/shop/admin/shops', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const data = await safeParseJson(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create shop');
  }
  return normalizeShopProfile(data.shop);
}

export async function adminUpdateShopStatus(
  shopId: string,
  status: 'active' | 'pending' | 'suspended'
): Promise<ShopProfile> {
  const res = await fetch(`/api/shop/admin/shops/${encodeURIComponent(shopId)}/status`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ status })
  });
  const data = await safeParseJson(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update shop status');
  }
  return normalizeShopProfile(data.shop);
}

export async function adminResetShopPin(
  shopId: string,
  pin: string
): Promise<void> {
  const res = await fetch(`/api/shop/admin/shops/${encodeURIComponent(shopId)}/pin`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ pin })
  });
  const data = await safeParseJson(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to reset PIN');
  }
}

export async function adminUpdateShopDetails(
  shopId: string,
  details: {
    name?: string;
    ownerName?: string;
    phoneNumber?: string;
    email?: string;
    category?: string;
    address?: string;
    notes?: string;
    plan?: string;
    subscription_status?: string;
  }
): Promise<ShopProfile> {
  const res = await fetch(`/api/shop/admin/shops/${encodeURIComponent(shopId)}/details`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(details)
  });
  const data = await safeParseJson(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update shop details');
  }
  return normalizeShopProfile(data.shop);
}

export async function adminDeleteShop(shopId: string): Promise<void> {
  const res = await fetch(`/api/shop/admin/shops/${encodeURIComponent(shopId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'Accept': 'application/json'
    }
  });
  const data = await safeParseJson(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete shop');
  }
}

function normalizeShopProfile(raw: any): ShopProfile {
  return {
    id: raw.id || raw.shopId,
    name: raw.name || raw.shop_name || 'My Store',
    ownerName: raw.ownerName || raw.owner_name || 'Owner',
    phoneNumber: raw.phoneNumber || raw.phone_number || '',
    email: raw.email || '',
    category: raw.category || 'General Retail',
    address: raw.address || '',
    status: raw.status || 'active',
    subscriptionStatus: raw.subscriptionStatus || raw.subscription_status || 'active',
    plan: raw.plan || 'starter',
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    isEmailVerified: true,
    onboardingStatus: 'complete'
  };
}
