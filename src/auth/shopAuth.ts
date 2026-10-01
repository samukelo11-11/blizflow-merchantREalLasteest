/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BlizFlow Shop Authentication Bridge
 * Provides shop management operations backed by the Express server and Firestore.
 */

import {
  adminCreateShop,
  adminUpdateShopStatus,
  adminResetShopPin,
  adminUpdateShopDetails,
  adminDeleteShop,
  adminFetchAllShops
} from '../services/shopAuth';
import { ShopProfile } from '../types';
import { db } from '../services/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

export interface ShopRecord {
  id: string;
  shopId: string;
  name: string;
  ownerName: string;
  phoneNumber?: string;
  email?: string;
  category?: string;
  address?: string;
  status: 'active' | 'pending' | 'suspended';
  plan?: 'starter' | 'growth' | 'pro';
  subscriptionStatus?: string;
  createdAt: string;
}

export interface CreateShopParams {
  shopId: string;
  name: string;
  ownerName: string;
  phoneNumber?: string;
  email?: string;
  category?: string;
  address?: string;
  pin: string;
  plan?: 'starter' | 'growth' | 'pro';
  status?: 'active' | 'pending' | 'suspended';
}

export interface ShopOperationResult {
  success: boolean;
  shop?: ShopRecord;
  error?: string;
}

/**
 * Normalizes a shop profile to include both `id` and `shopId`
 */
export function normalizeShopRecord(raw: any): ShopRecord {
  const shopId = raw.shopId || raw.id || '';
  return {
    id: shopId,
    shopId,
    name: raw.name || raw.shop_name || 'My Store',
    ownerName: raw.ownerName || raw.owner_name || 'Owner',
    phoneNumber: raw.phoneNumber || raw.phone_number || '',
    email: raw.email || '',
    category: raw.category || 'Grocery & Spaza Shop',
    address: raw.address || '',
    status: (raw.status === 'active' || raw.status === 'suspended') ? raw.status : 'pending',
    plan: (raw.plan === 'growth' || raw.plan === 'pro') ? raw.plan : 'starter',
    subscriptionStatus: raw.subscriptionStatus || raw.subscription_status || 'active',
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString()
  };
}

/**
 * Creates a new shop record via the backend API and syncs to Firestore
 */
export async function createShop(params: CreateShopParams): Promise<ShopOperationResult> {
  try {
    const cleanId = params.shopId.replace(/[^A-Za-z0-9_-]/g, '').trim().toUpperCase();
    if (!cleanId) return { success: false, error: 'Shop ID is required.' };
    if (!params.name.trim()) return { success: false, error: 'Shop Name is required.' };
    if (!/^\d{4,16}$/.test(params.pin.trim())) {
      return { success: false, error: 'PIN must be 4–16 digits.' };
    }

    const created = await adminCreateShop({
      shopId: cleanId,
      name: params.name.trim(),
      ownerName: params.ownerName.trim() || 'Owner',
      phoneNumber: params.phoneNumber?.trim() || '',
      email: params.email?.trim() || '',
      category: params.category || 'Grocery & Spaza Shop',
      address: params.address?.trim() || '',
      pin: params.pin.trim(),
      status: params.status || 'pending'
    });

    if (params.plan && params.plan !== 'starter') {
      try {
        await adminUpdateShopDetails(cleanId, { plan: params.plan });
        created.plan = params.plan;
      } catch (e) {
        console.warn('[shopAuth] Plan update note:', e);
      }
    }

    // Mirror to Firestore merchants collection for real-time subscribers
    try {
      await setDoc(doc(db, 'merchants', cleanId), {
        id: cleanId,
        shopId: cleanId,
        name: created.name,
        ownerName: created.ownerName,
        phoneNumber: created.phoneNumber,
        email: created.email,
        category: created.category,
        address: created.address,
        status: created.status,
        plan: created.plan || 'starter',
        createdAt: created.createdAt
      }, { merge: true });
    } catch (fsErr) {
      console.warn('[shopAuth] Firestore sync note:', fsErr);
    }

    return {
      success: true,
      shop: normalizeShopRecord(created)
    };
  } catch (err: any) {
    console.error('[shopAuth] createShop error:', err);
    return {
      success: false,
      error: err.message || 'Failed to create shop.'
    };
  }
}

/**
 * Updates shop status (active, pending, suspended)
 */
export async function updateShopStatus(
  shopId: string,
  status: 'active' | 'pending' | 'suspended'
): Promise<ShopOperationResult> {
  try {
    const updated = await adminUpdateShopStatus(shopId, status);

    // Mirror to Firestore
    try {
      await setDoc(doc(db, 'merchants', shopId), { status }, { merge: true });
    } catch {}

    return {
      success: true,
      shop: normalizeShopRecord(updated)
    };
  } catch (err: any) {
    console.error('[shopAuth] updateShopStatus error:', err);
    return {
      success: false,
      error: err.message || 'Failed to update shop status.'
    };
  }
}

/**
 * Resets a shop PIN
 */
export async function resetShopPin(
  shopId: string,
  newPin: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!/^\d{4,16}$/.test(newPin.trim())) {
      return { success: false, error: 'PIN must be 4 to 16 digits.' };
    }
    await adminResetShopPin(shopId, newPin.trim());
    return { success: true };
  } catch (err: any) {
    console.error('[shopAuth] resetShopPin error:', err);
    return {
      success: false,
      error: err.message || 'Failed to reset PIN.'
    };
  }
}

export { adminFetchAllShops, adminDeleteShop, adminUpdateShopDetails };
