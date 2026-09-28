/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';
import { 
  BUSINESS_CATEGORIES, 
} from '../data';
import { ShopProfile } from '../types';
import { 
  ArrowLeft, 
  Upload, 
  Clock, 
  Check, 
  Sparkles
} from 'lucide-react';

const compressImageBase64WithTimeout = (base64Str: string, maxWidth: number, maxHeight: number, quality: number = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('[Image Compression] Timeout. Falling back to original image.');
        resolve(base64Str);
      }
    }, 3000);

    const img = new Image();
    img.onload = () => {
      if (resolved) return;
      clearTimeout(timeout);
      resolved = true;
      try {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch (err) {
        console.error('[Image Compression] Error compiling canvas data, using original:', err);
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      if (resolved) return;
      clearTimeout(timeout);
      resolved = true;
      console.warn('[Image Compression] Failed to load image element, using original.');
      resolve(base64Str);
    };
    img.src = base64Str;
  });
};

interface RegistrationFormProps {
  initialProfile?: ShopProfile | null;
  onSave: (profile: ShopProfile, emailSentSuccess?: boolean, emailError?: string | null) => void;
  onCancel?: () => void;
  onNavigateToLogin?: (email?: string) => void;
}

const withTimeout = async <T,>(
  promiseOrFn: Promise<T> | (() => Promise<T>),
  timeoutMs: number,
  errorMessage: string,
  retries: number = 3
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(errorMessage));
        }, timeoutMs);
      });
      const promise = typeof promiseOrFn === 'function' ? (promiseOrFn as () => Promise<T>)() : promiseOrFn;
      return await Promise.race([promise, timeoutPromise]);
    } catch (err) {
      lastError = err;
      console.warn(`[Registration] Operation attempt ${attempt}/${retries} failed:`, err);
      // If it's a hot promise (not a function), we can't retry it since it's already in flight / rejected.
      if (typeof promiseOrFn !== 'function') {
        throw err;
      }
      if (attempt < retries) {
        // Wait 1.5 seconds between retries to let state propagate or connection recover
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
  throw lastError;
};

export default function RegistrationForm({ 
  initialProfile, 
  onSave, 
  onCancel,
  onNavigateToLogin
}: RegistrationFormProps) {
  // Fields state
  const [name, setName] = useState(initialProfile?.name || '');
  const [ownerName, setOwnerName] = useState(initialProfile?.ownerName || '');
  const [phoneNumber, setPhoneNumber] = useState(initialProfile?.phoneNumber || '');
  const [email, setEmail] = useState(initialProfile?.email || '');
  const [category, setCategory] = useState(initialProfile?.category || BUSINESS_CATEGORIES[0].id);
  const [address, setAddress] = useState(initialProfile?.address || '');
  
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(
    initialProfile?.gpsLocation || null
  );

  // Logo & Cover selection state
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string>(
    initialProfile?.logoUrl || ''
  );

  const [selectedCoverUrl, setSelectedCoverUrl] = useState<string>(
    initialProfile?.coverUrl || ''
  );

  // Hours
  const [openTime, setOpenTime] = useState(initialProfile?.openingHours?.open || '08:00');
  const [closeTime, setCloseTime] = useState(initialProfile?.openingHours?.close || '18:00');
  const [description, setDescription] = useState(initialProfile?.description || '');

  // Validation error
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationStage, setRegistrationStage] = useState<'idle' | 'validating' | 'compressing' | 'creating_auth' | 'signing_in' | 'sending_email' | 'saving_user' | 'saving_merchant' | 'saving_profile'>('idle');

  // Upload logo
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setSelectedLogoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload cover
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setSelectedCoverUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRegistrationStage('validating');

    console.log('[Registration] Starting');

    // Validations
    if (!name.trim()) {
      setRegistrationStage('idle');
      return setError('Business Name is required.');
    }
    if (!ownerName.trim()) {
      setRegistrationStage('idle');
      return setError('Owner Full Name is required.');
    }
    if (!phoneNumber.trim()) {
      setRegistrationStage('idle');
      return setError('Phone Number is required.');
    }
    if (!email.trim()) {
      setRegistrationStage('idle');
      return setError('Email Address is required.');
    }
    if (!address.trim()) {
      setRegistrationStage('idle');
      return setError('Physical Address is required.');
    }
    if (!description.trim()) {
      setRegistrationStage('idle');
      return setError('Business Description is required.');
    }
    if (!initialProfile && !password.trim()) {
      setRegistrationStage('idle');
      return setError('Account Password is required.');
    }

    console.log('[Registration] Validation passed');

    setIsSubmitting(true);
    try {
      const merchantId = initialProfile?.id || `shop-${Date.now()}`;

      // Compress images if present (Option A)
      setRegistrationStage('compressing');
      let finalLogoUrl = selectedLogoUrl;
      let finalCoverUrl = selectedCoverUrl;

      try {
        if (selectedLogoUrl && selectedLogoUrl.startsWith('data:image/')) {
          console.log('[Registration] Compressing logo image...');
          finalLogoUrl = await compressImageBase64WithTimeout(selectedLogoUrl, 160, 160, 0.65);
        }
      } catch (imgErr) {
        console.warn('[Registration] Logo compression failed, continuing with original:', imgErr);
      }

      try {
        if (selectedCoverUrl && selectedCoverUrl.startsWith('data:image/')) {
          console.log('[Registration] Compressing cover image...');
          finalCoverUrl = await compressImageBase64WithTimeout(selectedCoverUrl, 640, 360, 0.6);
        }
      } catch (imgErr) {
        console.warn('[Registration] Cover compression failed, continuing with original:', imgErr);
      }

      const isDevMode = import.meta.env.DEV && localStorage.getItem('blizflow_dev_mode') === 'true';
      if (isDevMode) {
        console.log('[Registration] Running in Development Mode — bypassing Firebase writes.');
        if (!initialProfile) {
          const newShopProfile: ShopProfile = {
            id: merchantId,
            name: name.trim(),
            ownerName: ownerName.trim(),
            phoneNumber: phoneNumber.trim(),
            email: email.trim() || undefined,
            category,
            address: address.trim(),
            gpsLocation,
            logoUrl: finalLogoUrl,
            coverUrl: finalCoverUrl,
            openingHours: {
              open: openTime,
              close: closeTime,
            },
            description: description.trim(),
            createdAt: new Date().toISOString(),
            status: 'open',
            subscriptionStatus: 'active',
            plan: 'standard',
            isEmailVerified: true,
          };
          
          // Save development user mapping to local storage too
          const devUser = {
            email: email.trim() || 'dev@blizflow.co.za',
            role: 'merchant' as const,
            merchantId: merchantId
          };
          localStorage.setItem('blizflow_user', JSON.stringify(devUser));
          
          onSave(newShopProfile);
        } else {
          const updatedProfile: ShopProfile = {
            ...initialProfile,
            name: name.trim(),
            ownerName: ownerName.trim(),
            phoneNumber: phoneNumber.trim(),
            category,
            address: address.trim(),
            gpsLocation,
            logoUrl: finalLogoUrl,
            coverUrl: finalCoverUrl,
            openingHours: {
              open: openTime,
              close: closeTime,
            },
            description: description.trim(),
          };
          onSave(updatedProfile);
        }
        setIsSubmitting(false);
        return;
      }

      if (!initialProfile) {
        let user = auth.currentUser;

        // Check if we already have an authenticated user with matching email
        const isAlreadyLoggedInWithMatchingEmail = user && user.email?.toLowerCase() === email.trim().toLowerCase();

        if (isAlreadyLoggedInWithMatchingEmail) {
          console.log('[Registration] Active session matches registration email. Reusing account:', user.uid);
        } else {
          console.log('[Registration] Creating Firebase account');
          setRegistrationStage('creating_auth');

          try {
            const userCredential = await withTimeout(
              () => createUserWithEmailAndPassword(auth, email.trim(), password.trim()),
              30000,
              'Registration is taking too long. Please check your internet connection and try again.'
            );
            user = userCredential.user;
            console.log('[Registration] Firebase account created');
          } catch (authErr: unknown) {
            console.error('[Registration] Auth creation error:', authErr);
            // Handle partial registration (email already exists, check password to reuse account)
            const authError = authErr as { code?: string; message?: string };
            if (authError?.code === 'auth/email-already-in-use') {
              console.log('[Registration] Auth email already in use. Attempting to sign in with password to recover...');
              setRegistrationStage('signing_in');
              try {
                const signInCredential = await withTimeout(
                  () => signInWithEmailAndPassword(auth, email.trim(), password.trim()),
                  30000,
                  'Signing in to your existing account timed out. Please check your internet connection.'
                );
                user = signInCredential.user;
                console.log('[Registration] Recovery sign-in successful. Authenticated UID:', user.uid);
              } catch (signInErr: unknown) {
                console.error('[Registration] Recovery sign-in failed:', signInErr);
                const signInError = signInErr as { code?: string; message?: string };
                if (signInError?.code === 'auth/wrong-password' || signInError?.code === 'auth/invalid-credential') {
                  throw new Error('This email address is already registered. Please enter the correct password for this account to proceed.');
                } else {
                  throw signInErr;
                }
              }
            } else {
              throw authErr;
            }
          }
        }

        if (!user) {
          throw new Error('Authentication failed. No authenticated user is available.');
        }

        // Use the authenticated user's UID as the merchant ID for direct 1:1 association
        const effectiveMerchantId = user.uid;

        // Send verification email if not verified
        let emailVerificationSuccess = false;
        let emailVerificationErrorMessage: string | null = null;

        if (!user.emailVerified) {
          console.log('[Registration] Requesting Firebase verification email for user:', user.email);
          setRegistrationStage('sending_email');
          try {
            await withTimeout(
              () => sendEmailVerification(user!),
              25000,
              'Sending verification email timed out. Please check your internet connection.'
            );
            emailVerificationSuccess = true;
            console.log('[Registration] Verification email successfully sent by Firebase');
          } catch (emailErr: unknown) {
            console.warn('[Registration] Verification email could not be sent by Firebase:', emailErr);
            if (emailErr && typeof emailErr === 'object') {
              const e = emailErr as { code?: string; message?: string };
              if (e.code === 'auth/too-many-requests') {
                emailVerificationErrorMessage = 'Too many requests. Firebase has temporarily throttled emails. Please wait a few minutes before resending.';
              } else if (e.code === 'auth/quota-exceeded') {
                emailVerificationErrorMessage = 'Firebase daily email quota exceeded. Please contact support or retry later.';
              } else if (e.code === 'auth/network-request-failed') {
                emailVerificationErrorMessage = 'Network error: could not connect to Firebase authentication servers to send verification email.';
              } else if (e.code === 'auth/invalid-email') {
                emailVerificationErrorMessage = 'Invalid email address for verification.';
              } else {
                emailVerificationErrorMessage = e.message || 'Firebase was unable to send the verification email.';
              }
            } else {
              emailVerificationErrorMessage = 'Firebase was unable to send the verification email.';
            }
          }
        }

        const now = new Date();
        const trialEndDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

        const newShopProfile: ShopProfile = {
          id: effectiveMerchantId,
          ownerUid: user.uid,
          name: name.trim(),
          ownerName: ownerName.trim(),
          phoneNumber: phoneNumber.trim(),
          email: email.trim() || undefined,
          category,
          address: address.trim(),
          gpsLocation,
          logoUrl: finalLogoUrl,
          coverUrl: finalCoverUrl,
          openingHours: {
            open: openTime,
            close: closeTime,
          },
          description: description.trim(),
          createdAt: now.toISOString(),
          status: 'open',
          subscriptionStatus: 'trial',
          plan: 'starter',
          subscriptionPrice: 100, // V1 Starter = R100/month
          trialEndsAt: trialEndDate,
          subscriptionStartedAt: now.toISOString(),
          isEmailVerified: user.emailVerified,
        };

        // Clean out undefined values for safe Firestore serialization
        const cleanProfileData: Record<string, any> = { ...newShopProfile };
        Object.keys(cleanProfileData).forEach((key) => {
          if (cleanProfileData[key] === undefined) {
            delete cleanProfileData[key];
          }
        });

        // Write user mapping
        console.log('[Registration] Creating user mapping');
        setRegistrationStage('saving_user');
        try {
          await withTimeout(
            () => setDoc(doc(db, 'users', user!.uid), {
              merchantId: effectiveMerchantId,
              role: 'merchant',
              email: email.trim()
            }, { merge: true }),
            30000,
            'Creating user mapping database record timed out. Please check your connection.'
          );
          console.log('[Registration] User mapping created');
        } catch (dbUserErr: unknown) {
          console.error('[Registration] User document creation failed:', dbUserErr);
          const dbError = dbUserErr as { message?: string };
          throw new Error(`Failed to save user record to Firestore: ${dbError?.message || 'Unknown error'}`);
        }

        // Write merchant profile
        console.log('[Registration] Creating merchant profile');
        setRegistrationStage('saving_merchant');
        try {
          await withTimeout(
            () => setDoc(doc(db, 'merchants', effectiveMerchantId), cleanProfileData, { merge: true }),
            30000,
            'Creating merchant profile record timed out. Please check your connection.'
          );
          console.log('[Registration] Merchant profile created');
        } catch (dbMerchantErr: unknown) {
          console.error('[Registration] Merchant document creation failed:', dbMerchantErr);
          const dbError = dbMerchantErr as { message?: string };
          throw new Error(`Failed to save merchant profile to Firestore: ${dbError?.message || 'Unknown error'}`);
        }

        console.log('[Registration] Registration completed');
        setRegistrationStage('saving_profile');
        onSave(newShopProfile, emailVerificationSuccess, emailVerificationErrorMessage);
      } else {
        console.log('[Registration] Saving profile changes');
        setRegistrationStage('saving_profile');

        const updatedProfile: ShopProfile = {
          ...initialProfile,
          name: name.trim(),
          ownerName: ownerName.trim(),
          phoneNumber: phoneNumber.trim(),
          category,
          address: address.trim(),
          gpsLocation,
          logoUrl: finalLogoUrl,
          coverUrl: finalCoverUrl,
          openingHours: {
            open: openTime,
            close: closeTime,
          },
          description: description.trim(),
        };

        try {
          await withTimeout(
            () => setDoc(doc(db, 'merchants', merchantId), updatedProfile, { merge: true }),
            30000,
            'Saving profile updates timed out. Please check your internet connection.'
          );
          console.log('[Registration] Profile updated successfully');
        } catch (dbEditErr: unknown) {
          console.error('[Registration] Profile update failed:', dbEditErr);
          const dbError = dbEditErr as { message?: string };
          throw new Error(`Failed to save profile updates to Firestore: ${dbError?.message || 'Unknown error'}`);
        }

        onSave(updatedProfile);
      }
    } catch (err: unknown) {
      console.error('[Registration] Critical error caught in submission flow:', err);
      let errMsg = 'Unable to complete registration. Please try again.';

      if (err && typeof err === 'object') {
        const e = err as { code?: string; message?: string };
        if (e.code === 'auth/email-already-in-use') {
          errMsg = 'The email address is already in use by another account.';
        } else if (e.code === 'auth/weak-password') {
          errMsg = 'The password must be at least 6 characters long.';
        } else if (e.code === 'auth/invalid-email') {
          errMsg = 'The email address is not valid.';
        } else if (e.code === 'auth/operation-not-allowed' || (e.message && e.message.includes('operation-not-allowed'))) {
          errMsg = 'Firebase Email/Password Authentication is not enabled. Please contact support.';
        } else if (e.code === 'permission-denied') {
          errMsg = 'Firestore permission denied. Please verify your security rules and active authentication session.';
        } else if (e.message) {
          errMsg = e.message;
        }
      }

      setError(errMsg);
    } finally {
      setIsSubmitting(false);
      setRegistrationStage('idle');
    }
  };

  const getSubmittingText = () => {
    if (initialProfile) {
      return 'Saving your profile changes...';
    }
    switch (registrationStage) {
      case 'validating':
        return 'Validating details...';
      case 'compressing':
        return 'Compressing business images...';
      case 'creating_auth':
        return 'Creating your BlizFlow account...';
      case 'signing_in':
        return 'Signing in to complete setup...';
      case 'sending_email':
        return 'Sending verification email...';
      case 'saving_user':
      case 'saving_merchant':
      case 'saving_profile':
        return 'Saving your business...';
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen py-10 px-4 md:px-6 flex justify-center font-sans">
      <div className="max-w-3xl w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Header bar */}
        <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            {onCancel && (
              <button 
                onClick={onCancel}
                className="p-2 -ml-2 rounded-lg hover:bg-slate-50 transition text-slate-500 cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {initialProfile ? 'Edit Shop Profile' : 'Register Your Business'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {initialProfile ? 'Update your current details' : 'Step 1: Setup your BlizFlow store profile'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-indigo-100">
            <Sparkles className="w-3 h-3" /> Professional Setup
          </div>
        </div>

        {error && (
          <div 
            className="mx-6 mt-6 bg-red-50 border border-red-100 text-red-700 text-sm p-4 rounded-xl font-medium"
            role="alert"
            aria-live="polite"
          >
            <p>{error}</p>
            {(error.includes('already registered') || error.includes('already in use')) && onNavigateToLogin && (
              <div className="mt-3 pt-3 border-t border-red-200/60 flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-red-800 font-semibold">Already own this store account?</span>
                <button
                  type="button"
                  onClick={() => onNavigateToLogin(email)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition shadow-xs cursor-pointer flex items-center gap-1"
                >
                  Go to Sign In →
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          
          {/* Section: Basic Info */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Basic Business Info
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Oakwood Fresh Bakery"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Business Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900 appearance-none"
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Owner Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +27 82 123 4567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900"
                />
              </div>

              <div className={initialProfile ? "sm:col-span-2" : "sm:col-span-1"}>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. contact@oakwoodbakery.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900"
                />
              </div>

              {!initialProfile && (
                <div className="sm:col-span-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Account Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Choose a password (min 6 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900"
                  />
                </div>
              )}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Location */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Location details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Physical Address <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Shop 4B, Oakwood Shopping Mall, 12 Broad Street"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900 resize-none"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Shop Branding */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Shop Branding & Media
            </h2>

            <div className="space-y-6">
              {/* Business Logo Section */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Business Logo
                </label>
                <div className="flex items-center gap-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5">
                  <div className="relative w-20 h-20 rounded-xl border border-slate-200 bg-white overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {selectedLogoUrl ? (
                      <img
                        src={selectedLogoUrl}
                        alt="Selected Logo"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-1 text-center text-[10px] text-slate-400 font-medium">
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span>Upload your photo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      id="logo-file-input"
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2">
                      <label
                        htmlFor="logo-file-input"
                        className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Choose Logo File
                      </label>
                      {selectedLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setSelectedLogoUrl('')}
                          className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      PNG or JPG. Recommended: square aspect ratio.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cover Photo Section */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Business Cover Photo
                </label>
                <div className="flex flex-col gap-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5">
                  {selectedCoverUrl ? (
                    <div className="relative w-full h-36 rounded-lg border border-slate-200 overflow-hidden bg-white">
                      <img
                        src={selectedCoverUrl}
                        alt="Selected Cover"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedCoverUrl('')}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg text-xs font-semibold shadow-md cursor-pointer"
                      >
                        Remove Cover
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-36 rounded-lg bg-white border border-slate-100 flex flex-col items-center justify-center text-center p-4">
                      <Upload className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-sm font-bold text-slate-700">Upload your photo</span>
                      <p className="text-xs text-slate-400 mt-1">Select a cover photo that highlights your shop front or goods</p>
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      id="cover-file-input"
                      className="hidden"
                    />
                    <label
                      htmlFor="cover-file-input"
                      className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Choose Cover Image
                    </label>
                    <span className="text-[10px] text-slate-400 ml-3">
                      PNG or JPG. Recommended size: 800x400 landscape.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Hours & Description */}
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Operation Details & Narrative
            </h2>
            <div className="grid sm:grid-cols-2 gap-5">
              
              {/* Hours */}
              <div className="sm:col-span-2 bg-slate-50 border border-slate-200 p-4.5 rounded-xl">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-3.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  Opening Hours (Daily)
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Open Time
                    </label>
                    <input
                      type="time"
                      required
                      value={openTime}
                      onChange={(e) => setOpenTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none"
                    />
                  </div>
                  <span className="text-slate-400 text-sm mt-4">to</span>
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Close Time
                    </label>
                    <input
                      type="time"
                      required
                      value={closeTime}
                      onChange={(e) => setCloseTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Business Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Tell your customers who you are, what you specialize in, and what makes your shop wonderful..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-600 focus:bg-white outline-none transition text-sm text-slate-900"
                />
              </div>

            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3.5">
            {!initialProfile && onNavigateToLogin ? (
              <p className="text-xs text-slate-500 font-medium">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => onNavigateToLogin(email)}
                  className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer"
                >
                  Sign In here
                </button>
              </p>
            ) : <div />}

            <div className="flex items-center gap-3.5 ml-auto">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/10 cursor-pointer flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    {getSubmittingText()}
                  </>
                ) : (
                  initialProfile ? 'Save Changes' : 'Complete Registration'
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}