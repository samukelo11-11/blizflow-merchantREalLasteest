/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Store, 
  ShoppingCart, 
  Barcode, 
  TrendingUp, 
  DollarSign, 
  ShieldCheck, 
  ArrowRight, 
  Zap, 
  Lock, 
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  Layers,
  Receipt,
  CheckCircle2,
  PlusCircle,
  KeyRound,
  Check,
  ChevronRight,
  Clock,
  Calendar,
  Phone,
  FileText,
  Sun,
  Moon,
  MapPin,
  CreditCard,
  Truck
} from 'lucide-react';
import { ShopProfile } from '../types';
import { verifyShopAccess, adminUpdateShopDetails } from '../services/shopAuth';
import { createShop, checkShopIdAvailability } from '../auth/shopAuth';
import { db } from '../services/firebaseConfig';
import { doc, setDoc } from 'firebase/firestore';

interface LandingPageProps {
  onLoginSuccess: (shop: ShopProfile) => void;
  onStartAdmin?: () => void;
}

export default function LandingPage({ onLoginSuccess, onStartAdmin }: LandingPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab]   = useState<'enter' | 'create'>('enter');

  // ── Enter Shop Form State ──
  const [enterShopId, setEnterShopId]         = useState('');
  const [enterPin, setEnterPin]               = useState('');
  const [isEnterSubmitting, setIsEnterSubmitting] = useState(false);
  const [enterError, setEnterError]           = useState<string | null>(null);
  const [notFoundShopId, setNotFoundShopId]   = useState<string | null>(null);

  // ── Create Shop Form State ──
  // Step 1: Verification
  const [createShopId, setCreateShopId]     = useState('');
  const [createPin, setCreatePin]           = useState('');
  const [confirmPin, setConfirmPin]         = useState('');
  const [isVerifying, setIsVerifying]       = useState(false);
  const [createStep, setCreateStep]         = useState<1 | 2 | 3 | 4>(1);

  // Step 2: Basic Business Setup
  const [shopName, setShopName]             = useState('');
  const [ownerName, setOwnerName]           = useState('');
  const [phoneNumber, setPhoneNumber]       = useState('');
  const [email, setEmail]                   = useState('');
  const [category, setCategory]             = useState('Grocery & Spaza Shop');
  const [address, setAddress]               = useState('');
  const [isCreating, setIsCreating]         = useState(false);
  const [createError, setCreateError]       = useState<string | null>(null);

  // Created Shop State
  const [createdShop, setCreatedShop]       = useState<ShopProfile | null>(null);

  // Step 3: Business Profile & Time of Operation State
  const [openTime, setOpenTime]             = useState('07:00');
  const [closeTime, setCloseTime]           = useState('20:00');
  const [operatingDays, setOperatingDays]   = useState('Monday – Sunday (7 Days)');
  const [isOpen24Hours, setIsOpen24Hours]   = useState(false);
  const [storeBio, setStoreBio]             = useState('');
  const [landmark, setLandmark]             = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState<string[]>(['cash', 'card']);
  const [isSavingHours, setIsSavingHours]   = useState(false);

  const toggleLandingPaymentMethod = (methodId: string) => {
    setAcceptedPaymentMethods(prev =>
      prev.includes(methodId)
        ? (prev.length > 1 ? prev.filter(m => m !== methodId) : prev)
        : [...prev, methodId]
    );
  };

  // Step 4: Post-Creation Plan Selection State
  const [selectedPlan, setSelectedPlan]     = useState<'starter' | 'growth' | 'pro'>('growth');
  const [isActivatingPlan, setIsActivatingPlan] = useState(false);
  const [planActivationSuccess, setPlanActivationSuccess] = useState(false);

  // Open modal with specific initial tab
  const openModal = (tab: 'enter' | 'create') => {
    setModalTab(tab);
    setEnterError(null);
    setCreateError(null);
    setShowModal(true);
  };

  // ── Handle Enter Shop Submit ──
  const handleEnterShopSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnterError(null);
    setNotFoundShopId(null);

    const cleanShopId = enterShopId.trim().toUpperCase();
    const cleanPin = enterPin.trim();

    if (!cleanShopId) {
      setEnterError('Please enter your Shop ID (e.g. MEC001).');
      return;
    }
    if (!cleanPin) {
      setEnterError('Please enter your Shop PIN.');
      return;
    }

    setIsEnterSubmitting(true);
    try {
      const result = await verifyShopAccess(cleanShopId, cleanPin);
      if (!result.success) {
        setEnterError(result.message);
        if ('reason' in result && result.reason === 'NOT_FOUND') {
          setNotFoundShopId(cleanShopId);
        }
      } else {
        setShowModal(false);
        onLoginSuccess(result.shop);
      }
    } catch (err: any) {
      console.error('[LandingPage] Login exception:', err);
      setEnterError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setIsEnterSubmitting(false);
    }
  };

  // Switch from failed "Enter" to "Create" pre-populating inputs
  const handleTransitionToCreate = () => {
    setModalTab('create');
    setCreateShopId(enterShopId.trim().toUpperCase());
    setCreatePin(enterPin.trim());
    setConfirmPin(enterPin.trim());
    setEnterError(null);
    setNotFoundShopId(null);
  };

  // ── Step 1: Verify Shop ID and PIN for Creation ──
  const handleVerifyShopIdAndPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const cleanId = createShopId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cleanPin = createPin.trim();
    const cleanConfirm = confirmPin.trim();

    if (!cleanId || cleanId.length < 3) {
      setCreateError('Shop ID must be at least 3 alphanumeric characters (e.g. MEC001).');
      return;
    }
    if (!/^\d{4,16}$/.test(cleanPin)) {
      setCreateError('Shop PIN must be between 4 and 16 numeric digits.');
      return;
    }
    if (cleanPin !== cleanConfirm) {
      setCreateError('The confirmation PIN does not match. Please re-enter.');
      return;
    }

    setIsVerifying(true);
    try {
      const check = await checkShopIdAvailability(cleanId);
      if (!check.available) {
        setCreateError(check.message || `Shop ID "${cleanId}" is already taken.`);
        setIsVerifying(false);
        return;
      }

      setCreateStep(2);
    } catch (err: any) {
      setCreateError(err?.message || 'Verification failed. Please check your connection.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Step 2: Finalize Shop Creation (WITHOUT showing subscription plan yet) ──
  const handleFinalizeCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!shopName.trim()) {
      setCreateError('Shop Name is required.');
      return;
    }

    setIsCreating(true);
    const cleanId = createShopId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    try {
      const res = await createShop({
        shopId: cleanId,
        pin: createPin.trim(),
        name: shopName.trim(),
        ownerName: ownerName.trim() || 'Owner',
        phoneNumber: phoneNumber.trim(),
        email: email.trim(),
        category,
        address: address.trim(),
        plan: 'starter', // Default starter, user chooses their interested plan in Step 4
        status: 'active'
      });

      if (!res.success || !res.shop) {
        setCreateError(res.error || 'Failed to create shop.');
        setIsCreating(false);
        return;
      }

      // Store created shop and progress to Step 3: Add Business Profile & Time of Operation
      setCreatedShop(res.shop as unknown as ShopProfile);
      setCreateStep(3);
    } catch (err: any) {
      console.error('[LandingPage] Create shop error:', err);
      setCreateError(err?.message || 'Failed to register shop. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Step 3: Save Business Profile Details & Time of Operation ──
  const handleSaveProfileDetailsAndProceed = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!createdShop) return;

    setIsSavingHours(true);
    const timeOfOperationStr = isOpen24Hours
      ? 'Open 24/7'
      : `${operatingDays}: ${openTime} - ${closeTime}`;

    try {
      // Persist opening hours, bio, and business profile extensions in Firestore
      await setDoc(doc(db, 'merchants', createdShop.id), {
        openingHours: {
          open: openTime,
          close: closeTime,
          days: operatingDays,
          isOpen24Hours
        },
        timeOfOperation: timeOfOperationStr,
        description: storeBio.trim(),
        landmark: landmark.trim(),
        whatsappNumber: whatsappNumber.trim() || createdShop.phoneNumber || '',
        offersDelivery,
        acceptedPaymentMethods,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const updated = {
        ...createdShop,
        openingHours: {
          open: openTime,
          close: closeTime,
          days: operatingDays,
          isOpen24Hours
        },
        timeOfOperation: timeOfOperationStr,
        description: storeBio.trim(),
        landmark: landmark.trim(),
        whatsappNumber: whatsappNumber.trim() || createdShop.phoneNumber || '',
        offersDelivery,
        acceptedPaymentMethods
      };

      setCreatedShop(updated);
      try {
        localStorage.setItem('blizflow_shop', JSON.stringify(updated));
      } catch {}

      // Move to Step 4: Plan Interest & Activation
      setCreateStep(4);
    } catch (err: any) {
      console.warn('[LandingPage] Failed to save hours note:', err);
      // Still proceed smoothly
      setCreateStep(4);
    } finally {
      setIsSavingHours(false);
    }
  };

  // ── Step 4: Handle Plan Selection & Activate 14-Day Trial to Enter Shop ──
  const handleSelectPlanAndEnter = async (chosenPlan: 'starter' | 'growth' | 'pro') => {
    if (!createdShop) return;
    setIsActivatingPlan(true);

    try {
      // 1. Persist chosen plan directly in Firestore
      await setDoc(doc(db, 'merchants', createdShop.id), {
        plan: chosenPlan,
        subscriptionStatus: 'trial',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Non-blocking backend sync
      try {
        await adminUpdateShopDetails(createdShop.id, { plan: chosenPlan });
      } catch {}

      const updatedShop: ShopProfile = {
        ...createdShop,
        plan: chosenPlan,
        subscriptionStatus: 'trial'
      };

      try {
        localStorage.setItem('blizflow_shop', JSON.stringify(updatedShop));
      } catch {}

      setPlanActivationSuccess(true);
      setTimeout(() => {
        setShowModal(false);
        onLoginSuccess(updatedShop);
      }, 700);
    } catch (err: any) {
      console.warn('[LandingPage] Plan selection save note:', err.message);
      // Fallback: enter shop regardless of connectivity
      setShowModal(false);
      onLoginSuccess({ ...createdShop, plan: chosenPlan });
    } finally {
      setIsActivatingPlan(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col font-sans selection:bg-indigo-500 selection:text-white" id="blizflow-landing">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 text-white p-2 rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <span className="font-black text-xl tracking-tight text-slate-900">
            Bliz<span className="text-indigo-600">Flow</span>
          </span>
          <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200/60 hidden sm:inline-block">
            Store OS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openModal('enter')}
            className="text-slate-700 hover:text-indigo-600 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition cursor-pointer"
          >
            Enter Shop
          </button>
          <button
            onClick={() => openModal('create')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm px-5 py-2.5 rounded-xl transition duration-150 flex items-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Shop</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 md:py-20 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-6">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Instant Setup — Pick Your Shop ID & PIN to Start</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-slate-950 tracking-tight leading-tight mb-6">
            The complete operating system for your local shop.
          </h1>

          <p className="text-base md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Stop losing stock and wasting hours on paper notebooks. BlizFlow turns your phone, tablet, or laptop into a fast, offline-ready retail terminal.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-3.5">
            <button
              onClick={() => openModal('create')}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-base font-black px-8 py-4 rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Create Shop in 60s</span>
            </button>
            <button
              onClick={() => openModal('enter')}
              className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-base font-black px-7 py-4 rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Store className="w-5 h-5 text-indigo-600" />
              <span>Unlock Existing Shop</span>
            </button>
          </div>
        </div>

        {/* Core Pillars Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Instant POS Checkout</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tender cash, calculate exact change, record card payments, and reprint customer receipts in seconds with zero lag.
              </p>
            </div>
          </div>

          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Smart Barcode Inventory</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Scan products with your camera or USB scanner. Automatic low-stock warnings alert you before essential stock runs out.
              </p>
            </div>
          </div>

          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Daily Profit & Expenses</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record supplier payouts and operating costs. The dashboard tracks gross revenue, net margins, and top items every evening.
              </p>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="bg-indigo-900 text-white rounded-3xl p-8 md:p-12 mb-16 shadow-xl relative overflow-hidden">
          <div className="max-w-2xl">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-300">Fast Self-Service Setup</span>
            <h2 className="text-2xl md:text-3xl font-black mt-2 mb-4">
              Create Your Shop with Shop ID & Private PIN
            </h2>
            <p className="text-xs md:text-sm text-indigo-200 leading-relaxed mb-6">
              Choose your unique <strong>Shop ID</strong> (like <code>MEC001</code>) and set your private numeric <strong>Shop PIN</strong>. Once verified, your isolated store database is generated and ready to sell immediately.
            </p>
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-indigo-100">
              <div className="flex items-center gap-1.5 bg-indigo-800/80 px-3 py-1.5 rounded-xl border border-indigo-700">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Isolated Store Database</span>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-800/80 px-3 py-1.5 rounded-xl border border-indigo-700">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Encrypted Security PIN</span>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-800/80 px-3 py-1.5 rounded-xl border border-indigo-700">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span>Instant Store Launch</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">BlizFlow Retail Systems</span>
          <span>•</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-4 mt-3 sm:mt-0">
          <Link
            to="/admin/login"
            className="text-slate-400 hover:text-slate-700 text-[11px] font-semibold transition"
          >
            Admin Console
          </Link>
        </div>
      </footer>

      {/* ══════════════════════════════════════════════════════
          COMBINED MODAL: ENTER SHOP / CREATE NEW SHOP
          ══════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 border border-slate-200 shadow-2xl relative my-8">
            
            {/* Close Button */}
            <button
              onClick={() => { setShowModal(false); setEnterError(null); setCreateError(null); }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Mode Switcher Tabs (Only shown on Steps 1 & 2) */}
            {createStep < 3 && (
              <div className="flex items-center bg-slate-100 p-1 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => { setModalTab('enter'); setEnterError(null); }}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    modalTab === 'enter'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Enter Shop</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setModalTab('create'); setCreateError(null); }}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    modalTab === 'create'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create Shop</span>
                </button>
              </div>
            )}

            {/* ────────────────────────────────────────────────
                TAB 1: ENTER EXISTING SHOP
                ──────────────────────────────────────────────── */}
            {modalTab === 'enter' && (
              <div>
                <div className="text-center mb-5">
                  <h2 className="text-lg font-black text-slate-900">Unlock Your Shop</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter your registered Shop ID and private PIN.
                  </p>
                </div>

                {enterError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl font-medium mb-4 leading-relaxed space-y-2">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                      <span>{enterError}</span>
                    </div>

                    {/* Quick creation transition when shop is not found */}
                    {notFoundShopId && (
                      <button
                        type="button"
                        onClick={handleTransitionToCreate}
                        className="w-full mt-2 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>Create shop &quot;{notFoundShopId}&quot; now</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleEnterShopSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Shop ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MEC001"
                      value={enterShopId}
                      onChange={(e) => setEnterShopId(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                      disabled={isEnterSubmitting}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm font-black tracking-wider uppercase transition outline-none"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Shop PIN (4–16 digits)
                    </label>
                    <input
                      type="password"
                      placeholder="••••"
                      maxLength={16}
                      value={enterPin}
                      onChange={(e) => setEnterPin(e.target.value.replace(/\D/g, ''))}
                      disabled={isEnterSubmitting}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-base font-mono tracking-widest transition outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isEnterSubmitting}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  >
                    {isEnterSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Unlock & Open Shop</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                  <p className="text-[11px] text-slate-400">
                    Don&apos;t have a shop yet?{' '}
                    <button
                      type="button"
                      onClick={() => { setModalTab('create'); setEnterError(null); }}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      Create one in 60 seconds
                    </button>
                  </p>
                </div>
              </div>
            )}

            {/* ────────────────────────────────────────────────
                TAB 2: CREATE SHOP MULTI-STEP WORKFLOW
                ──────────────────────────────────────────────── */}
            {modalTab === 'create' && (
              <div>
                {/* Progress Indicators */}
                <div className="flex items-center justify-between gap-1 mb-4 text-[10px] font-black uppercase text-center">
                  <div className={`flex-1 py-1 rounded-lg border ${
                    createStep === 1
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {createStep === 1 ? '1. ID & PIN' : '✓ ID & PIN'}
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <div className={`flex-1 py-1 rounded-lg border ${
                    createStep === 2
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : createStep > 2
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    {createStep > 2 ? '✓ Business' : '2. Business'}
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <div className={`flex-1 py-1 rounded-lg border ${
                    createStep === 3
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : createStep > 3
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    {createStep > 3 ? '✓ Hours' : '3. Hours'}
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                  <div className={`flex-1 py-1 rounded-lg border ${
                    createStep === 4
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    4. Plan
                  </div>
                </div>

                {createError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl font-medium mb-4 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{createError}</span>
                  </div>
                )}

                {/* ── PHASE 1: Verify Shop ID & PIN ── */}
                {createStep === 1 && (
                  <form onSubmit={handleVerifyShopIdAndPin} className="space-y-3.5">
                    <div className="text-center mb-4">
                      <h2 className="text-base font-black text-slate-900">Step 1: Choose Shop ID & PIN</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        We will verify that your Shop ID is available and your PIN is secure.
                      </p>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">Choose Shop ID *</label>
                        <span className="text-[10px] text-slate-400">Letters, numbers, min 3 chars</span>
                      </div>
                      <input
                        type="text"
                        placeholder="e.g. MEC001 or KASI_STORE"
                        value={createShopId}
                        onChange={(e) => {
                          setCreateShopId(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''));
                          setCreateError(null);
                        }}
                        disabled={isVerifying}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition outline-none"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Shop PIN *</label>
                        <input
                          type="password"
                          placeholder="4–16 digits"
                          maxLength={16}
                          value={createPin}
                          onChange={(e) => {
                            setCreatePin(e.target.value.replace(/\D/g, ''));
                            setCreateError(null);
                          }}
                          disabled={isVerifying}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs font-mono tracking-widest transition outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Confirm PIN *</label>
                        <input
                          type="password"
                          placeholder="Repeat PIN"
                          maxLength={16}
                          value={confirmPin}
                          onChange={(e) => {
                            setConfirmPin(e.target.value.replace(/\D/g, ''));
                            setCreateError(null);
                          }}
                          disabled={isVerifying}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs font-mono tracking-widest transition outline-none"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isVerifying}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Verifying Availability...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>Verify Shop ID & PIN</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* ── PHASE 2: Complete Shop Profile (NO plan shown here) ── */}
                {createStep === 2 && (
                  <form onSubmit={handleFinalizeCreateShop} className="space-y-3">
                    {/* Verification Badge */}
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3.5 py-2 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Verified: <strong className="font-mono">{createShopId}</strong> (PIN set)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCreateStep(1); }}
                        className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Change
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Business / Shop Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Mpho's Spaza & Butchery"
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        disabled={isCreating}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Owner Name</label>
                        <input
                          type="text"
                          placeholder="Your name"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          disabled={isCreating}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
                        <input
                          type="tel"
                          placeholder="082 000 0000"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          disabled={isCreating}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        disabled={isCreating}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                      >
                        <option>Grocery & Spaza Shop</option>
                        <option>Auto Mechanic & Spares</option>
                        <option>Bakery & Confectionery</option>
                        <option>Butchery & Meat Market</option>
                        <option>General Retail</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Town / Address (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Zone 4, Meadowlands"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        disabled={isCreating}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                      />
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateStep(1)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isCreating}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-60"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Creating Your Shop...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            <span>Create My Shop</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── PHASE 3: Business Profile Details & Time of Operation ── */}
                {createStep === 3 && createdShop && (
                  <form onSubmit={handleSaveProfileDetailsAndProceed} className="space-y-3.5">
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Shop &quot;{createdShop.name}&quot; Created!</span>
                      </div>
                      <h2 className="text-base font-black text-slate-900">Time of Operation & Business Profile</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Set when your store trades and add business details for receipts.
                      </p>
                    </div>

                    {/* Operating Days Selection */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Trading Days</span>
                      </label>
                      <select
                        value={operatingDays}
                        onChange={(e) => setOperatingDays(e.target.value)}
                        disabled={isOpen24Hours}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white disabled:opacity-50"
                      >
                        <option>Monday – Sunday (7 Days)</option>
                        <option>Monday – Saturday</option>
                        <option>Monday – Friday</option>
                        <option>Tuesday – Sunday</option>
                        <option>Weekends & Public Holidays</option>
                      </select>
                    </div>

                    {/* Open & Close Times */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Daily Operating Hours</span>
                        </span>
                        
                        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isOpen24Hours}
                            onChange={(e) => setIsOpen24Hours(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-bold text-[11px]">Open 24/7</span>
                        </label>
                      </div>

                      {!isOpen24Hours ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-1">
                              <Sun className="w-3 h-3 text-amber-500" /> Opening Time
                            </span>
                            <input
                              type="time"
                              value={openTime}
                              onChange={(e) => setOpenTime(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-500"
                              required
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mb-1">
                              <Moon className="w-3 h-3 text-indigo-500" /> Closing Time
                            </span>
                            <input
                              type="time"
                              value={closeTime}
                              onChange={(e) => setCloseTime(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-500"
                              required
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Trading around the clock (24 Hours a day, 7 days a week)</span>
                        </div>
                      )}

                      {/* Quick preset buttons */}
                      {!isOpen24Hours && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {[
                            { label: '06:00 - 20:00', open: '06:00', close: '20:00' },
                            { label: '07:00 - 21:00', open: '07:00', close: '21:00' },
                            { label: '08:00 - 18:00', open: '08:00', close: '18:00' }
                          ].map(preset => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => { setOpenTime(preset.open); setCloseTime(preset.close); }}
                              className="text-[10px] font-bold bg-white hover:bg-slate-100 text-slate-600 px-2 py-1 rounded-lg border border-slate-200 transition cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Business Bio / Description */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                        <FileText className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Store Slogan or Description (Optional)</span>
                      </label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Fresh daily bread, cold soft drinks, grocery essentials, airtime & gas refills."
                        value={storeBio}
                        onChange={(e) => setStoreBio(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white resize-none"
                      />
                    </div>

                    {/* Landmark & WhatsApp Orders */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Nearby Landmark</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Near Taxi Rank"
                          value={landmark}
                          onChange={(e) => setLandmark(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1 mb-1">
                          <Phone className="w-3.5 h-3.5 text-indigo-600" />
                          <span>WhatsApp Orders</span>
                        </label>
                        <input
                          type="tel"
                          placeholder={createdShop.phoneNumber || '082 000 0000'}
                          value={whatsappNumber}
                          onChange={(e) => setWhatsappNumber(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-indigo-500 focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* Payment Methods Accepted */}
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-1.5">
                        Payment Methods Accepted
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 'cash', label: 'Cash' },
                          { id: 'card', label: 'Card Swipe' },
                          { id: 'capitec_pay', label: 'Capitec Pay' },
                          { id: 'snapscan', label: 'SnapScan / QR' },
                          { id: 'ewallet', label: 'eWallet' }
                        ].map(m => {
                          const isSelected = acceptedPaymentMethods.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => toggleLandingPaymentMethod(m.id)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-indigo-600" />}
                              <span>{m.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Delivery Option */}
                    <label className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={offersDelivery}
                        onChange={(e) => setOffersDelivery(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">Offer Local Township Delivery / Call-and-Collect</span>
                        <span className="text-[10px] text-slate-500">Notifies customers on printed slips that you can deliver.</span>
                      </div>
                    </label>

                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateStep(4)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Skip
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingHours}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-60"
                      >
                        {isSavingHours ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Saving Profile...</span>
                          </>
                        ) : (
                          <>
                            <span>Save Profile & Choose Plan</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── PHASE 4: Select Plan & 14-Day Free Trial (Shown AFTER profile & hours) ── */}
                {createStep === 4 && createdShop && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Profile & Hours Ready!</span>
                      </div>
                      <h2 className="text-lg font-black text-slate-900">Choose Your Plan</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Start with an instant <strong>14-day free trial</strong> on any plan. No payment required today.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {[
                        {
                          id: 'starter',
                          name: 'Starter Tier',
                          price: 'R100',
                          period: '/ month',
                          tag: 'Basic',
                          desc: 'Single terminal POS, inventory logs & daily sales summary',
                          features: ['1 Terminal', 'Fast Barcode / POS Checkout', 'Stock Warnings', 'Receipt Printing']
                        },
                        {
                          id: 'growth',
                          name: 'Growth Tier',
                          price: 'R200',
                          period: '/ month',
                          tag: '🔥 Most Popular',
                          desc: 'Multi-staff cashiers, detailed profit margins & WhatsApp slips',
                          features: ['Up to 3 Cashier Terminals', 'Daily Net Profit & Margins', 'Supplier Expense Log', 'WhatsApp e-Receipts']
                        },
                        {
                          id: 'pro',
                          name: 'Pro Tier',
                          price: 'R350',
                          period: '/ month',
                          tag: 'Power User',
                          desc: 'Multi-store ready, comprehensive stock analytics & priority support',
                          features: ['Unlimited Terminals', 'Multi-Store Ready', 'Deep Margin Analytics', '24/7 Priority Support']
                        }
                      ].map(p => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedPlan(p.id as any)}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition relative flex flex-col gap-1.5 ${
                            selectedPlan === p.id
                              ? 'bg-indigo-50/70 border-indigo-600 text-slate-900 shadow-sm'
                              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                selectedPlan === p.id
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}>
                                {selectedPlan === p.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className="font-black text-xs text-slate-900">{p.name}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                p.id === 'growth'
                                  ? 'bg-amber-100 text-amber-800'
                                  : p.id === 'pro'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {p.tag}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-sm text-indigo-600 font-mono">{p.price}</span>
                              <span className="text-[10px] text-slate-400">{p.period}</span>
                            </div>
                          </div>

                          <p className="text-[11px] text-slate-500 pl-6">{p.desc}</p>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 pl-6 pt-0.5 text-[10px] text-slate-600">
                            {p.features.map(f => (
                              <span key={f} className="flex items-center gap-1">
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{f}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 space-y-2">
                      <button
                        type="button"
                        onClick={() => handleSelectPlanAndEnter(selectedPlan)}
                        disabled={isActivatingPlan}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/25 disabled:opacity-60"
                      >
                        {isActivatingPlan ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Activating {selectedPlan.toUpperCase()} Plan...</span>
                          </>
                        ) : planActivationSuccess ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Plan Activated! Opening Shop...</span>
                          </>
                        ) : (
                          <>
                            <span>Activate 14-Day Free Trial on {selectedPlan.toUpperCase()} & Enter Shop</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectPlanAndEnter('starter')}
                        disabled={isActivatingPlan}
                        className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition text-center cursor-pointer"
                      >
                        Skip & enter shop with Starter Free Trial
                      </button>
                    </div>
                  </div>
                )}

                {createStep < 3 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                    <p className="text-[11px] text-slate-400">
                      Already registered your shop?{' '}
                      <button
                        type="button"
                        onClick={() => { setModalTab('enter'); setCreateError(null); }}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        Unlock Existing Shop
                      </button>
                    </p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
