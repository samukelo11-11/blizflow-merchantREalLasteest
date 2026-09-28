/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskEvaluationSignals {
  email: string;
  failedAttemptsInWindow: number;
  isNewSession: boolean;
  isEmailVerified: boolean;
  timeSinceLastAttemptMs?: number;
}

export interface RiskEvaluationResult {
  score: number;           // 0–100, clamped
  rawScore: number;        // FIX 1: unclamped total so callers can see true signal weight
  level: RiskLevel;
  factors: readonly string[]; // FIX 6: readonly so callers cannot mutate the audit record
  recommendedAction: 'ALLOW' | 'STEP_UP_VERIFICATION' | 'PROGRESSIVE_DELAY';
  cooldownSeconds?: number;   // FIX 3: only present when level is HIGH
}

/**
 * Centralized, configurable risk thresholds and signal weights.
 *
 * Threshold naming convention (FIX 5):
 *   MEDIUM_THRESHOLD — minimum score to enter MEDIUM (score > this value)
 *   HIGH_THRESHOLD   — minimum score to enter HIGH (score >= this value)
 * This makes the boundary semantics explicit rather than relying on
 * MAX/MIN naming that implied different things on each side.
 */
export const RISK_CONFIG = {
  THRESHOLDS: {
    MEDIUM_THRESHOLD: 29, // score > 29  → MEDIUM
    HIGH_THRESHOLD: 70    // score >= 70 → HIGH
  },
  WEIGHTS: {
    FAILED_ATTEMPT_SINGLE: 15,
    FAILED_ATTEMPTS_TIER_1: 45,  // >= 3 attempts
    FAILED_ATTEMPTS_TIER_2: 75,  // >= 5 attempts
    NEW_SESSION_SIGNAL: 20,
    UNVERIFIED_EMAIL: 15,
    RAPID_BURST_VELOCITY: 25     // < 2s between attempts, requires >= 2 prior failures
  },
  COOLDOWN: {
    BASE_SECONDS: 30,
    PER_ATTEMPT_INCREMENT: 15,
    MAX_SECONDS: 120
  }
} as const;

/**
 * Transparent, configurable risk evaluation function.
 * Evaluates contextual signals to recommend appropriate verification UX flow.
 */
export function evaluateRisk(signals: RiskEvaluationSignals): RiskEvaluationResult {
  let score = 0;
  const factors: string[] = [];

  // Signal 1: Failed login attempts
  // FIX 2: Tiers are now strictly exclusive so there is no overlap between
  // the multiplied single-attempt path and the tier thresholds. At exactly
  // 2 attempts the multiplied score (30) no longer silently exceeds what
  // 3 attempts would score — instead 1-2 failures use linear scaling capped
  // just below tier 1, keeping the progression auditable.
  if (signals.failedAttemptsInWindow >= 5) {
    score += RISK_CONFIG.WEIGHTS.FAILED_ATTEMPTS_TIER_2;
    factors.push('Elevated consecutive failed login attempts detected in recent window');
  } else if (signals.failedAttemptsInWindow >= 3) {
    score += RISK_CONFIG.WEIGHTS.FAILED_ATTEMPTS_TIER_1;
    factors.push('Multiple recent failed login attempts recorded');
  } else if (signals.failedAttemptsInWindow > 0) {
    // 1 attempt = 15, 2 attempts = 30 — both below TIER_1 (45) so the
    // progression from single → tier is always monotonically increasing
    score += RISK_CONFIG.WEIGHTS.FAILED_ATTEMPT_SINGLE * signals.failedAttemptsInWindow;
    factors.push(`${signals.failedAttemptsInWindow} recent failed login attempt(s)`);
  }

  // Signal 2: Unrecognized session context
  if (signals.isNewSession) {
    score += RISK_CONFIG.WEIGHTS.NEW_SESSION_SIGNAL;
    factors.push('Sign-in from an unrecognized browser session');
  }

  // Signal 3: Email verification state
  if (!signals.isEmailVerified) {
    score += RISK_CONFIG.WEIGHTS.UNVERIFIED_EMAIL;
    factors.push('Merchant email address is pending email verification');
  }

  // Signal 4: Rapid velocity retry bursts (< 2 seconds between attempts)
  // FIX 4: Require at least 2 prior failures before the burst signal fires.
  // A single fast retry after one failure is not a burst pattern — it takes
  // at least two consecutive rapid failures to indicate automated tooling.
  if (
    signals.timeSinceLastAttemptMs !== undefined &&
    signals.timeSinceLastAttemptMs < 2000 &&
    signals.failedAttemptsInWindow >= 2
  ) {
    score += RISK_CONFIG.WEIGHTS.RAPID_BURST_VELOCITY;
    factors.push('Rapid authentication retry velocity detected');
  }

  // FIX 1: Preserve the true accumulated score before clamping.
  // This lets callers and logs see the real signal weight even when
  // multiple signals combine beyond 100, rather than losing that
  // information silently behind the clamped value.
  const rawScore = score;

  // Clamp display score to 0–100
  const clampedScore = Math.max(0, Math.min(100, score));

  // FIX 5: Renamed threshold keys used consistently here
  let level: RiskLevel;
  let recommendedAction: RiskEvaluationResult['recommendedAction'];
  let cooldownSeconds: number | undefined;

  if (clampedScore >= RISK_CONFIG.THRESHOLDS.HIGH_THRESHOLD) {
    level = 'HIGH';
    recommendedAction = 'PROGRESSIVE_DELAY';
    // FIX 3: cooldownSeconds only computed and included for HIGH level
    const penaltyBonus =
      Math.max(0, signals.failedAttemptsInWindow - 3) *
      RISK_CONFIG.COOLDOWN.PER_ATTEMPT_INCREMENT;
    cooldownSeconds = Math.min(
      RISK_CONFIG.COOLDOWN.MAX_SECONDS,
      RISK_CONFIG.COOLDOWN.BASE_SECONDS + penaltyBonus
    );
  } else if (clampedScore > RISK_CONFIG.THRESHOLDS.MEDIUM_THRESHOLD) {
    level = 'MEDIUM';
    recommendedAction = 'STEP_UP_VERIFICATION';
    // FIX 3: cooldownSeconds intentionally omitted for MEDIUM
  } else {
    level = 'LOW';
    recommendedAction = 'ALLOW';
    // FIX 3: cooldownSeconds intentionally omitted for LOW
  }

  return {
    score: clampedScore,
    rawScore,           // FIX 1: full unclipped signal total for logging/audit
    level,
    factors: Object.freeze(factors) as readonly string[], // FIX 6: immutable audit record
    recommendedAction,
    ...(cooldownSeconds !== undefined ? { cooldownSeconds } : {}), // FIX 3: only when HIGH
  };
}