import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ShopProfile } from '../types';

// ── Constants ──
const TRIAL_DAYS = 5;
const LOCAL_STORAGE_KEY = 'blizflow_shop';

// ── Types ──
export interface SubscriptionPermissions {
  canSell: boolean;
  canManageProducts: boolean;
  canViewDashboard: boolean;
  canViewReports: boolean;
}

export interface TrialState {
  isTrial: boolean;
  daysLeft: number;
  hasExpired: boolean;
}

export interface SubscriptionDetails {
  isActive: boolean;
  plan: string | null;
  status: string | null;
  nextRenewal: Date | null;
}

export interface SubscriptionState {
  loading: boolean;
  merchant: ShopProfile | null;
  permissions: SubscriptionPermissions;
  trial: TrialState;
  subscription: SubscriptionDetails;
}

// ── Pure calculation helper ──
// Centralizes all subscription/trial/permission logic so it never diverges.
function computeSubscriptionState(merchant: ShopProfile | null): Omit<SubscriptionState, 'loading'> {
  const now = new Date();

  const trialEnds = merchant?.trialEndsAt ? new Date(merchant.trialEndsAt) : null;
  const isTrial = merchant?.subscriptionStatus === 'trial';
  const isActive = merchant?.subscriptionStatus === 'active';
  const isExpiredStatus = merchant?.subscriptionStatus === 'expired';

  // Trial expires when the trial end date has passed OR the status is explicitly 'expired'
  const trialExpiredByDate = isTrial && trialEnds ? now > trialEnds : false;
  const hasExpired = isExpiredStatus || trialExpiredByDate;

  const daysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Renewal expiry check for active plans
  const nextRenewal = merchant?.nextRenewalDate ? new Date(merchant.nextRenewalDate) : null;
  const isRenewalExpired = isActive && nextRenewal ? now > nextRenewal : false;

  // Effective sell/manage permission:
  // - Active plans can always sell (unless renewal expired)
  // - Trial plans can sell only while not expired
  const canOperate = isActive
    ? !isRenewalExpired
    : isTrial && !hasExpired;

  return {
    merchant,
    permissions: {
      canSell: canOperate,
      canManageProducts: canOperate,
      canViewDashboard: true,
      canViewReports: isActive && !isRenewalExpired,
    },
    trial: {
      isTrial,
      daysLeft,
      hasExpired,
    },
    subscription: {
      isActive: isActive && !isRenewalExpired,
      plan: merchant?.plan || null,
      status: merchant?.subscriptionStatus || null,
      nextRenewal: nextRenewal,
    },
  };
}

// ── Read merchant from localStorage (guarded) ──
function readMerchantFromStorage(merchantId?: string | null): ShopProfile | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return null;
    const data: ShopProfile = JSON.parse(saved);
    // If a merchantId is provided, only return matching merchants
    if (merchantId && data.id !== merchantId) return null;
    return data;
  } catch (e) {
    console.error('[useSubscription] Failed to read merchant from localStorage:', e);
    return null;
  }
}

export function useSubscription(
  merchantId?: string | null,
  initialMerchant?: ShopProfile | null
): SubscriptionState {
  // Use a ref to track the last known localStorage value for same-tab polling
  const lastStorageRef = useRef<string | null>(null);

  // ── Core state ──
  // Initialize from initialMerchant if provided, otherwise try localStorage
  const [state, setState] = useState<SubscriptionState>(() => {
    const merchant = initialMerchant || readMerchantFromStorage(merchantId);
    return {
      loading: false,
      ...computeSubscriptionState(merchant),
    };
  });

  // ── React to initialMerchant prop changes ──
  // If the parent passes a new merchant (e.g. after profile update), recompute immediately
  useEffect(() => {
    if (initialMerchant) {
      setState({
        loading: false,
        ...computeSubscriptionState(initialMerchant),
      });
    }
  }, [initialMerchant?.id, initialMerchant?.subscriptionStatus, initialMerchant?.trialEndsAt]);

  // ── Sync from localStorage (cross-tab via 'storage' event + same-tab polling) ──
  const syncFromStorage = useCallback(() => {
    const merchant = readMerchantFromStorage(merchantId);
    const storageValue = localStorage.getItem(LOCAL_STORAGE_KEY);

    // Only update state if something actually changed (prevents unnecessary re-renders)
    if (storageValue !== lastStorageRef.current) {
      lastStorageRef.current = storageValue;
      setState({
        loading: false,
        ...computeSubscriptionState(merchant),
      });
    }
  }, [merchantId]);

  useEffect(() => {
    // Cross-tab sync: browser fires 'storage' when another tab changes localStorage
    window.addEventListener('storage', syncFromStorage);

    // Same-tab sync: lightweight polling every 3 seconds as a fallback
    // This catches direct localStorage mutations from the same tab without
    // requiring other components to dispatch custom events.
    const intervalId = setInterval(syncFromStorage, 3000);

    // Also sync immediately on mount / merchantId change
    syncFromStorage();

    return () => {
      window.removeEventListener('storage', syncFromStorage);
      clearInterval(intervalId);
    };
  }, [syncFromStorage]);

  // ── Memoized derived state ──
  // Prevents object identity churn for consumers that depend on nested objects
  const memoizedState = useMemo(() => state, [
    state.loading,
    state.merchant?.id,
    state.merchant?.subscriptionStatus,
    state.merchant?.trialEndsAt,
    state.merchant?.nextRenewalDate,
    state.permissions.canSell,
    state.trial.daysLeft,
    state.subscription.isActive,
  ]);

  return memoizedState;
}