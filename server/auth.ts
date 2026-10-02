import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ── CONFIG ──

const isProduction = process.env.NODE_ENV === 'production';

// FIX: no hardcoded fallback secret. Fail fast in production,
// use a random one-off secret in development.
function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (isProduction) {
    throw new Error('SESSION_SECRET must be set (min 32 chars) in production');
  }
  console.warn('[auth] SESSION_SECRET not set. Using a random dev secret (sessions reset on restart).');
  return crypto.randomBytes(48).toString('hex');
}

export const SESSION_SECRET = resolveSessionSecret();
export const SESSION_COOKIE_NAME = 'blizflow_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthenticatedUserPayload {
  userId: string;
  email: string;
  role: 'merchant' | 'admin';
  shopId: string;
  name: string;
}

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

// ── PASSWORDS ──

export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || plainText.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  // bcrypt ignores everything after 72 bytes
  if (Buffer.byteLength(plainText, 'utf8') > 72) {
    throw new Error('Password must be at most 72 bytes long');
  }
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(plainText: string, passwordHash: string): Promise<boolean> {
  if (!plainText || !passwordHash) return false;
  try {
    return await bcrypt.compare(plainText, passwordHash);
  } catch {
    return false;
  }
}

// ── SESSIONS & COOKIES ──

export function createSessionToken(payload: AuthenticatedUserPayload): string {
  // FIX: only sign known fields, so extra properties never leak into the token
  const { userId, email, role, shopId, name } = payload;
  return jwt.sign({ userId, email, role, shopId, name }, SESSION_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

function isValidPayload(value: unknown): value is AuthenticatedUserPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.userId === 'string' &&
    typeof p.email === 'string' &&
    typeof p.shopId === 'string' &&
    typeof p.name === 'string' &&
    (p.role === 'merchant' || p.role === 'admin')
  );
}

export function verifySessionToken(token: string): AuthenticatedUserPayload | null {
  try {
    // FIX: jwt.verify returns string | JwtPayload, so validate instead of blind casting
    const decoded = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });
    if (!isValidPayload(decoded)) return null;

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      shopId: decoded.shopId,
      name: decoded.name,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

// ── MIDDLEWARE ──

// FIX: `res` renamed to `_res` (unused-param lint/TS noUnusedParameters error)
export function authenticateUser(req: Request, _res: Response, next: NextFunction): void {
  // Requires cookie-parser: app.use(cookieParser())
  const token: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];
  req.user = token ? verifySessionToken(token) ?? undefined : undefined;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in.',
    });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Administrator privileges required.',
    });
    return;
  }
  next();
}

// ── BRUTE-FORCE RATE LIMITING ──

interface RateLimitRecord {
  attempts: number;
  resetAt: number;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, RateLimitRecord>();

// FIX: purge expired entries so the Map can't grow forever (memory leak)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts) {
    if (now > record.resetAt) loginAttempts.delete(key);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref(); // don't keep the process alive just for cleanup

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { attempts: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.attempts += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}