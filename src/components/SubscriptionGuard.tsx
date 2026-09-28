import React from 'react';
import { ShopProfile } from '../types';

// Subscription states that grant full feature access
const ACTIVE_STATES: ShopProfile['subscriptionStatus'][] = ['active', 'trial'];

interface SubscriptionGuardProps {
  shop: ShopProfile | null;
  children: React.ReactNode;
  // Optional: name of the action being guarded, shown in the fallback UI
  action?: string;
  fallback?: React.ReactNode;
  onNavigateToPlans?: () => void;
}

export default function SubscriptionGuard({
  shop,
  children,
  action,
  fallback = null,
  onNavigateToPlans,
}: SubscriptionGuardProps) {
  // No shop loaded yet — render nothing while auth resolves
  if (!shop) return null;

  const status = shop.subscriptionStatus;
  const isTrialActive = status === 'trial' && shop.trialEndsAt
    ? new Date() < new Date(shop.trialEndsAt)
    : false;
  const isAllowed = status === 'active' || isTrialActive;

  if (isAllowed) return <>{children}</>;

  // Render custom fallback if provided
  if (fallback) return <>{fallback}</>;

  // Default fallback UI
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[40vh] gap-4">
      <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center border border-amber-100">
        <span className="text-2xl">🔒</span>
      </div>
      <div>
        <h3 className="text-base font-black text-slate-900 mb-1">
          {status === 'payment_pending'
            ? 'Activation Pending'
            : 'Subscription Required'}
        </h3>
        <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
          {status === 'payment_pending'
            ? 'Your payment is being verified. You will be notified once your subscription is activated.'
            : status === 'suspended'
            ? 'Your account has been suspended. Please contact support to resolve this.'
            : `${action ? `"${action}" is` : 'This feature is'} only available on an active BlizFlow subscription.`}
        </p>
      </div>
      {onNavigateToPlans && status !== 'payment_pending' && status !== 'suspended' && (
        <button
          onClick={onNavigateToPlans}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition"
        >
          View Plans
        </button>
      )}
    </div>
  );
}