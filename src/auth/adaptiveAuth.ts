/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { signInWithEmailAndPassword, UserCredential, sendEmailVerification } from 'firebase/auth';
import { auth, db } from '../services/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { ShopProfile } from '../types';
import { evaluateRisk, RiskEvaluationResult, RiskLevel } from './riskEngine';
import { registerCurrentSession, getOrCreateCurrentSessionId } from './sessionSecurity';
import { logSecurityEvent } from './authEvents';

interface FailedAttemptTracker {
  count: number;
  lastAttemptTimestamp: number;
  lockUntilTimestamp: number;
}

const ATTEMPTS_STORAGE_PREFIX = 'blizflow_auth_failures_';
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

function getAttemptKey(email: string): string {
  return `${ATTEMPTS_STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

export function getFailedAttempts(email: string): FailedAttemptTracker {
  if (typeof window === 'undefined') return { count: 0, lastAttemptTimestamp: 0, lockUntilTimestamp: 0 };
  try {
    const raw = localStorage.getItem(getAttemptKey(email));
    if (!raw) return { count: 0, lastAttemptTimestamp: 0, lockUntilTimestamp: 0 };
    const data: FailedAttemptTracker = JSON.parse(raw);
    const now = Date.now();
    if (now - data.lastAttemptTimestamp > FAILURE_WINDOW_MS) {
      localStorage.removeItem(getAttemptKey(email));
      return { count: 0, lastAttemptTimestamp: 0, lockUntilTimestamp: 0 };
    }
    return data;
  } catch {
    return { count: 0, lastAttemptTimestamp: 0, lockUntilTimestamp: 0 };
  }
}

export function recordFailedAttempt(email: string, penaltySeconds = 0): FailedAttemptTracker {
  const current = getFailedAttempts(email);
  const now = Date.now();
  const updated: FailedAttemptTracker = {
    count: current.count + 1,
    lastAttemptTimestamp: now,
    // FIX 3: Never carry forward a stale lockUntilTimestamp.
    // Only set a new lock if penalty > 0, otherwise explicitly zero it out
    // so old expired locks are not preserved in storage.
    lockUntilTimestamp: penaltySeconds > 0 ? now + penaltySeconds * 1000 : 0
  };
  try {
    localStorage.setItem(getAttemptKey(email), JSON.stringify(updated));
  } catch (e) {
    console.warn('[AdaptiveAuth] Could not record attempt:', e);
  }
  return updated;
}

export function resetFailedAttempts(email: string): void {
  try {
    localStorage.removeItem(getAttemptKey(email));
  } catch (e) {
    console.warn('[AdaptiveAuth] Could not reset attempts:', e);
  }
}

export interface AdaptiveAuthSuccessResult {
  status: 'SUCCESS';
  shop: ShopProfile;
  // FIX 4: expose whether the shop profile is a placeholder so
  // the caller can warn the user or redirect them to complete setup
  isPlaceholderProfile: boolean;
  riskEvaluation: RiskEvaluationResult;
  requiresStepUp: boolean;
  stepUpReason?: string;
  // FIX 6: expose all active step-up reasons, not just one
  stepUpReasons?: string[];
}

export interface AdaptiveAuthBlockedResult {
  status: 'BLOCKED_PROGRESSIVE_DELAY';
  cooldownSeconds: number;
  message: string;
  riskEvaluation: RiskEvaluationResult;
}

export interface AdaptiveAuthErrorResult {
  status: 'ERROR';
  error: unknown;
  riskEvaluation: RiskEvaluationResult;
  failedAttempts: number;
}

export type AdaptiveAuthResult =
  | AdaptiveAuthSuccessResult
  | AdaptiveAuthBlockedResult
  | AdaptiveAuthErrorResult;

/**
 * Adaptive Authentication Orchestrator
 * Evaluates risk before and after Firebase credentials authentication
 */
export async function executeAdaptiveSignIn(
  email: string,
  password: string
): Promise<AdaptiveAuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const currentAttempts = getFailedAttempts(cleanEmail);
  const now = Date.now();

  // FIX 7: Register/resolve the session ONCE at the top so the same
  // sessionId is used consistently across all log events in this call.
  // Previously getOrCreateCurrentSessionId() was called separately from
  // registerCurrentSession(), risking two different IDs being generated.
  const { isNewSession, session } = registerCurrentSession();
  const sessionId = session.sessionId;

  // 1. Pre-Auth Rate-Limiting & Progressive Lockout Check
  if (currentAttempts.lockUntilTimestamp > now) {
    const remainingSeconds = Math.ceil((currentAttempts.lockUntilTimestamp - now) / 1000);

    // FIX 1: Use the real isNewSession value from the registered session
    // instead of hardcoding true, so the risk score is accurate.
    const preRisk = evaluateRisk({
      email: cleanEmail,
      failedAttemptsInWindow: currentAttempts.count,
      isNewSession,
      isEmailVerified: false // unknown at this point — conservative default
    });

    logSecurityEvent('AUTH_BLOCKED', {
      email: cleanEmail,
      sessionId,
      riskScore: preRisk.score,
      reason: `Throttled: ${remainingSeconds}s remaining on progressive cooldown`
    });

    return {
      status: 'BLOCKED_PROGRESSIVE_DELAY',
      cooldownSeconds: remainingSeconds,
      message: `Additional verification is required to protect your account. Please wait ${remainingSeconds}s before retrying.`,
      riskEvaluation: preRisk
    };
  }

  // 2. Execute Firebase Authentication
  let userCredential: UserCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  } catch (authError: any) {
    const timeSinceLast = currentAttempts.lastAttemptTimestamp
      ? now - currentAttempts.lastAttemptTimestamp
      : undefined;

    // FIX 2: Pass the current count as-is to evaluateRisk — recordFailedAttempt
    // will handle incrementing in storage. Passing count + 1 here AND incrementing
    // in recordFailedAttempt caused the risk engine to see a count one ahead of
    // what was actually stored, making cooldown penalties trigger too early.
    const riskOnFailure = evaluateRisk({
      email: cleanEmail,
      failedAttemptsInWindow: currentAttempts.count,
      isNewSession,
      isEmailVerified: false,
      timeSinceLastAttemptMs: timeSinceLast
    });

    // Apply penalty for HIGH or MEDIUM risk, not just HIGH
    const penalty =
      riskOnFailure.level === 'HIGH' || riskOnFailure.level === 'MEDIUM'
        ? riskOnFailure.cooldownSeconds || 30
        : 0;

    const updatedAttempts = recordFailedAttempt(cleanEmail, penalty);

    logSecurityEvent('LOGIN_FAILURE', {
      email: cleanEmail,
      sessionId,
      riskScore: riskOnFailure.score,
      reason: authError?.code || 'Invalid credentials'
    });

    return {
      status: 'ERROR',
      error: authError,
      riskEvaluation: riskOnFailure,
      failedAttempts: updatedAttempts.count
    };
  }

  const firebaseUser = userCredential.user;

  if (isNewSession) {
    logSecurityEvent('NEW_SESSION', {
      email: cleanEmail,
      sessionId,
      reason: `Signed in from ${session.deviceLabel}`
    });
  }

  // 3. Post-Authentication Risk Evaluation
  const postRisk = evaluateRisk({
    email: cleanEmail,
    failedAttemptsInWindow: currentAttempts.count,
    isNewSession,
    isEmailVerified: firebaseUser.emailVerified
  });

  // Reset failed attempt counter upon successful credential validation
  resetFailedAttempts(cleanEmail);

  // 4. Fetch merchant profile
  let shopProfile: ShopProfile | null = null;
  let isPlaceholderProfile = false;

  try {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      const merchantId = userData.merchantId;

      if (merchantId) {
        const merchantDocRef = doc(db, 'merchants', merchantId);
        const merchantDocSnap = await getDoc(merchantDocRef);
        if (merchantDocSnap.exists()) {
          shopProfile = merchantDocSnap.data() as ShopProfile;
        }
      }
    }

    if (!shopProfile) {
      const directMerchantRef = doc(db, 'merchants', firebaseUser.uid);
      const directMerchantSnap = await getDoc(directMerchantRef);
      if (directMerchantSnap.exists()) {
        shopProfile = directMerchantSnap.data() as ShopProfile;
      }
    }
  } catch (err) {
    console.warn('[AdaptiveAuth] Error fetching merchant profile:', err);
  }

  // FIX 4: Track when the profile is a placeholder and log it so the
  // caller and security logs both know the real profile was not found.
  if (!shopProfile) {
    isPlaceholderProfile = true;

    logSecurityEvent('MERCHANT_PROFILE_MISSING', {
      email: cleanEmail,
      sessionId,
      reason: `No merchant document found for uid: ${firebaseUser.uid}. Serving placeholder profile.`
    });

    shopProfile = {
      id: firebaseUser.uid,
      name: 'My Store',
      ownerName: firebaseUser.displayName || 'Merchant',
      phoneNumber: '',
      email: firebaseUser.email || cleanEmail,
      category: 'Grocery & Supermarket',
      address: 'Store Location',
      logoUrl: '',
      coverUrl: '',
      openingHours: { open: '08:00', close: '18:00' },
      description: '',
      createdAt: new Date().toISOString(),
      status: 'open',
      subscriptionStatus: 'trial',
      plan: 'starter',
      isEmailVerified: firebaseUser.emailVerified
    };
  }

  shopProfile.isEmailVerified = firebaseUser.emailVerified;

  // FIX 5: HIGH risk must also trigger step-up — it was previously skipped,
  // meaning the most dangerous sessions got LESS friction than medium risk.
  // FIX 6: Collect ALL active step-up reasons instead of picking just one,
  // so the UI can show the user exactly what needs to be resolved.
  const stepUpReasons: string[] = [];

  if (!firebaseUser.emailVerified && isNewSession) {
    stepUpReasons.push('Email verification is required for this new device session.');
  }
  if (postRisk.level === 'MEDIUM') {
    stepUpReasons.push('Elevated risk context detected. Step-up confirmation recommended.');
  }
  if (postRisk.level === 'HIGH') {
    stepUpReasons.push('High-risk login context detected. Additional verification is required.');
  }

  const requiresStepUp = stepUpReasons.length > 0;

  // Primary reason shown in single-reason consumers (backwards compatible)
  const stepUpReason = stepUpReasons.length > 0 ? stepUpReasons[0] : undefined;

  if (requiresStepUp) {
    logSecurityEvent('STEP_UP_REQUIRED', {
      email: cleanEmail,
      sessionId,
      riskScore: postRisk.score,
      reason: stepUpReasons.join(' | ')
    });
  } else {
    logSecurityEvent('LOGIN_SUCCESS', {
      email: cleanEmail,
      sessionId,
      riskScore: postRisk.score
    });
  }

  return {
    status: 'SUCCESS',
    shop: shopProfile,
    isPlaceholderProfile,
    riskEvaluation: postRisk,
    requiresStepUp,
    stepUpReason,
    stepUpReasons
  };
}

/**
 * Trigger step-up verification email resend
 */
export async function triggerStepUpEmailVerification(): Promise<void> {
  if (auth.currentUser && !auth.currentUser.emailVerified) {
    await sendEmailVerification(auth.currentUser);
  }
}