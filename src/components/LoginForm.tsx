/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword, 
  sendEmailVerification 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';
import { ShopProfile } from '../types';
import { 
  ArrowLeft, 
  Mail, 
  Lock, 
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Clock,
  Sparkles,
  UserPlus,
  LogIn,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Zap,
  Store
} from 'lucide-react';
import { executeAdaptiveSignIn, getFailedAttempts, resetFailedAttempts, triggerStepUpEmailVerification } from '../auth/adaptiveAuth';
import { logSecurityEvent } from '../auth/authEvents';
import { registerCurrentSession } from '../auth/sessionSecurity';
import { isDevModeActive } from '../auth/devMode';
import { getInitialDemoShop } from '../demo/demoService';

interface LoginFormProps {
  initialEmail?: string;
  initialMode?: 'new' | 'existing';
  onLoginSuccess: (shop: ShopProfile) => void;
  onCancel: () => void;
  onNavigateToRegister: () => void;
}

function getFirebaseErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'Unable to sign in. Please verify credentials and try again.';
  }
  const firebaseErr = err as { code?: string; message?: string };
  switch (firebaseErr.code) {
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
      return 'Incorrect email address or password. If you are a new merchant, switch to "New Merchant" above to register.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address. Please sign in with your password.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a password with at least 6 characters.';
    case 'auth/invalid-email':
      return 'The email address is not formatted correctly.';
    case 'auth/user-disabled':
      return 'This account has been disabled by administrators.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please wait a moment or reset your password.';
    case 'auth/popup-blocked':
      return 'The Google sign-in pop-up was blocked by your browser. Please allow pop-ups for this site or use Email Sign-Up.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Please use email and password.';
    case 'auth/unauthorized-domain':
      return 'This preview domain is not yet authorized in Firebase Console (Authentication > Settings > Authorized domains). Please use Email Sign-Up or Instant Demo.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is disabled in this Firebase project. Click "Start in Local Store Mode" below to continue without Firebase.';
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
      return 'Firebase Authentication key error. Click "Start in Local Store Mode" below to continue without Firebase.';
    case 'auth/network-request-failed':
      return 'Network error: unable to reach authentication servers. Please check your internet connection.';
    default:
      return firebaseErr.message || 'Unable to sign in. Please verify credentials and try again.';
  }
}

export default function LoginForm({ 
  initialEmail = '',
  initialMode = 'existing',
  onLoginSuccess, 
  onCancel, 
  onNavigateToRegister
}: LoginFormProps) {
  const [userMode, setUserMode] = useState<'new' | 'existing'>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showLocalFallback, setShowLocalFallback] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [stepUpChallenge, setStepUpChallenge] = useState<{ required: boolean; reason?: string; pendingShop?: ShopProfile } | null>(null);
  const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [verificationEmailError, setVerificationEmailError] = useState<string | null>(null);
  const [showDomainHelp, setShowDomainHelp] = useState(false);

  // Check and run cooldown countdown if locked out
  useEffect(() => {
    if (email.trim()) {
      const attempts = getFailedAttempts(email.trim());
      const now = Date.now();
      if (attempts.lockUntilTimestamp > now) {
        setCooldownRemaining(Math.ceil((attempts.lockUntilTimestamp - now) / 1000));
      }
    }
  }, [email]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const handleResetCooldown = () => {
    if (email.trim()) {
      resetFailedAttempts(email.trim());
    }
    setCooldownRemaining(0);
    setError(null);
  };

  const handleLocalStoreFallback = () => {
    const cleanEmail = email.trim() || 'merchant@blizflow.co.za';
    const storeName = cleanEmail.split('@')[0].replace(/[._-]/g, ' ') || 'My Spaza Shop';
    const capitalizedStoreName = storeName.charAt(0).toUpperCase() + storeName.slice(1);
    const merchantId = `shop-local-${Date.now()}`;

    const localShop: ShopProfile = {
      id: merchantId,
      name: `${capitalizedStoreName}'s Store`,
      ownerName: 'Store Owner',
      phoneNumber: '+27 72 000 0000',
      email: cleanEmail,
      category: 'Grocery & Supermarket',
      address: 'Shop Location',
      gpsLocation: { latitude: -33.9249, longitude: 18.4241 },
      logoUrl: '',
      coverUrl: '',
      openingHours: { open: '08:00', close: '18:00' },
      description: 'Local Store Session',
      createdAt: new Date().toISOString(),
      status: 'open',
      subscriptionStatus: 'active',
      plan: 'standard',
      isEmailVerified: true,
      onboardingStatus: 'complete'
    };

    localStorage.setItem('blizflow_dev_mode', 'true');
    localStorage.setItem('blizflow_shop', JSON.stringify(localShop));
    localStorage.setItem('blizflow_user', JSON.stringify({ email: cleanEmail, role: 'merchant', merchantId }));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
    onLoginSuccess(localShop);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMsg(null);
    setShowDomainHelp(false);
    setIsGoogleLoading(true);

    try {
      if (isDevModeActive()) {
        handleLocalStoreFallback();
        setIsGoogleLoading(false);
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      const { session } = registerCurrentSession();
      logSecurityEvent('LOGIN_SUCCESS', {
        email: user.email || 'unknown',
        sessionId: session.sessionId,
        reason: 'Google Authentication'
      });

      // App.tsx auth listener handles navigation & routing based on user status
    } catch (err: unknown) {
      console.warn('[Login] Google sign-in error:', err);
      const firebaseErr = err as { code?: string };
      if (firebaseErr?.code === 'auth/unauthorized-domain') {
        setShowDomainHelp(true);
        setShowLocalFallback(true);
        setError('Google OAuth is not authorized for this domain in Firebase. Use Email Sign-Up below, Local Mode, or Quick Demo.');
      } else if (firebaseErr?.code !== 'auth/popup-closed-by-user' && firebaseErr?.code !== 'auth/cancelled-popup-request') {
        setError(getFirebaseErrorMessage(err));
        if (firebaseErr?.code === 'auth/api-key-not-valid' || firebaseErr?.code === 'auth/operation-not-allowed') {
          setShowLocalFallback(true);
        }
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleQuickDemoSignIn = () => {
    const demoShop = getInitialDemoShop();
    localStorage.setItem('blizflow_demo_active', 'true');
    localStorage.setItem('blizflow_demo_shop', JSON.stringify(demoShop));
    localStorage.setItem('blizflow_shop', JSON.stringify(demoShop));
    localStorage.setItem('blizflow_user', JSON.stringify({
      email: demoShop.email,
      role: 'merchant',
      merchantId: demoShop.id
    }));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
    onLoginSuccess(demoShop);
  };

  const handleResendVerificationEmail = async () => {
    setSendingVerificationEmail(true);
    setVerificationEmailError(null);
    try {
      await triggerStepUpEmailVerification();
      setVerificationEmailSent(true);
    } catch (e: any) {
      console.warn('Failed to send verification email:', e);
      let msg = 'Failed to send verification email.';
      if (e?.code === 'auth/too-many-requests') {
        msg = 'Too many requests. Please wait a few minutes before resending.';
      } else if (e?.code === 'auth/quota-exceeded') {
        msg = 'Firebase daily email quota reached. Please try again later.';
      } else if (e?.message) {
        msg = e.message;
      }
      setVerificationEmailError(msg);
    } finally {
      setSendingVerificationEmail(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setShowLocalFallback(false);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail) return setError('Please enter your store email address.');
    if (!cleanPassword) return setError('Please enter your account password.');

    if (userMode === 'new') {
      // ── REGISTRATION / SIGN UP FLOW ──
      if (cleanPassword.length < 6) {
        return setError('Password must be at least 6 characters long.');
      }
      if (cleanPassword !== confirmPassword.trim()) {
        return setError('Passwords do not match. Please re-enter.');
      }

      setIsSubmitting(true);
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        const user = userCredential.user;

        // Initialize Firestore user mapping
        try {
          await setDoc(doc(db, 'users', user.uid), {
            email: cleanEmail,
            role: 'merchant',
            merchantId: user.uid,
            onboardingStatus: 'required',
            createdAt: new Date().toISOString(),
            authProvider: 'password'
          }, { merge: true });
        } catch (dbErr) {
          console.warn('[Registration] User document initialization note:', dbErr);
        }

        // Attempt verification email (fail softly if throttled)
        try {
          await sendEmailVerification(user);
        } catch (vErr) {
          console.warn('[Registration] Email verification notice:', vErr);
        }

        const { session } = registerCurrentSession();
        logSecurityEvent('LOGIN_SUCCESS', {
          email: cleanEmail,
          sessionId: session.sessionId,
          reason: 'Email Password Registration'
        });

        setSuccessMsg('Account created successfully! Redirecting...');
        // The auth listener in App.tsx will advance the user to PIN setup or Onboarding
      } catch (regErr: any) {
        console.error('[Registration] Account creation error:', regErr);
        if (regErr?.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists. Switched to sign-in so you can enter your password.');
          setUserMode('existing');
        } else if (
          regErr?.code === 'auth/operation-not-allowed' ||
          regErr?.code === 'auth/api-key-not-valid' ||
          regErr?.code === 'auth/invalid-api-key'
        ) {
          setShowLocalFallback(true);
          setError(getFirebaseErrorMessage(regErr));
        } else {
          setError(getFirebaseErrorMessage(regErr));
        }
      } finally {
        setIsSubmitting(false);
      }

    } else {
      // ── EXISTING MERCHANT SIGN-IN FLOW ──
      if (cooldownRemaining > 0) {
        return setError(`Security cooldown active. Please wait ${cooldownRemaining}s before attempting again.`);
      }

      setIsSubmitting(true);
      try {
        // Execute Adaptive Authentication flow
        const result = await executeAdaptiveSignIn(cleanEmail, cleanPassword);

        if (result.status === 'BLOCKED_PROGRESSIVE_DELAY') {
          setCooldownRemaining(result.cooldownSeconds);
          setError(result.message);
          setIsSubmitting(false);
          return;
        }

        if (result.status === 'ERROR') {
          const errMsg = getFirebaseErrorMessage(result.error);
          const errCode = (result.error as any)?.code;
          if (errCode === 'auth/operation-not-allowed' || errCode === 'auth/api-key-not-valid' || errCode === 'auth/invalid-api-key') {
            setShowLocalFallback(true);
          }
          if (result.riskEvaluation.level === 'HIGH' && result.riskEvaluation.cooldownSeconds) {
            setCooldownRemaining(result.riskEvaluation.cooldownSeconds);
            setError(`Security alert: Multiple unsuccessful attempts. Please wait ${result.riskEvaluation.cooldownSeconds}s before retrying.`);
          } else {
            setError(errMsg);
          }
          setIsSubmitting(false);
          return;
        }

        // Step-Up Verification Assessment
        if (result.requiresStepUp) {
          setStepUpChallenge({
            required: true,
            reason: result.stepUpReason,
            pendingShop: result.shop
          });
          setIsSubmitting(false);
          return;
        }

        onLoginSuccess(result.shop);

      } catch (err: unknown) {
        console.warn('Login error:', err);
        const errCode = (err as any)?.code;
        if (errCode === 'auth/operation-not-allowed' || errCode === 'auth/api-key-not-valid' || errCode === 'auth/invalid-api-key') {
          setShowLocalFallback(true);
        }
        setError(getFirebaseErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleStepUpAcknowledge = () => {
    if (stepUpChallenge?.pendingShop) {
      onLoginSuccess(stepUpChallenge.pendingShop);
    }
  };

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your-domain.run.app';

  return (
    <div className="bg-slate-50 min-h-screen py-10 px-4 md:px-6 flex items-center justify-center font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-sm shadow-indigo-600/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-950">
                {userMode === 'new' ? 'Register Your Store' : 'Sign In to BlizFlow'}
              </h1>
              <p className="text-[11px] text-slate-500">
                {userMode === 'new' ? 'Start your 5-day free merchant trial' : 'Fast & Secure Merchant Authentication'}
              </p>
            </div>
          </div>
          <button 
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-700 cursor-pointer text-xs flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>

        {/* Segmented Mode Selector */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setUserMode('new');
              setError(null);
              setSuccessMsg(null);
              setShowLocalFallback(false);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              userMode === 'new'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>New Merchant (Register)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setUserMode('existing');
              setError(null);
              setSuccessMsg(null);
              setShowLocalFallback(false);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              userMode === 'existing'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Existing Merchant (Sign In)</span>
          </button>
        </div>

        {/* Step-Up Verification Checkpoint */}
        {stepUpChallenge?.required ? (
          <div className="p-6 space-y-5">
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-4 rounded-xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Verification Checkpoint</span>
              </div>
              <p className="leading-relaxed text-slate-700">
                {stepUpChallenge.reason || 'Additional context verification is required for this merchant session.'}
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Merchant Account:</span>
                <strong className="text-slate-800">{email}</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Email Status:</span>
                <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md ${
                  stepUpChallenge.pendingShop?.isEmailVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {stepUpChallenge.pendingShop?.isEmailVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>
            </div>

            {!stepUpChallenge.pendingShop?.isEmailVerified && (
              <div className="space-y-2">
                {verificationEmailError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl font-medium">
                    ⚠️ {verificationEmailError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={sendingVerificationEmail || verificationEmailSent}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {sendingVerificationEmail ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending verification link...</span>
                    </>
                  ) : verificationEmailSent ? (
                    <span className="text-emerald-700 font-semibold">Verification Email Sent! Please check inbox.</span>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>Send Email Verification Link</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleStepUpAcknowledge}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-md shadow-indigo-600/10 cursor-pointer flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Continue to Store Dashboard</span>
            </button>
          </div>
        ) : (
          <div className="p-6 md:p-8 space-y-5">
            {cooldownRemaining > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl font-medium flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Security cooldown: <strong>{cooldownRemaining}s</strong> remaining</span>
                </div>
                <button
                  type="button"
                  onClick={handleResetCooldown}
                  className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reset
                </button>
              </div>
            )}

            {error && (
              <div 
                className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-semibold flex flex-col gap-2"
                role="alert"
                aria-live="polite"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>

                {showLocalFallback && (
                  <button
                    type="button"
                    onClick={handleLocalStoreFallback}
                    className="mt-2 w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>⚡ Continue in Local Store Mode (Bypass Firebase)</span>
                  </button>
                )}

                {userMode === 'existing' && error.includes('Incorrect') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserMode('new');
                      setError(null);
                    }}
                    className="text-left text-xs font-bold text-indigo-700 hover:underline mt-1 ml-6 cursor-pointer"
                  >
                    Don't have an account yet? Register here →
                  </button>
                )}
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* DOMAIN AUTHORIZATION HELP IF GOOGLE OAUTH FAILS */}
            {showDomainHelp && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs p-3.5 rounded-xl space-y-2">
                <div className="font-bold flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>How to authorize this domain for Google Sign-In:</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  1. Open your <strong>Firebase Console</strong> → <strong>Authentication</strong> → <strong>Settings</strong> tab.<br />
                  2. Scroll down to <strong>Authorized domains</strong> and click <strong>Add domain</strong>.<br />
                  3. Paste: <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono font-bold">{currentHost}</code>
                </p>
                <p className="text-[11px] text-blue-700 font-semibold">
                  👉 Or simply use <strong>Email registration</strong> or <strong>Local Mode</strong> below — they work immediately!
                </p>
              </div>
            )}

            {/* EMAIL AND PASSWORD FORM (PRIMARY PATH) */}
            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Store Email Address
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="e.g. owner@yourshop.co.za"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm transition text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Password {userMode === 'new' && <span className="text-[11px] text-slate-400 font-normal">(min 6 characters)</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    required
                    autoComplete={userMode === 'new' ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm transition text-slate-800"
                  />
                </div>
              </div>

              {userMode === 'new' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      required
                      autoComplete="new-password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm transition text-slate-800"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || (userMode === 'existing' && cooldownRemaining > 0)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{userMode === 'new' ? 'Creating Account...' : 'Authenticating...'}</span>
                  </>
                ) : userMode === 'new' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Merchant Account</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In with Email</span>
                  </>
                )}
              </button>
            </form>

            {/* Subtle Divider */}
            <div className="relative my-2 flex py-1 items-center">
              <div className="flex-grow border-t border-slate-100"></div>
              <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400">
                OR CONTINUE WITH
              </span>
              <div className="flex-grow border-t border-slate-100"></div>
            </div>

            {/* GOOGLE SIGN IN BUTTON */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-xs transition duration-150 cursor-pointer flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Connecting with Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>{userMode === 'new' ? 'Sign Up with Google' : 'Continue with Google'}</span>
                  </>
                )}
              </button>
            </div>

            {/* INSTANT DEMO / TEST SIGN IN */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleQuickDemoSignIn}
                className="w-full py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200/80 text-amber-900 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
                <span>Instant Demo: Explore as Spaza Shop (No Login Required)</span>
              </button>
            </div>

            <div className="text-center pt-1">
              <p className="text-[11px] text-slate-400">
                By continuing, you agree to BlizFlow Terms & Merchant Security Standards.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
