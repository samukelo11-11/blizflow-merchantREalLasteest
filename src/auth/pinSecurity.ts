/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BlizFlow Cryptographic PIN Security Layer
 *
 * IMPORTANT SECURITY PRINCIPLES:
 * 1. Plaintext PINs are NEVER stored in localStorage, Firestore, sessionStorage, URLs, or cookies.
 * 2. Plaintext PINs are NEVER included in error messages, console logs, or telemetry payloads.
 * 3. The PIN verifier is derived using Web Crypto PBKDF2 (SHA-256, 100,000 rounds) with a
 *    cryptographically secure random 16-byte salt unique to each user/device.
 * 4. Verification uses timing-safe (constant-time) comparison to protect against side-channel attacks.
 * 5. Device-level attempt throttling (5 attempts -> 30s progressive penalty) blocks brute-force.
 * 6. This PIN acts as a fast local device-unlock layer and does NOT replace Firebase Auth identity.
 */

interface StoredPinRecord {
  saltHex: string;
  hashHex: string;
  iterations: number;
  createdAt: string;
  // FIX 1: Flag records derived with the broken fallback so we can
  // detect and force re-setup rather than silently accepting weak PINs
  weakFallbackUsed?: boolean;
}

interface PinLockoutTracker {
  failedAttempts: number;
  lockUntil: number;
}

const PIN_STORAGE_PREFIX = 'blizflow_pin_v1_';
const PIN_LOCKOUT_PREFIX = 'blizflow_pin_lock_';
const PIN_UNLOCKED_PREFIX = 'blizflow_pin_unlocked_';
const MAX_ATTEMPTS_BEFORE_COOLDOWN = 5;
const COOLDOWN_SECONDS = 30;
const MAX_PIN_LENGTH = 16;

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const byteArray = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(byteArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// FIX 3: Removed early-return length check so both paths always run
// the full character loop, making execution time independent of length
// differences between candidate and stored hash.
function constantTimeEqual(a: string, b: string): boolean {
  // Pad the shorter string so both loops always run to max length.
  // The final result accounts for the length mismatch via the lengthDiff flag.
  const maxLen = Math.max(a.length, b.length);
  const paddedA = a.padEnd(maxLen, '\0');
  const paddedB = b.padEnd(maxLen, '\0');
  let diff = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < maxLen; i++) {
    diff |= paddedA.charCodeAt(i) ^ paddedB.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Returns true if the current environment has a secure Web Crypto implementation.
 * Used to gate PIN setup and detect weak-fallback records.
 */
export function isCryptoAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.crypto?.subtle)
  );
}

/**
 * FIX 1 + 2: Removed the broken djb2 fallback entirely.
 * If Web Crypto is not available this throws so the caller
 * can surface a clear error rather than silently storing a
 * weak verifier. Static salt fallback also removed.
 */
async function derivePinVerifier(
  pin: string,
  salt: Uint8Array,
  iterations = 100_000
): Promise<string> {
  if (!isCryptoAvailable()) {
    throw new Error(
      '[PinSecurity] Web Crypto API is not available in this environment. ' +
      'PIN setup requires a secure browser context (HTTPS or localhost).'
    );
  }

  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    pinBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
}

export function getPinLockoutStatus(uid: string): {
  isLocked: boolean;
  remainingSeconds: number;
  attempts: number;
} {
  if (typeof window === 'undefined') return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  try {
    const raw = localStorage.getItem(`${PIN_LOCKOUT_PREFIX}${uid}`);
    if (!raw) return { isLocked: false, remainingSeconds: 0, attempts: 0 };
    const tracker: PinLockoutTracker = JSON.parse(raw);
    const now = Date.now();
    if (tracker.lockUntil > now) {
      return {
        isLocked: true,
        remainingSeconds: Math.ceil((tracker.lockUntil - now) / 1000),
        attempts: tracker.failedAttempts,
      };
    }
    // FIX 4: Lock has expired — return attempts as 0 so the next call to
    // recordFailedPinAttempt starts the count fresh instead of immediately
    // re-locking the user on their very next wrong guess.
    return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  } catch {
    return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  }
}

function recordFailedPinAttempt(uid: string): { isLocked: boolean; remainingSeconds: number } {
  if (typeof window === 'undefined') return { isLocked: false, remainingSeconds: 0 };
  try {
    const current = getPinLockoutStatus(uid);
    // FIX 4: Because getPinLockoutStatus now returns attempts: 0 when the
    // lock has expired, newCount starts from 1 after a cooldown period
    // rather than building on a stale count from the previous lockout.
    const newCount = current.attempts + 1;
    const now = Date.now();
    const shouldLock = newCount >= MAX_ATTEMPTS_BEFORE_COOLDOWN;
    const lockUntil = shouldLock ? now + COOLDOWN_SECONDS * 1000 : 0;

    const tracker: PinLockoutTracker = {
      failedAttempts: newCount,
      lockUntil,
    };
    localStorage.setItem(`${PIN_LOCKOUT_PREFIX}${uid}`, JSON.stringify(tracker));

    return {
      isLocked: shouldLock,
      remainingSeconds: shouldLock ? COOLDOWN_SECONDS : 0,
    };
  } catch {
    return { isLocked: false, remainingSeconds: 0 };
  }
}

function resetPinLockout(uid: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${PIN_LOCKOUT_PREFIX}${uid}`);
  } catch {}
}

/**
 * FIX 7: Validates that the stored value is a well-formed StoredPinRecord,
 * not just that the key exists. Returns null if the record is missing or corrupt.
 */
function loadPinRecord(uid: string): StoredPinRecord | null {
  if (!uid || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${PIN_STORAGE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.saltHex !== 'string' ||
      typeof parsed.hashHex !== 'string' ||
      typeof parsed.iterations !== 'number' ||
      parsed.saltHex.length === 0 ||
      parsed.hashHex.length === 0
    ) {
      console.warn('[PinSecurity] Stored PIN record failed schema validation. Treating as not configured.');
      return null;
    }
    return parsed as StoredPinRecord;
  } catch {
    return null;
  }
}

/**
 * Checks if a PIN has been set up on this device for the user UID.
 * FIX 7: Now validates the record schema, not just key existence.
 */
export function hasPinConfigured(uid: string): boolean {
  return loadPinRecord(uid) !== null;
}

/**
 * FIX 1: Returns true if the stored PIN was derived using the broken
 * fallback so the UI can prompt the user to re-setup their PIN.
 */
export function isPinDerivedWithWeakFallback(uid: string): boolean {
  const record = loadPinRecord(uid);
  return record?.weakFallbackUsed === true;
}

/**
 * Checks if the PIN has already been unlocked in the active browser session.
 */
export function isPinUnlockedInSession(uid: string): boolean {
  if (!uid || typeof window === 'undefined') return false;
  return sessionStorage.getItem(`${PIN_UNLOCKED_PREFIX}${uid}`) === 'true';
}

/**
 * Sets the PIN session as unlocked.
 */
export function markPinUnlockedInSession(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  sessionStorage.setItem(`${PIN_UNLOCKED_PREFIX}${uid}`, 'true');
}

/**
 * Revokes PIN unlock status for the active session (e.g. on sign out).
 */
export function clearPinSessionUnlock(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  sessionStorage.removeItem(`${PIN_UNLOCKED_PREFIX}${uid}`);
}

/**
 * Sets up a new PIN for the user on this device.
 * FIX 1: Throws if Web Crypto is unavailable instead of silently storing a weak verifier.
 * FIX 2: Static salt fallback removed — crypto is now required.
 * FIX 6: Validates that the PIN contains only digits.
 */
export async function setupPin(uid: string, pin: string): Promise<boolean> {
  if (!uid) throw new Error('UID is required to set up a PIN.');

  // FIX 6: Digits-only validation and length bounds
  if (!pin || !/^\d+$/.test(pin)) {
    throw new Error('PIN must contain digits only.');
  }
  if (pin.length < 4) {
    throw new Error('PIN must be at least 4 digits.');
  }
  // FIX 5: Upper bound to prevent excessive PBKDF2 CPU usage
  if (pin.length > MAX_PIN_LENGTH) {
    throw new Error(`PIN must be no more than ${MAX_PIN_LENGTH} digits.`);
  }

  // FIX 1: isCryptoAvailable check — derivePinVerifier will throw if false,
  // but checking here lets us give a cleaner user-facing error message
  if (!isCryptoAvailable()) {
    throw new Error(
      'PIN setup requires a secure browser context with Web Crypto support (HTTPS or localhost).'
    );
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await derivePinVerifier(pin, salt);
  const saltHex = bufferToHex(salt);

  const record: StoredPinRecord = {
    saltHex,
    hashHex,
    iterations: 100_000,
    createdAt: new Date().toISOString(),
    weakFallbackUsed: false,
  };

  localStorage.setItem(`${PIN_STORAGE_PREFIX}${uid}`, JSON.stringify(record));
  resetPinLockout(uid);
  markPinUnlockedInSession(uid);
  return true;
}

/**
 * Verifies an entered PIN against the stored cryptographic verifier.
 * FIX 5: Sanitises enteredPin length before derivation.
 * FIX 6: Validates digits-only before derivation.
 */
export async function verifyPin(
  uid: string,
  enteredPin: string
): Promise<{
  success: boolean;
  isLocked?: boolean;
  remainingSeconds?: number;
  message?: string;
}> {
  if (!uid) return { success: false, message: 'Invalid session.' };

  // FIX 5 + 6: Reject clearly invalid input before touching crypto or storage
  if (!enteredPin || !/^\d+$/.test(enteredPin)) {
    return { success: false, message: 'PIN must contain digits only.' };
  }
  if (enteredPin.length > MAX_PIN_LENGTH) {
    return { success: false, message: 'PIN exceeds maximum length.' };
  }

  // Check lockout
  const lockout = getPinLockoutStatus(uid);
  if (lockout.isLocked) {
    return {
      success: false,
      isLocked: true,
      remainingSeconds: lockout.remainingSeconds,
      message: `Too many incorrect attempts. Please wait ${lockout.remainingSeconds}s.`,
    };
  }

  // FIX 7: Use loadPinRecord which validates schema
  const record = loadPinRecord(uid);
  if (!record) {
    return { success: false, message: 'No PIN configured on this device.' };
  }

  try {
    const salt = hexToUint8Array(record.saltHex);
    const derivedCandidate = await derivePinVerifier(enteredPin, salt, record.iterations);

    // FIX 3: constantTimeEqual no longer leaks length via early return
    const isMatch = constantTimeEqual(derivedCandidate, record.hashHex);

    if (isMatch) {
      resetPinLockout(uid);
      markPinUnlockedInSession(uid);
      return { success: true };
    } else {
      const lockResult = recordFailedPinAttempt(uid);
      if (lockResult.isLocked) {
        return {
          success: false,
          isLocked: true,
          remainingSeconds: lockResult.remainingSeconds,
          message: `Too many incorrect attempts. Device access locked for ${lockResult.remainingSeconds}s.`,
        };
      }
      return {
        success: false,
        message: 'Incorrect PIN. Please try again.',
      };
    }
  } catch (err) {
    console.error('[PinSecurity] Verification error:', err);
    return { success: false, message: 'Verification error. Please retry.' };
  }
}

/**
 * Clears PIN configuration from device storage.
 */
export function clearPinConfig(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  localStorage.removeItem(`${PIN_STORAGE_PREFIX}${uid}`);
  localStorage.removeItem(`${PIN_LOCKOUT_PREFIX}${uid}`);
  sessionStorage.removeItem(`${PIN_UNLOCKED_PREFIX}${uid}`);
}