import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Secret for signing HTTP-only session tokens
const SESSION_SECRET = process.env.SESSION_SECRET || 'blizflow-session-super-secret-key-3ddd44d7-9238';
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
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(plainText: string, passwordHash: string): Promise<boolean> {
  if (!plainText || !passwordHash) return false;
  return bcrypt.compare(plainText, passwordHash);
}

// ── SESSIONS & COOKIES ──

export function createSessionToken(payload: AuthenticatedUserPayload): string {
  return jwt.sign(payload, SESSION_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256'
  });
}

export function verifySessionToken(token: string): AuthenticatedUserPayload | null {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });
    return decoded as AuthenticatedUserPayload;
  } catch (err) {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/'
  });
}

export function clearSessionCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  });
}

// ── MIDDLEWARE ──

export function authenticateUser(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    req.user = undefined;
    return next();
  }

  const payload = verifySessionToken(token);
  if (payload) {
    req.user = payload;
  } else {
    req.user = undefined;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please sign in.'
    });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Administrator privileges required.'
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

const loginAttempts = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { attempts: 1, resetAt: now + 15 * 60 * 1000 }); // 15 min window
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.attempts >= 10) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  record.attempts += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}
