import React, { useState } from 'react';
import { ShopProfile } from '../types';
import {
  Clock,
  AlertTriangle,
  Sparkles,
  ShieldCheck,
  X,
  Check,
  Coins,
  AlertOctagon,
  FileText,
  PhoneCall,
} from 'lucide-react';

interface TrialBannerProps {
  shop: ShopProfile;
  onUpdateShop: (updatedShop: ShopProfile) => void;
  onNavigateToSubscribe?: () => void;
}

const TRIAL_DAYS = 5;

// FIX 7: Single source of truth — import from shared constants in production.
// Defined here to match SubscriptionPage.tsx PLANS.starter.amount.
const MONTHLY_PRICE = 149;

const BANK_NAME = 'Capitec Bank';
// FIX 1: Account number from environment variable, not hardcoded in source.
const BANK_ACCOUNT = import.meta.env.VITE_BANKING_ACCOUNT_NUMBER || '';
const BANK_BRANCH = '868';
const BANK_TYPE = 'Savings';
const COMPANY_NAME = 'Blizflow Technologies';

// FIX 5: Single normalised format — digits only, no plus sign.
// Used directly in wa.me URLs which require this format.
const SUPPORT_WHATSAPP = '27673293260';
const SUPPORT_EMAIL = 'support@blizflow.co.za';

export default function TrialBanner({ shop, onUpdateShop, onNavigateToSubscribe }: TrialBannerProps) {
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'eft' | null>('eft');

  const now = new Date();
  const createdDate = shop.createdAt ? new Date(shop.createdAt) : new Date();
  const defaultTrialEnd = new Date(createdDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const trialEnds = shop.trialEndsAt ? new Date(shop.trialEndsAt) : defaultTrialEnd;

  const diffMs = trialEnds.getTime() - now.getTime();
  const calculatedDaysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const isActive    = shop.subscriptionStatus === 'active';
  const isPending   = shop.subscriptionStatus === 'payment_pending';
  const isRejected  = shop.subscriptionStatus === 'rejected';
  const isSuspended = shop.subscriptionStatus === 'suspended';

  // FIX 6: Explicit boolean cast so isRenewalExpired is always boolean,
  // not boolean | Date (which is what `&&` with a Date operand produces).
  const isRenewalExpired: boolean = Boolean(
    isActive && shop.nextRenewalDate && new Date(shop.nextRenewalDate) < now
  );
  const isTrialExpired = !isActive && !isPending && !isRejected && !isSuspended && calculatedDaysLeft === 0;
  const isExpired = isTrialExpired || isRenewalExpired || shop.subscriptionStatus === 'expired';
  const daysLeft = (isActive || isPending || isRejected || isSuspended) ? 0 : calculatedDaysLeft;

  const handleEftSubmit = () => {
    onUpdateShop({
      ...shop,
      subscriptionStatus: 'payment_pending',
      plan: 'starter',
      subscriptionPrice: MONTHLY_PRICE,
      paymentMethod: 'eft',
      paymentSubmittedAt: new Date().toISOString(),
      rejectionReason: undefined,
    });
    setShowBillingModal(false);
  };

  // Active and not expired
  if (isActive && !isRenewalExpired) {
    return (
      <div className="bg-emerald-900 text-emerald-100 px-4 py-2 text-xs flex items-center justify-between border-b border-emerald-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-bold">
            Active Merchant Plan — Unlimited Sales & Stock Tracking
            {shop.nextRenewalDate && ` (Renews: ${new Date(shop.nextRenewalDate).toLocaleDateString()})`}
          </span>
        </div>
        {/* FIX 2: Demo controls only shown in development builds */}
        {import.meta.env.DEV && (
          <button
            onClick={() => onUpdateShop({
              ...shop,
              subscriptionStatus: 'trial',
              trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
              nextRenewalDate: undefined,
            })}
            className="text-[10px] text-emerald-300 hover:text-white underline cursor-pointer"
            aria-label="Dev only: reset to trial mode"
          >
            Dev: Reset to Trial
          </button>
        )}
      </div>
    );
  }

  // Payment pending
  if (isPending) {
    return (
      <div className="bg-indigo-900 text-indigo-100 px-4 py-2.5 text-xs flex items-center justify-between border-b border-indigo-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping flex-shrink-0" aria-hidden="true" />
          <span className="font-semibold">
            <strong>EFT Payment Submitted.</strong> Verification is pending. Features will unlock immediately upon approval.
          </span>
        </div>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}`}
          target="_blank"
          rel="noreferrer"
          className="bg-indigo-800 hover:bg-indigo-700 text-white font-bold px-2.5 py-1 rounded text-[10px] transition"
        >
          WhatsApp Support
        </a>
      </div>
    );
  }

  // Rejected payment
  if (isRejected) {
    return (
      <>
        <div className="bg-red-950 text-red-100 px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-red-900">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="font-semibold">
              <strong>EFT Verification Failed:</strong> {shop.rejectionReason || 'No details provided'}. Please review and resubmit.
            </span>
          </div>
          <button
            onClick={() => onNavigateToSubscribe ? onNavigateToSubscribe() : setShowBillingModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-black text-[11px] px-3 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
          >
            Resubmit EFT Receipt
          </button>
        </div>
        {showBillingModal && (
          <BillingModal
            shop={shop}
            selectedMethod={selectedMethod}
            setSelectedMethod={setSelectedMethod}
            onClose={() => setShowBillingModal(false)}
            onEftSubmit={handleEftSubmit}
            isRejected={isRejected}
          />
        )}
      </>
    );
  }

  if (isSuspended) return null;

  // Trial active or expired
  return (
    <>
      <div className={`px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b transition ${
        isExpired ? 'bg-red-900 text-red-100 border-red-800' : 'bg-indigo-900 text-indigo-100 border-indigo-800'
      }`}>
        <div className="flex items-center gap-2">
          {isExpired
            ? <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0" />
            : <Clock className="w-4 h-4 text-indigo-300 flex-shrink-0" />}
          <span className="font-semibold">
            {isRenewalExpired && shop.nextRenewalDate ? (
              <><strong>Your Premium Plan expired ({new Date(shop.nextRenewalDate).toLocaleDateString()}).</strong> Renew to keep recording sales.</>
            ) : isExpired ? (
              <><strong>Your free trial has ended.</strong> Subscribe to record new sales.</>
            ) : (
              <><strong>{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</strong> in your free trial</>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* FIX 2: Demo controls only shown in development builds */}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => {
                if (isExpired) {
                  onUpdateShop({ ...shop, subscriptionStatus: 'trial', plan: 'starter', subscriptionPrice: MONTHLY_PRICE, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(), nextRenewalDate: undefined });
                } else {
                  onUpdateShop({ ...shop, subscriptionStatus: 'expired', plan: 'starter', subscriptionPrice: MONTHLY_PRICE, trialEndsAt: new Date(Date.now() - 1000).toISOString(), nextRenewalDate: undefined });
                }
              }}
              className="text-[10px] opacity-80 hover:opacity-100 underline cursor-pointer"
              aria-label="Dev only: toggle trial expired state"
            >
              Dev: {isExpired ? `Reset Trial (${TRIAL_DAYS}d)` : 'Simulate Expired'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigateToSubscribe ? onNavigateToSubscribe() : setShowBillingModal(true)}
            className="bg-white text-slate-900 font-extrabold text-[11px] px-3 py-1 rounded-lg hover:bg-slate-100 transition shadow-xs cursor-pointer"
          >
            Subscribe — R{MONTHLY_PRICE}/month
          </button>
        </div>
      </div>

      {showBillingModal && (
        // FIX 4: BillingModal extracted as a proper component below
        <BillingModal
          shop={shop}
          selectedMethod={selectedMethod}
          setSelectedMethod={setSelectedMethod}
          onClose={() => setShowBillingModal(false)}
          onEftSubmit={handleEftSubmit}
          isRejected={isRejected}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4: BillingModal extracted as a proper named component so React can
// track it through reconciliation and hooks inside it are legal.
// ─────────────────────────────────────────────────────────────────────────────
interface BillingModalProps {
  shop: ShopProfile;
  selectedMethod: 'eft' | null;
  setSelectedMethod: (m: 'eft' | null) => void;
  onClose: () => void;
  onEftSubmit: () => void;
  isRejected: boolean;
}

function BillingModal({ shop, selectedMethod, setSelectedMethod, onClose, onEftSubmit, isRejected }: BillingModalProps) {
  const whatsappText = encodeURIComponent(
    `Hi BlizFlow! I want to activate my BlizFlow Merchant Starter plan (R${MONTHLY_PRICE}/mo).\n\nShop Name: ${shop.name}\nShop ID: ${shop.id}\nEmail: ${shop.email || 'N/A'}\n\nPlease find my Proof of Payment attached.`
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
          aria-label="Close billing modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-2">
            <Sparkles className="w-3 h-3" />
            <span>BlizFlow Merchant Starter</span>
          </div>
          <h2 className="text-xl font-black text-slate-950">
            {isRejected ? 'Resubmit Your EFT Payment' : 'Unlock Unlimited POS Sales'}
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Keep your spaza or retail store running smoothly with offline stock sync, digital receipts, and real-time dashboard analytics.
          </p>
        </div>

        {/* Pricing box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-baseline border-b border-slate-200 pb-3">
            <div>
              <span className="font-extrabold text-sm text-slate-900 block">Starter Shop Plan</span>
              <span className="text-[10px] text-slate-500">Billed monthly · Cancel anytime</span>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-indigo-600">R{MONTHLY_PRICE}</span>
              <span className="text-[10px] text-slate-500">/mo</span>
            </div>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 font-medium">
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600 flex-shrink-0" /><span>Unlimited POS transactions & barcode scanning</span></li>
            <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600 flex-shrink-0" /><span>Real-time stock auto-deduction & low stock alerts</span></li>
          </ul>
        </div>

        {/* Payment method picker */}
        <div className="space-y-2">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Choose payment method</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedMethod('eft')}
              className={`py-3 px-4 border rounded-xl flex flex-col items-center gap-1 transition ${
                selectedMethod === 'eft'
                  ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Coins className="w-5 h-5 text-indigo-500" />
              <span className="text-[11px] font-black uppercase">EFT Payment</span>
            </button>
            <button
              type="button"
              disabled
              className="py-3 px-4 border border-slate-100 rounded-xl flex flex-col items-center gap-1 opacity-40 cursor-not-allowed text-slate-400 bg-slate-50"
            >
              <div className="text-[11px] font-black uppercase">PayFast</div>
              <span className="text-[9px] bg-slate-200 px-1 py-0.5 rounded text-slate-500">Coming Soon</span>
            </button>
          </div>
        </div>

        {/* Banking details */}
        {selectedMethod === 'eft' && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
              <span className="font-extrabold text-slate-900">EFT Banking Details</span>
              <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded uppercase">Manual verification</span>
            </div>
            <div className="space-y-1.5 font-medium text-slate-600">
              <div className="flex justify-between"><span>Bank:</span><strong className="text-slate-950">{BANK_NAME}</strong></div>
              <div className="flex justify-between"><span>Account Name:</span><strong className="text-slate-950">{COMPANY_NAME}</strong></div>
              {/* FIX 1: account number from env constant */}
              <div className="flex justify-between"><span>Account Number:</span><strong className="text-slate-950">{BANK_ACCOUNT || '—'}</strong></div>
              <div className="flex justify-between"><span>Branch Code:</span><strong className="text-slate-950">{BANK_BRANCH}</strong></div>
              <div className="flex justify-between"><span>Account Type:</span><strong className="text-slate-950">{BANK_TYPE}</strong></div>
              <div className="flex justify-between p-1.5 bg-indigo-50 rounded-lg text-indigo-950 border border-indigo-100 mt-2">
                <span>Your Shop Reference (Required):</span>
                <strong className="font-black text-indigo-700">{shop.id}</strong>
              </div>
              <div className="flex justify-between font-bold text-slate-800 mt-1">
                <span>Deposit Amount:</span>
                <strong className="text-indigo-600 font-extrabold">R{MONTHLY_PRICE}.00</strong>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 leading-normal pt-1">
              Use your Shop Reference ID above. After depositing, click below to notify us. Our admins verify deposits within 2 hours.
            </p>
          </div>
        )}

        <div className="space-y-2 pt-1">
          {/*
            FIX 3: WhatsApp link no longer calls handleEftSubmit on click.
            The merchant should use the "Submit EFT Payment in App" button
            to record their submission — the WhatsApp link is for sending
            proof of payment only and should not change subscription state.
          */}
          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${whatsappText}`}
            target="_blank"
            rel="noreferrer"
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
          >
            💬 Send Proof of Payment via WhatsApp
          </a>

          <button
            type="button"
            onClick={onEftSubmit}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>Submit EFT Payment in App</span>
          </button>

          <p className="text-[10px] text-slate-400 text-center">
            Need help? WhatsApp us at +{SUPPORT_WHATSAPP} or email {SUPPORT_EMAIL}
          </p>
        </div>
      </div>
    </div>
  );
}