/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { BUSINESS_CATEGORIES, CATEGORY_ICON_MAP } from '../data';
import { ShopProfile } from '../types';
import { isDevModeActive } from '../auth/devMode';
import {
  Building2,
  Store,
  MapPin,
  Phone,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  LogOut,
  User,
  ShieldCheck,
} from 'lucide-react';

interface BusinessOnboardingProps {
  user: {
    uid: string;
    email: string;
    displayName?: string;
  };
  onComplete: (profile: ShopProfile) => void;
  onSignOut: () => void;
}

interface DraftData {
  step: number;
  name: string;
  ownerName: string;
  phoneNumber: string;
  category: string;
  address: string;
  openTime: string;
  closeTime: string;
  description: string;
}

export default function BusinessOnboarding({
  user,
  onComplete,
  onSignOut,
}: BusinessOnboardingProps) {
  const draftKey = `blizflow_onboarding_draft_${user.uid}`;

  // Load draft if previously saved
  const [step, setStep] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed: DraftData = JSON.parse(saved);
        return Math.min(Math.max(parsed.step || 1, 1), 4);
      }
    } catch {}
    return 1;
  });

  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState(user.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [category, setCategory] = useState<string>(BUSINESS_CATEGORIES[0].id);
  const [address, setAddress] = useState('');
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [description, setDescription] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize draft data on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed: DraftData = JSON.parse(saved);
        if (parsed.name) setName(parsed.name);
        if (parsed.ownerName) setOwnerName(parsed.ownerName);
        if (parsed.phoneNumber) setPhoneNumber(parsed.phoneNumber);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.address) setAddress(parsed.address);
        if (parsed.openTime) setOpenTime(parsed.openTime);
        if (parsed.closeTime) setCloseTime(parsed.closeTime);
        if (parsed.description) setDescription(parsed.description);
      }
    } catch {}
  }, [draftKey]);

  // Persist draft on state changes
  useEffect(() => {
    try {
      const draft: DraftData = {
        step,
        name,
        ownerName,
        phoneNumber,
        category,
        address,
        openTime,
        closeTime,
        description,
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {}
  }, [step, name, ownerName, phoneNumber, category, address, openTime, closeTime, description, draftKey]);

  const validateStep = (currentStep: number): boolean => {
    setError(null);
    if (currentStep === 1) {
      if (!name.trim()) {
        setError('Please enter your store or business name.');
        return false;
      }
      if (!ownerName.trim()) {
        setError('Please enter the owner or manager name.');
        return false;
      }
    } else if (currentStep === 2) {
      if (!category) {
        setError('Please select a business category.');
        return false;
      }
    } else if (currentStep === 3) {
      if (!address.trim()) {
        setError('Please enter your physical store location / address.');
        return false;
      }
      if (!phoneNumber.trim()) {
        setError('Please enter a contact phone number for your store.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinishOnboarding = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const effectiveMerchantId = user.uid;

    const newShopProfile: ShopProfile = {
      id: effectiveMerchantId,
      ownerUid: user.uid,
      name: name.trim(),
      ownerName: ownerName.trim(),
      phoneNumber: phoneNumber.trim(),
      email: user.email,
      category,
      address: address.trim(),
      openingHours: {
        open: openTime,
        close: closeTime,
      },
      description: description.trim(),
      createdAt: now.toISOString(),
      status: 'open',
      subscriptionStatus: 'trial',
      plan: 'starter',
      subscriptionPrice: 149,
      trialEndsAt: trialEndDate,
      subscriptionStartedAt: now.toISOString(),
      isEmailVerified: true,
      onboardingStatus: 'complete',
    };

    // Filter undefined values for Firestore
    const cleanProfileData: Record<string, any> = { ...newShopProfile };
    Object.keys(cleanProfileData).forEach((k) => {
      if (cleanProfileData[k] === undefined) delete cleanProfileData[k];
    });

    if (isDevModeActive()) {
      // Local dev simulation
      localStorage.setItem('blizflow_shop', JSON.stringify(newShopProfile));
      localStorage.setItem(
        'blizflow_user',
        JSON.stringify({ email: user.email, role: 'merchant', merchantId: effectiveMerchantId })
      );
      localStorage.removeItem(draftKey);
      onComplete(newShopProfile);
      return;
    }

    try {
      // 1. Update users/{uid} document mapping
      await setDoc(
        doc(db, 'users', user.uid),
        {
          merchantId: effectiveMerchantId,
          role: 'merchant',
          email: user.email,
          onboardingStatus: 'complete',
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );

      // 2. Create merchants/{merchantId} document
      await setDoc(doc(db, 'merchants', effectiveMerchantId), cleanProfileData, { merge: true });

      // Clean up saved draft
      localStorage.removeItem(draftKey);

      onComplete(newShopProfile);
    } catch (err: any) {
      console.error('[Onboarding] Error saving merchant profile:', err);
      setError(
        err?.message || 'Failed to save business profile. Please check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryObj = BUSINESS_CATEGORIES.find((c) => c.id === category);

  return (
    <div className="bg-slate-50 min-h-screen py-10 px-4 md:px-6 flex items-center justify-center font-sans">
      <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="border-b border-slate-100 px-6 py-4 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-sm shadow-indigo-600/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-slate-900">
                Bliz<span className="text-indigo-600">Flow</span>
              </span>
              <span className="ml-2 text-[11px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
                Merchant Setup
              </span>
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer flex items-center gap-1 text-xs font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
            <span className={step >= 1 ? 'text-indigo-600 font-bold' : ''}>1. Identity</span>
            <span className={step >= 2 ? 'text-indigo-600 font-bold' : ''}>2. Category</span>
            <span className={step >= 3 ? 'text-indigo-600 font-bold' : ''}>3. Location</span>
            <span className={step >= 4 ? 'text-indigo-600 font-bold' : ''}>4. Launch</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 md:p-8 flex-1 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Title Greeting */}
            <div>
              <h1 className="text-2xl font-black text-slate-950 tracking-tight">
                {step === 1 && "Welcome to BlizFlow"}
                {step === 2 && "What type of store do you run?"}
                {step === 3 && "Where is your business located?"}
                {step === 4 && "Review & Launch Your Store"}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {step === 1 && "Let's set up your business profile in a few quick steps."}
                {step === 2 && "Choose the category that best matches what you sell."}
                {step === 3 && "Help nearby customers find you and contact you."}
                {step === 4 && "Everything is ready. Confirm your details to enter your portal."}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-start gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* STEP 1: IDENTITY */}
            {step === 1 && (
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Business / Store Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Metro Fresh Supermarket"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Owner or Manager Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Thabo Ndlovu"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Store Bio / Short Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Quality fresh foods and daily household essentials at local prices."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            )}

            {/* STEP 2: CATEGORY */}
            {step === 2 && (
              <div className="pt-1">
                <div className="grid grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {BUSINESS_CATEGORIES.map((cat) => {
                    const IconComponent = CATEGORY_ICON_MAP[cat.icon] || Store;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`p-3.5 rounded-2xl border text-left flex flex-col gap-2 transition cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold leading-tight">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 3: LOCATION & CONTACT */}
            {step === 3 && (
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Store Physical Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. 142 Main Road, Wynberg, Cape Town"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Contact Phone / WhatsApp <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g. 082 123 4567"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Daily Operating Hours
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="time"
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="time"
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW & LAUNCH */}
            {step === 4 && (
              <div className="space-y-4 pt-1">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{name}</h3>
                      <p className="text-xs text-slate-500">
                        Owner: {ownerName} • {selectedCategoryObj?.name || category}
                      </p>
                    </div>
                    <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center">
                      <Store className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="text-xs space-y-2 text-slate-600">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <span>{address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>{phoneNumber}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span>{openTime} – {closeTime} (Open for Business)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">5-Day Free Merchant Trial</span>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Your store starts with full access to the POS, product inventory, and customer portal.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-between mt-6">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
              >
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinishOnboarding}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
              >
                {isSubmitting ? (
                  <>Setting Up Store...</>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Enter BlizFlow
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
