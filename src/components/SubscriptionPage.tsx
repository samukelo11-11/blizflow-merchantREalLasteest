import React, { useMemo } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { ShopProfile, PaymentRecord } from '../types';
import { useSubscription } from '../hooks/useSubscription';
import {
  Check, ShieldCheck, CreditCard, Landmark, QrCode,
  PhoneCall, ArrowLeft
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Sensitive banking details moved out of JSX.
// In production these should come from environment variables or Firestore.
// ─────────────────────────────────────────────────────────────────────────────
const BANKING = {
  bank:          'Capitec Bank',
  accountName:   'Blizflow Technologies',
  // Use env variable or default demo merchant banking number
  accountNumber: import.meta.env.VITE_BANKING_ACCOUNT_NUMBER || '1589423610',
  branchCode:    '470010',
};

// FIX 3: Single source of truth for plan pricing.
// Must match the isValidPaymentPlan() amounts in Firestore rules.
const PLANS = {
  starter: { label: 'BlizFlow Starter', amount: 149, currency: 'ZAR' },
} as const;

// FIX 8: Single WhatsApp number used consistently across the app.
// Update once here if the number changes.
const SUPPORT_WHATSAPP = '27673293260';

interface SubscriptionPageProps {
  shop: ShopProfile | null;
  onUpdateShop: (updated: ShopProfile) => void;
  onBack: () => void;
}

export default function SubscriptionPage({ shop, onUpdateShop, onBack }: SubscriptionPageProps) {
  const sub = useSubscription(shop?.id || null);

  // FIX 2: Derive reference directly from shop.id so it stays current
  // if the shop prop changes, without needing useState.
  const eftReference = useMemo(() => {
    return `BF-${(shop?.id || 'DEMO').substring(0, 8).toUpperCase()}`;
  }, [shop?.id]);

  // FIX 3: Plan and amount come from the PLANS constant
  const plan = PLANS.starter;

  const [paymentMethod, setPaymentMethod] = React.useState<'eft' | 'card' | 'snapscan'>('eft');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  if (!shop) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 min-h-[70vh]">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">No active shop session found</h2>
          <p className="text-sm text-slate-500">Please register your shop or select an active merchant profile first.</p>
          <button onClick={onBack} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const handleEftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const paymentRecord: PaymentRecord = {
        id: paymentId,
        merchantId: shop.id,
        merchantName: shop.name,
        ownerName: shop.ownerName,
        phoneNumber: shop.phoneNumber,
        email: shop.email,
        // FIX 3: amount and currency from PLANS constant
        plan: 'starter',
        amount: plan.amount,
        currency: plan.currency,
        paymentMethod: 'eft',
        reference: eftReference,
        status: 'PENDING',
        submittedAt: nowIso,
      };

      // FIX 4: Only update shop status if Firestore write succeeds.
      // If the payment record is not saved, the admin has nothing to approve
      // and the merchant should not be shown a "processing" state.
      await setDoc(doc(db, 'payments', paymentId), paymentRecord);

      // FIX 3: subscriptionPrice from PLANS constant
      const updated: ShopProfile = {
        ...shop,
        subscriptionStatus: 'payment_pending',
        plan: 'starter',
        subscriptionPrice: plan.amount,
        paymentMethod: 'eft',
        paymentSubmittedAt: nowIso,
        rejectionReason: undefined,
      };

      // FIX 5: localStorage write removed — the reference is in Firestore
      // and in component state; a stale localStorage copy serves no purpose.

      onUpdateShop(updated);
    } catch (err: any) {
      console.error('[Subscription] Failed to submit EFT reference:', err);
      // FIX 4: Error is now surfaced to the user since we no longer swallow it
      setErrorMsg(
        err?.code === 'permission-denied'
          ? 'Permission denied. Please ensure you are signed in and try again.'
          : err?.message || 'Failed to submit payment reference. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Payment pending state
  if (shop.subscriptionStatus === 'payment_pending') {
    return (
      <div className="sub-page">
        <div className="mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-bold transition cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
        <div className="pending-card bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="pending-icon text-indigo-600 animate-pulse">⏳</div>
          <h2 className="text-xl font-black text-slate-900">EFT Payment Processing</h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto mt-2">
            We have received your payment submission with reference <strong>{eftReference}</strong>.
            An administrator is currently validating the transfer in our bank records.
          </p>
          <div className="contact-box text-left">
            <h4 className="text-xs font-bold text-slate-800 mb-1.5 flex items-center gap-1">
              <PhoneCall className="w-4 h-4 text-indigo-600" /> Need Speedier Activation?
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              WhatsApp your Proof of Payment to our billing line at{' '}
              {/* FIX 8: single SUPPORT_WHATSAPP constant */}
              <strong className="text-slate-700">+{SUPPORT_WHATSAPP}</strong> along with your shop ID for activation in under 5 minutes.
            </p>
          </div>
          <div className="mt-8">
            <button onClick={onBack} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer">
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active subscription state
  if (shop.subscriptionStatus === 'active') {
    const renewalDate = shop.nextRenewalDate
      ? new Date(shop.nextRenewalDate).toLocaleDateString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString();

    return (
      <div className="sub-page">
        <div className="mb-6">
          <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-bold transition cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        </div>
        <div className="status-card border border-slate-200 shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Subscription Active</h2>
          <div className="status-badge active mt-2">{plan.label}</div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto mt-2">
            Your store operations are fully unlocked. Thank you for partnering with BlizFlow!
          </p>
          <div className="detail-list">
            <div className="detail-row text-xs"><span className="text-slate-500">Plan</span><span className="font-bold text-slate-800">Starter Plan</span></div>
            <div className="detail-row text-xs"><span className="text-slate-500">Billing Cycle</span><span className="font-bold text-slate-800">Monthly</span></div>
            {/* FIX 3: price from PLANS constant */}
            <div className="detail-row text-xs"><span className="text-slate-500">Price</span><span className="font-bold text-slate-800">R{plan.amount}.00 / mo</span></div>
            <div className="detail-row text-xs"><span className="text-slate-500">Next Renewal</span><span className="font-bold text-slate-800">{renewalDate}</span></div>
          </div>
          <button onClick={onBack} className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Trial / expired trial — payment form
  return (
    <div className="sub-page">
      <div className="mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-bold transition cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="sub-header">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">BlizFlow Subscription</h1>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Upgrade your spaza or tuck shop with instant stock recording and point of sale tools.
        </p>
        {/* FIX 7: trial display driven by useSubscription consistently */}
        <div className="mt-3">
          {sub.trial.hasExpired ? (
            <span className="expired-badge text-xs bg-red-50 border border-red-100 px-3 py-1 rounded-full">⚠️ Trial Expired</span>
          ) : (
            <span className="trial-badge text-xs bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full">
              🎁 Trial Active — {sub.trial.daysLeft} days left
            </span>
          )}
        </div>
      </div>

      <div className="plans">
        <div className="plan-card popular shadow-md">
          <div className="popular-badge">MOST POPULAR</div>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-black text-slate-900">{plan.label}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Perfect for independent spazas and kiosks</p>
            </div>
          </div>
          <div className="plan-price">
            {/* FIX 3: amount from PLANS constant */}
            <span className="amount text-slate-900">R{plan.amount}</span>
            <span className="text-xs text-slate-500 ml-1">/ month</span>
          </div>
          <ul className="plan-features border-t border-slate-100 pt-4 space-y-2 mb-2">
            {[
              'Unlimited sales & POS scans',
              'Full inventory & stock logging',
              'Daily AI Insights (Gemini)',
              'Customer SMS receipts',
            ].map(feature => (
              <li key={feature} className="flex items-center gap-2 text-slate-700">
                <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="payment-section border border-slate-200 shadow-xs">
        <h3 className="text-sm font-black text-slate-900">Choose Payment Method</h3>

        <div className="method-grid">
          <button
            type="button"
            onClick={() => setPaymentMethod('eft')}
            className={`method-btn transition cursor-pointer ${paymentMethod === 'eft' ? 'selected' : ''}`}
          >
            <Landmark className="w-5 h-5 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">Instant EFT</span>
          </button>

          {/* FIX 6: disabled attribute added so keyboard/screen reader users cannot activate */}
          <button type="button" disabled className="method-btn disabled" title="Credit Card payments coming soon">
            <CreditCard className="w-5 h-5 text-slate-400" />
            <span className="text-xs font-bold text-slate-400">Card</span>
            <span className="badge-soon text-[9px] text-slate-500 font-bold">SOON</span>
          </button>

          <button type="button" disabled className="method-btn disabled" title="SnapScan payments coming soon">
            <QrCode className="w-5 h-5 text-slate-400" />
            <span className="text-xs font-bold text-slate-400">SnapScan</span>
            <span className="badge-soon text-[9px] text-slate-500 font-bold">SOON</span>
          </button>
        </div>

        {paymentMethod === 'eft' && (
          <form onSubmit={handleEftSubmit} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-medium">
                ⚠️ {errorMsg}
              </div>
            )}

            <div className="banking-details border border-slate-200">
              <h4 className="text-xs font-extrabold text-slate-800 mb-2 border-b border-slate-200 pb-1.5 flex items-center justify-between">
                <span>🏢 Capitec Bank Transfer Details</span>
                <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded uppercase">Manual EFT</span>
              </h4>
              <div className="space-y-1.5">
                <div className="detail-row text-xs"><span className="text-slate-500">Bank</span><span className="font-bold text-slate-800">{BANKING.bank}</span></div>
                <div className="detail-row text-xs"><span className="text-slate-500">Account Name</span><span className="font-bold text-slate-800">{BANKING.accountName}</span></div>
                {/* FIX 1: account number from constant, not hardcoded inline */}
                <div className="detail-row text-xs"><span className="text-slate-500">Account Number</span><span className="font-bold text-slate-800">{BANKING.accountNumber || '—'}</span></div>
                <div className="detail-row text-xs"><span className="text-slate-500">Branch Code</span><span className="font-bold text-slate-800">{BANKING.branchCode}</span></div>
                {/* FIX 3: amount from PLANS constant */}
                <div className="detail-row text-xs"><span className="text-slate-500">Amount Due</span><span className="font-bold text-indigo-600">R{plan.amount}.00 / month</span></div>
                <div className="detail-row text-xs"><span className="text-slate-500">Payment Reference</span><span className="font-bold text-slate-800 bg-slate-200 px-2 py-0.5 rounded-sm select-all">{eftReference}</span></div>
              </div>
              <div className="reference-note">
                ⚠️ Please use reference <code>{eftReference}</code> during transfer. Once paid, send your proof of payment via WhatsApp for instant activation.
              </div>
            </div>

            <div className="space-y-2">
              {/* FIX 8: SUPPORT_WHATSAPP constant used here */}
              <a
                href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
                  `Hi BlizFlow! I made payment for my BlizFlow Starter subscription (R${plan.amount}/mo).\n\nShop: ${shop.name}\nReference: ${eftReference}\nShop ID: ${shop.id}\n\nPlease find my Proof of Payment attached.`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
              >
                💬 WhatsApp Proof of Payment (Instant Unlock)
              </a>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-submit transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                {isSubmitting ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Submitting...</span></>
                ) : (
                  <span>Submit EFT Reference in App</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}