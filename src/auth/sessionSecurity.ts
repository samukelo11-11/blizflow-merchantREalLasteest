/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Session & Device Context Module
 *
 * IMPORTANT SECURITY CONTEXT:
 * - This module provides non-invasive, privacy-preserving context metadata.
 * - Device labels and session identifiers are used ONLY as risk/decision-support signals.
 * - They are NOT authentication factors, cryptographic proofs, or trusted device tokens.
 * - No browser fingerprinting or invasive tracking techniques are employed.
 */

export interface SessionContext {
  sessionId: string;
  deviceLabel: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}

// FIX 7: Renamed to make clear this is a localStorage key, not sessionStorage
const LOCAL_SESSIONS_KEY = 'blizflow_recognized_sessions';
const CURRENT_SESSION_ID_KEY = 'blizflow_current_session_id';

// FIX 1: Cap the number of stored session records to prevent unbounded growth
const MAX_STORED_SESSIONS = 20;

// FIX 2: Module-level monotonic counter for within-millisecond uniqueness,
// matching the same pattern used in authEvents.ts
let _sessionIdCounter = 0;

/**
 * Generates a non-invasive, privacy-preserving device label.
 * FIX 4: Uses navigator.userAgentData (UA Client Hints) where available,
 * falling back to UA string sniffing with consistent regex flags.
 */
export function getNonInvasiveDeviceLabel(): string {
  if (typeof window === 'undefined') return 'Server';

  // Modern path: UA Client Hints API (Chrome 90+, Edge 90+)
  const uaData = (navigator as any).userAgentData;
  if (uaData?.platform) {
    const platform: string = uaData.platform;
    if (/android/i.test(platform)) return 'Android Device';
    if (/ios|iphone|ipad/i.test(platform)) return 'iOS Device';
    if (/macos|mac os/i.test(platform)) return 'macOS Browser';
    if (/windows/i.test(platform)) return 'Windows PC';
    if (/linux/i.test(platform)) return 'Linux Machine';
    return `${platform} Browser`;
  }

  // FIX 4: Legacy UA fallback — all regex flags now consistently
  // case-insensitive (/i) so no branch silently falls through
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'Android Device';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS Device';
  if (/macintosh|mac os x/i.test(ua)) return 'macOS Browser';
  if (/windows/i.test(ua)) return 'Windows PC';
  if (/linux/i.test(ua)) return 'Linux Machine';
  return 'Desktop Browser';
}

/**
 * Gets or initializes the current session identifier.
 * FIX 2: Combines timestamp + monotonic counter + random suffix
 * to guarantee uniqueness even across tabs opened in the same millisecond.
 */
export function getOrCreateCurrentSessionId(): string {
  if (typeof window === 'undefined') return 'sess-srv';
  let sid = sessionStorage.getItem(CURRENT_SESSION_ID_KEY);
  if (!sid) {
    sid = `sess-${Date.now().toString(36)}-${(++_sessionIdCounter).toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(CURRENT_SESSION_ID_KEY, sid);
  }
  return sid;
}

/**
 * FIX 3 + 6: Validates a parsed value is a well-formed SessionContext.
 * Rejects any record missing required string fields so corrupt or
 * tampered localStorage data is silently dropped rather than passed
 * to callers as a typed object.
 */
function isValidSessionContext(value: unknown): value is SessionContext {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.sessionId === 'string' && s.sessionId.length > 0 &&
    typeof s.deviceLabel === 'string' &&
    typeof s.createdAt === 'string' &&
    typeof s.lastActiveAt === 'string' &&
    typeof s.isCurrent === 'boolean'
  );
}

/**
 * Loads sessions from localStorage, validates each record, and
 * drops any that fail schema validation.
 */
function loadSessions(): SessionContext[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // FIX 3: Filter out any records that don't match the expected shape
    return parsed.filter(isValidSessionContext);
  } catch {
    return [];
  }
}

/**
 * Persists sessions to localStorage.
 * FIX 1: Enforces MAX_STORED_SESSIONS cap before writing.
 */
function saveSessions(sessions: SessionContext[]): void {
  if (typeof window === 'undefined') return;
  try {
    // FIX 1: Trim to cap — oldest sessions (at end of array) are dropped first
    const trimmed = sessions.slice(0, MAX_STORED_SESSIONS);
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[SessionSecurity] Error saving sessions:', e);
  }
}

/**
 * Records the current session in the list of recognized sessions.
 */
export function registerCurrentSession(): { isNewSession: boolean; session: SessionContext } {
  const currentId = getOrCreateCurrentSessionId();
  const label = getNonInvasiveDeviceLabel();
  const now = new Date().toISOString();

  // FIX 3: loadSessions() validates each record before use
  let sessions = loadSessions();

  const existingIndex = sessions.findIndex((s) => s.sessionId === currentId);
  const isNewSession = existingIndex === -1;

  if (isNewSession) {
    const newSession: SessionContext = {
      sessionId: currentId,
      deviceLabel: label,
      createdAt: now,
      lastActiveAt: now,
      isCurrent: true,
    };
    sessions.unshift(newSession);
  } else {
    sessions[existingIndex] = {
      ...sessions[existingIndex],
      lastActiveAt: now,
      isCurrent: true,
    };
  }

  // Ensure only one session is flagged as current
  sessions = sessions.map((s) => ({
    ...s,
    isCurrent: s.sessionId === currentId,
  }));

  // FIX 1: saveSessions enforces the cap
  saveSessions(sessions);

  const active = sessions.find((s) => s.sessionId === currentId) ?? {
    sessionId: currentId,
    deviceLabel: label,
    createdAt: now,
    lastActiveAt: now,
    isCurrent: true,
  };

  return { isNewSession, session: active };
}

/**
 * Returns all recognized sessions for the current browser with live isCurrent flags.
 * FIX 6: Uses loadSessions() which validates each record before returning.
 */
export function getRecognizedSessions(): SessionContext[] {
  const currentId = getOrCreateCurrentSessionId();
  return loadSessions().map((s) => ({
    ...s,
    isCurrent: s.sessionId === currentId,
  }));
}

/**
 * Revokes a session by ID.
 * FIX 5: SSR guard added. If the current session is revoked, its
 * sessionStorage entry is also cleared so the next call to
 * registerCurrentSession does not immediately re-add it.
 */
export function revokeSession(sessionId: string): void {
  // FIX 5: SSR guard
  if (typeof window === 'undefined') return;

  try {
    const sessions = loadSessions();
    const updated = sessions.filter((s) => s.sessionId !== sessionId);
    saveSessions(updated);

    // FIX 5: If the caller is revoking the active session, clear its
    // sessionStorage ID so getOrCreateCurrentSessionId() generates a
    // fresh one and registerCurrentSession() correctly treats it as new
    const currentId = sessionStorage.getItem(CURRENT_SESSION_ID_KEY);
    if (currentId === sessionId) {
      sessionStorage.removeItem(CURRENT_SESSION_ID_KEY);
    }
  } catch (err) {
    console.warn('[SessionSecurity] Failed to revoke session:', err);
  }
}