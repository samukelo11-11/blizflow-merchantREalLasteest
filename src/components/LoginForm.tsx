/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
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
  Sparkles
} from 'lucide-react';
import { executeAdaptiveSignIn, getFailedAttempts, triggerStepUpEmailVerification } from '../auth/adaptiveAuth';
import { logSecurityEvent } from '../auth/authEvents';
import { registerCurrentSession } from '../auth/sessionSecurity';
import { isDevModeActive } from '../auth/devMode';

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
      return 'Incorrect email address or password. Please try again.';
    case 'auth/invalid-email':
      return 'The email address is not valid.';
    case 'auth/user-disabled':
      return 'This account has been disabled by administrators.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please reset your password or try again later.';
    case 'auth/popup-blocked':
      return 'Sign-in pop-up was blocked by your browser. Please allow pop-ups for this site.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method. Please use email and password.';
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [stepUpChallenge, setStepUpChallenge] = useState<{ required: boolean; reason?: string; pendingShop?: ShopProfile } | null>(null);
  const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [verificationEmailError, setVerificationEmailError] = useState<string | null>(null);
  const [showEmailFields, setShowEmailFields] = useState(false);

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

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);

    try {
      if (isDevModeActive()) {
        console.log('[Login] Development Mode active — simulating Google sign-in.');
        const mockShop: ShopProfile = {
          id: 'shop-dev-999',
          name: 'Test Dev Spaza Shop',
          ownerName: 'Dev Owner',
          phoneNumber: '+27 72 000 0000',
          email: 'dev@blizflow.co.za',
          category: 'Grocery & Supermarket',
          address: '42 Local Host Road, Cape Town',
          gpsLocation: { latitude: -33.9249, longitude: 18.4241 },
          logoUrl: '',
          coverUrl: '',
          openingHours: { open: '08:00', close: '18:00' },
          description: 'Development Mode — Local Data',
          createdAt: new Date().toISOString(),
          status: 'open',
          subscriptionStatus: 'active',
          plan: 'standard',
          isEmailVerified: true,
          onboardingStatus: 'complete'
        };
        localStorage.setItem('blizflow_shop', JSON.stringify(mockShop));
        localStorage.setItem('blizflow_user', JSON.stringify({ email: mockShop.email, role: 'merchant', merchantId: mockShop.id }));
        onLoginSuccess(mockShop);
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
      if (firebaseErr?.code !== 'auth/popup-closed-by-user' && firebaseErr?.code !== 'auth/cancelled-popup-request') {
        setError(getFirebaseErrorMessage(err));
      }
    } finally {
      setIsGoogleLoading(false);
    }
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

    if (!email.trim()) return setError('Please enter your store email address.');
    if (!password.trim()) return setError('Please enter your account password.');

    if (cooldownRemaining > 0) {
      return setError(`Security cooldown active. Please wait ${cooldownRemaining}s before attempting again.`);
    }

    setIsSubmitting(true);
    try {
      if (isDevModeActive()) {
        console.log('[Login] Development Mode active — simulating email login.');
        const mockShop: ShopProfile = {
          id: 'shop-dev-999',
          name: 'Test Dev Spaza Shop',
          ownerName: 'Dev Owner',
          phoneNumber: '+27 72 000 0000',
          email: email.trim() || 'dev@blizflow.co.za',
          category: 'Grocery & Supermarket',
          address: '42 Local Host Road, Cape Town',
          gpsLocation: { latitude: -33.9249, longitude: 18.4241 },
          logoUrl: '',
          coverUrl: '',
          openingHours: { open: '08:00', close: '18:00' },
          description: 'Development Mode — Local Data',
          createdAt: new Date().toISOString(),
          status: 'open',
          subscriptionStatus: 'active',
          plan: 'standard',
          isEmailVerified: true,
          onboardingStatus: 'complete'
        };
        localStorage.setItem('blizflow_shop', JSON.stringify(mockShop));
        onLoginSuccess(mockShop);
        setIsSubmitting(false);
        return;
      }

      // Execute Adaptive Authentication flow
      const result = await executeAdaptiveSignIn(email.trim(), password.trim());

      if (result.status === 'BLOCKED_PROGRESSIVE_DELAY') {
        setCooldownRemaining(result.cooldownSeconds);
        setError(result.message);
        setIsSubmitting(false);
        return;
      }

      if (result.status === 'ERROR') {
        const errMsg = getFirebaseErrorMessage(result.error);
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
      setError(getFirebaseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepUpAcknowledge = () => {
    if (stepUpChallenge?.pendingShop) {
      onLoginSuccess(stepUpChallenge.pendingShop);
    }
  };

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
                {userMode === 'new' ? 'Create Your Merchant Account' : 'Sign In to BlizFlow'}
              </h1>
              <p className="text-[11px] text-slate-500">
                {userMode === 'new' ? 'Instant Google onboarding — start selling fast' : 'Fast & Secure Merchant Authentication'}
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
            onClick={() => setUserMode('new')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer text-center ${
              userMode === 'new'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            New Merchant
          </button>
          <button
            type="button"
            onClick={() => setUserMode('existing')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition cursor-pointer text-center ${
              userMode === 'existing'
                ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/60'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Existing Merchant
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
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Security cooldown active: Try again in <strong>{cooldownRemaining}s</strong></span>
              </div>
            )}

            {error && (
              <div 
                className="bg-red-50 border border-red-100 text-red-700 text-xs p-3.5 rounded-xl font-semibold flex items-start gap-2"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* PRIMARY CTA: CONTINUE WITH GOOGLE */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-sm rounded-xl border border-slate-300 shadow-sm transition duration-150 cursor-pointer flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    <span>Connecting with Google...</span>
                  </>
                ) : (
                  <>
                    {/* Official Google G SVG Icon */}
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
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

            {/* Subtle Divider */}
            <div className="relative my-4 flex py-1 items-center">
              <div className="flex-grow border-t border-slate-100"></div>
              <button
                type="button"
                onClick={() => setShowEmailFields(!showEmailFields)}
                className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                {showEmailFields ? '▲ Hide email sign in' : '▼ Or sign in with email'}
              </button>
              <div className="flex-grow border-t border-slate-100"></div>
            </div>

            {/* Email/Password Option */}
            {showEmailFields && (
              <form onSubmit={handleEmailSubmit} className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="e.g. name@yourshop.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm transition text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm transition text-slate-800"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || cooldownRemaining > 0}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-75 disabled:cursor-not-allowed mt-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    'Sign In with Email'
                  )}
                </button>
              </form>
            )}

            {/* Development Mode Instant Sign In */}
            {isDevModeActive() && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const mockShop: ShopProfile = {
                      id: 'shop-dev-999',
                      name: 'Test Dev Spaza Shop',
                      ownerName: 'Dev Owner',
                      phoneNumber: '+27 72 000 0000',
                      email: 'dev@blizflow.co.za',
                      category: 'Grocery & Supermarket',
                      address: '42 Local Host Road, Cape Town',
                      gpsLocation: { latitude: -33.9249, longitude: 18.4241 },
                      logoUrl: '',
                      coverUrl: '',
                      openingHours: { open: '08:00', close: '18:00' },
                      description: 'Development Mode — Local Data',
                      createdAt: new Date().toISOString(),
                      status: 'open',
                      subscriptionStatus: 'active',
                      plan: 'standard',
                      isEmailVerified: true,
                      onboardingStatus: 'complete'
                    };
                    localStorage.setItem('blizflow_shop', JSON.stringify(mockShop));
                    localStorage.setItem('blizflow_user', JSON.stringify({ email: mockShop.email, role: 'merchant', merchantId: mockShop.id }));
                    onLoginSuccess(mockShop);
                  }}
                  className="w-full py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1"
                >
                  ⚡ Instant Dev Sign-In (Local Preview)
                </button>
              </div>
            )}

            <div className="text-center pt-2">
              <p className="text-[11px] text-slate-400">
                By signing in, you agree to BlizFlow Terms & Merchant Security Standards.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
