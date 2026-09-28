/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Security Events & Audit Telemetry Module
 *
 * IMPORTANT SECURITY CONTEXT:
 * - Structured security telemetry for merchant visibility in Settings.
 * - NEVER logs credentials, passwords, tokens, API keys, or private secrets.
 * - Emails are strictly masked before storage.
 * - Note: Local browser event logs provide user-facing transparency and are not
 *   a replacement for backend-authoritative, tamper-resistant SIEM audit logging.
 */

// FIX 4: Added MERCHANT_PROFILE_MISSING to match the new log call in adaptiveAuth
export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'NEW_SESSION'
  | 'STEP_UP_REQUIRED'
  | 'AUTH_BLOCKED'
  | 'LOGOUT'
  | 'SESSION_REVOKED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'MERCHANT_PROFILE_MISSING';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  timestamp: string;
  emailMasked: string;
  sessionId?: string;
  riskScore?: number;
  reason?: string;
}

// FIX 5: Separate cap that gets stored alongside events so consumers
// can tell the user that older events were pruned
export interface SecurityEventLog {
  events: SecurityEvent[];
  totalRecorded: number; // ever-incrementing counter, survives pruning
  prunedCount: number;   // how many events have been dropped so far
}

const SECURITY_LOG_STORAGE_KEY = 'blizflow_security_events';
const MAX_LOCAL_EVENTS = 50;

// FIX 2: Monotonic counter for within-millisecond uniqueness
// Resets on page reload which is fine — IDs only need to be unique
// within a single browser session, not across sessions
let _eventCounter = 0;

/**
 * Masks an email for safe security event logging (e.g., j***e@example.com)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.trim().toLowerCase().split('@');

  // FIX 1: Any local part of 3 chars or fewer is fully redacted to prevent
  // short names (e.g. "ab", "a") from leaking meaningful identifying info
  if (local.length <= 3) {
    return `***@${domain}`;
  }

  // For longer names: show only first and last character, mask the rest
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

/**
 * Loads the full event log structure from storage, with schema validation.
 * Returns a safe default if storage is missing or corrupted.
 */
function loadEventLog(): SecurityEventLog {
  try {
    const raw = localStorage.getItem(SECURITY_LOG_STORAGE_KEY);
    if (!raw) return { events: [], totalRecorded: 0, prunedCount: 0 };

    const parsed = JSON.parse(raw);

    // FIX 3: Validate that what came back is the shape we expect.
    // Rejects corrupted or tampered localStorage data gracefully.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(parsed.events) ||
      typeof parsed.totalRecorded !== 'number' ||
      typeof parsed.prunedCount !== 'number'
    ) {
      console.warn('[SecurityEvents] Stored log failed schema validation. Resetting.');
      return { events: [], totalRecorded: 0, prunedCount: 0 };
    }

    // Validate each event has minimum required fields
    const validEvents: SecurityEvent[] = parsed.events.filter(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as SecurityEvent).id === 'string' &&
        typeof (e as SecurityEvent).type === 'string' &&
        typeof (e as SecurityEvent).timestamp === 'string' &&
        typeof (e as SecurityEvent).emailMasked === 'string'
    );

    return {
      events: validEvents,
      totalRecorded: parsed.totalRecorded,
      prunedCount: parsed.prunedCount,
    };
  } catch {
    return { events: [], totalRecorded: 0, prunedCount: 0 };
  }
}

/**
 * Logs a security event without exposing passwords, private keys, or tokens.
 */
export function logSecurityEvent(
  type: SecurityEventType,
  details: {
    email?: string;
    sessionId?: string;
    riskScore?: number;
    reason?: string;
  }
): SecurityEvent {
  // FIX 2: Combine timestamp + monotonic counter for collision-proof IDs
  const event: SecurityEvent = {
    id: `sec-${Date.now()}-${++_eventCounter}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    timestamp: new Date().toISOString(),
    emailMasked: details.email ? maskEmail(details.email) : 'anonymous',
    sessionId: details.sessionId,
    riskScore: details.riskScore,
    reason: details.reason,
  };

  try {
    const log = loadEventLog();
    log.events.unshift(event);
    log.totalRecorded += 1;

    // FIX 5: Track how many events get pruned so callers and the UI
    // can inform the user that the local log is not complete
    if (log.events.length > MAX_LOCAL_EVENTS) {
      const overflow = log.events.length - MAX_LOCAL_EVENTS;
      log.prunedCount += overflow;
      log.events.splice(MAX_LOCAL_EVENTS);
    }

    localStorage.setItem(SECURITY_LOG_STORAGE_KEY, JSON.stringify(log));
  } catch (err) {
    console.warn('[SecurityEvents] Failed to persist security event:', err);
  }

  if (import.meta.env.DEV) {
    console.info(`[SecurityEvent] [${event.type}] [Score: ${event.riskScore ?? 'N/A'}]`, {
      user: event.emailMasked,
      reason: event.reason,
      time: event.timestamp,
    });
  }

  return event;
}

/**
 * Retrieves the full security event log including pruning metadata.
 * Use this when rendering the audit log UI so you can show the user
 * if events were dropped due to the local storage cap.
 */
export function getSecurityEventLog(): SecurityEventLog {
  return loadEventLog();
}

/**
 * Retrieves just the security events array.
 * Kept for backwards compatibility with existing callers.
 */
export function getSecurityEvents(): SecurityEvent[] {
  return loadEventLog().events;
}

/**
 * Clears all locally stored security events.
 * Should only be called on explicit user action (e.g. "Clear audit log").
 */
export function clearSecurityEvents(): void {
  try {
    localStorage.removeItem(SECURITY_LOG_STORAGE_KEY);
  } catch (err) {
    console.warn('[SecurityEvents] Failed to clear security events:', err);
  }
}