/**
 * Custom Authentication Client Service
 * Connects directly to backend API (/api/auth/*) using secure HTTP-only cookies.
 */

import { ShopProfile } from '../types';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'merchant' | 'admin';
  shopId: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser | null;
  shop: ShopProfile | null;
  subscription?: any;
}

export async function fetchCurrentSession(): Promise<AuthSessionResponse> {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      return { authenticated: false, user: null, shop: null };
    }
    const data = await res.json();
    if (data.authenticated && data.shop) {
      // Normalize shop profile to match ShopProfile interface
      const normalizedShop: ShopProfile = {
        id: data.shop.id,
        name: data.shop.shop_name || data.shop.name || 'My Store',
        ownerName: data.shop.owner_name || data.user?.name || 'Owner',
        phoneNumber: data.shop.phone_number || '',
        email: data.user?.email || data.shop.email,
        category: data.shop.category || 'Grocery & Supermarket',
        address: data.shop.address || '',
        status: data.shop.status || 'open',
        subscriptionStatus: data.shop.subscription_status || data.shop.subscriptionStatus || 'trial',
        plan: data.shop.plan || 'starter',
        trialEndsAt: data.shop.trial_ends_at || data.shop.trialEndsAt,
        nextRenewalDate: data.shop.next_renewal_date || data.shop.nextRenewalDate,
        createdAt: data.shop.created_at || data.shop.createdAt || new Date().toISOString(),
        isEmailVerified: true,
        onboardingStatus: 'complete'
      };
      return {
        authenticated: true,
        user: data.user,
        shop: normalizedShop,
        subscription: data.subscription
      };
    }
    return { authenticated: false, user: null, shop: null };
  } catch (err) {
    console.warn('[customAuth] Session fetch warning:', err);
    return { authenticated: false, user: null, shop: null };
  }
}

export async function registerMerchant(
  email: string,
  password: string,
  name?: string,
  shopName?: string
): Promise<{ user: AuthUser; shop: ShopProfile }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ email, password, name, shopName })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Registration failed. Please try again.');
  }

  const rawShop = data.shop;
  const normalizedShop: ShopProfile = {
    id: rawShop.id,
    name: rawShop.shop_name || rawShop.name || `${data.user.name}'s Store`,
    ownerName: rawShop.owner_name || data.user.name,
    phoneNumber: rawShop.phone_number || '',
    email: data.user.email,
    category: rawShop.category || 'Grocery & Supermarket',
    address: rawShop.address || '',
    status: rawShop.status || 'open',
    subscriptionStatus: rawShop.subscription_status || 'trial',
    plan: rawShop.plan || 'starter',
    trialEndsAt: rawShop.trial_ends_at,
    createdAt: rawShop.created_at || new Date().toISOString(),
    isEmailVerified: true,
    onboardingStatus: 'complete'
  };

  return {
    user: data.user,
    shop: normalizedShop
  };
}

export async function loginMerchant(
  email: string,
  password: string
): Promise<{ user: AuthUser; shop: ShopProfile }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Invalid email or password.');
  }

  const rawShop = data.shop || {};
  const normalizedShop: ShopProfile = {
    id: rawShop.id || data.user.shopId,
    name: rawShop.shop_name || rawShop.name || `${data.user.name}'s Store`,
    ownerName: rawShop.owner_name || data.user.name,
    phoneNumber: rawShop.phone_number || '',
    email: data.user.email,
    category: rawShop.category || 'Grocery & Supermarket',
    address: rawShop.address || '',
    status: rawShop.status || 'open',
    subscriptionStatus: rawShop.subscription_status || rawShop.subscriptionStatus || 'trial',
    plan: rawShop.plan || 'starter',
    trialEndsAt: rawShop.trial_ends_at || rawShop.trialEndsAt,
    nextRenewalDate: rawShop.next_renewal_date || rawShop.nextRenewalDate,
    createdAt: rawShop.created_at || new Date().toISOString(),
    isEmailVerified: true,
    onboardingStatus: 'complete'
  };

  return {
    user: data.user,
    shop: normalizedShop
  };
}

export async function logoutMerchant(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
  } catch (err) {
    console.warn('[customAuth] Logout error:', err);
  }
}

export async function updateUserPassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/api/auth/update-password', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Failed to update password.');
  }
}
