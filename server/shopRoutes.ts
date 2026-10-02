import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import {
  findShopById,
  insertShop,
  updateShop,
  deleteShop,
  readAllShops,
  ShopRecord,
} from './db';
import { SESSION_SECRET, requireAuth, requireAdmin } from './auth';

const router = Router();

const SHOP_SESSION_COOKIE = 'blizflow_shop_session';
const SHOP_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const PIN_REGEX = /^\d{4,16}$/;
const SHOP_ID_REGEX = /^[A-Z0-9_-]{3,40}$/;
const PLANS = ['starter', 'growth', 'pro'] as const;
const SUB_STATUSES = ['trial', 'active', 'expired', 'payment_pending', 'suspended'] as const;
const SHOP_STATUSES = ['active', 'pending', 'suspended'] as const;

// Shop tokens use a key derived from the main secret, so a user-session JWT
// can never be accepted as a shop session (and vice versa).
const SHOP_TOKEN_SECRET = crypto
  .createHmac('sha256', SESSION_SECRET)
  .update('blizflow-shop-session-v1')
  .digest();

// ── ADMIN GATE ──
// Requires app.use(cookieParser()) and app.use(authenticateUser) to run before this router.
router.use('/admin', requireAuth, requireAdmin);

// ── PBKDF2 HELPERS ──

const pbkdf2Async = promisify(crypto.pbkdf2);

// Sync versions kept exported in case other modules import them
export function hashPin(pin: string, saltHex: string, iterations = 100_000): string {
  return crypto.pbkdf2Sync(pin, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
}

export function generatePinRecord(pin: string): { pinHash: string; pinSalt: string; pinIterations: number } {
  if (!pin || !PIN_REGEX.test(pin)) throw new Error('PIN must be 4 to 16 digits.');
  const pinSalt = crypto.randomBytes(16).toString('hex');
  return { pinHash: hashPin(pin, pinSalt, 100_000), pinSalt, pinIterations: 100_000 };
}

// Async versions don't block the event loop (PBKDF2 at 100k rounds is slow)
async function hashPinAsync(pin: string, saltHex: string, iterations = 100_000): Promise<string> {
  const key = await pbkdf2Async(pin, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256');
  return key.toString('hex');
}

async function generatePinRecordAsync(pin: string) {
  const pinSalt = crypto.randomBytes(16).toString('hex');
  const pinHash = await hashPinAsync(pin, pinSalt, 100_000);
  return { pinHash, pinSalt, pinIterations: 100_000 };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

// Used when a shop doesn't exist, so response time doesn't reveal valid Shop IDs
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH = crypto.randomBytes(32).toString('hex');

// ── BRUTE-FORCE LIMITER ──

interface LimitConfig { max: number; windowMs: number; lockMs: number }
interface LimitEntry { attempts: number; lockedUntil: number; windowEnds: number }

// Per IP + shop: slows down one attacker
const IP_LIMIT: LimitConfig = { max: 5, windowMs: 15 * 60_000, lockMs: 5 * 60_000 };
// Per shop across all IPs: stops attackers who rotate IPs
const SHOP_LIMIT: LimitConfig = { max: 20, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

const limiter = new Map<string, LimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, e] of limiter) {
    if (e.lockedUntil <= now && e.windowEnds <= now) limiter.delete(key);
  }
}, 5 * 60_000).unref();

function checkLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const e = limiter.get(key);
  const now = Date.now();
  if (e && e.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((e.lockedUntil - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function recordFailure(key: string, cfg: LimitConfig): void {
  const now = Date.now();
  let e = limiter.get(key);
  if (!e || (e.lockedUntil <= now && e.windowEnds <= now)) {
    e = { attempts: 0, lockedUntil: 0, windowEnds: now + cfg.windowMs };
  }
  e.attempts += 1;
  if (e.attempts >= cfg.max) {
    e.lockedUntil = now + cfg.lockMs;
    e.windowEnds = e.lockedUntil + cfg.windowMs;
    e.attempts = 0;
  }
  limiter.set(key, e);
}

// ── TOKEN / COOKIE HELPERS ──

export interface ShopSessionPayload {
  shopId: string;
  shopName: string;
  role: 'shop';
  pv: string; // PIN version: changes when the PIN is reset, which invalidates old sessions
}

const pinVersion = (shop: ShopRecord): string => (shop.pinHash || '').slice(0, 16);

export function createShopSessionToken(shopId: string, shopName: string, pv: string): string {
  const payload: ShopSessionPayload = { shopId, shopName, role: 'shop', pv };
  return jwt.sign(payload, SHOP_TOKEN_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

export function verifyShopSessionToken(token: string): ShopSessionPayload | null {
  try {
    const d = jwt.verify(token, SHOP_TOKEN_SECRET, { algorithms: ['HS256'] }) as any;
    if (
      !d || typeof d !== 'object' ||
      d.role !== 'shop' ||
      typeof d.shopId !== 'string' ||
      typeof d.pv !== 'string'
    ) return null;
    return { shopId: d.shopId, shopName: String(d.shopName ?? ''), role: 'shop', pv: d.pv };
  } catch {
    return null;
  }
}

function cookieOptions(req: Request) {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
}

export function setShopCookie(req: Request, res: Response, token: string): void {
  res.cookie(SHOP_SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SHOP_SESSION_MAX_AGE });
}

export function clearShopCookie(req: Request, res: Response): void {
  res.clearCookie(SHOP_SESSION_COOKIE, cookieOptions(req));
}

// ── HELPERS ──

// Never leak PIN data to the browser. Internal admin notes only go to admins.
function sanitizeShop(shop: ShopRecord, forAdmin = false): Record<string, any> {
  const { pinHash, pinSalt, pinIterations, notes, ...safeShop } = shop;
  return {
    ...safeShop,
    ...(forAdmin ? { notes } : {}),
    id: shop.id || shop.shopId,
    shopId: shop.id || shop.shopId,
    name: shop.name || shop.shop_name || 'My Store',
    ownerName: shop.ownerName || shop.owner_name || 'Owner',
    phoneNumber: shop.phoneNumber || shop.phone_number || '',
    status: shop.status,
  };
}

function cleanStr(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function normalizeShopId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toUpperCase();
  return SHOP_ID_REGEX.test(id) ? id : null;
}

// ── 1. VERIFY SHOP ID + PIN ──
router.post('/verify-pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId, pin } = req.body ?? {};

    const cleanShopId = normalizeShopId(shopId);
    if (!cleanShopId) {
      res.status(400).json({ success: false, reason: 'NOT_FOUND', message: 'Please enter a valid Shop ID.' });
      return;
    }

    const cleanPin = typeof pin === 'string' ? pin.trim() : '';
    if (!PIN_REGEX.test(cleanPin)) {
      res.status(400).json({ success: false, reason: 'WRONG_PIN', message: 'PIN must be 4 to 16 digits.' });
      return;
    }

    const ipKey = `ip:${req.ip || 'ip'}:${cleanShopId}`;
    const shopKey = `shop:${cleanShopId}`;

    for (const key of [ipKey, shopKey]) {
      const { allowed, retryAfterSeconds } = checkLimit(key);
      if (!allowed) {
        res.status(429).json({
          success: false,
          reason: 'RATE_LIMITED',
          message: `Too many incorrect attempts. Please wait ${retryAfterSeconds} seconds before trying again.`,
        });
        return;
      }
    }

    const shop = await findShopById(cleanShopId);

    // Always do the PBKDF2 work, even for unknown shops (no timing leak)
    let isMatch = false;
    if (shop && shop.pinHash && shop.pinSalt) {
      const candidate = await hashPinAsync(cleanPin, shop.pinSalt, shop.pinIterations || 100_000);
      isMatch = constantTimeEqualHex(candidate, shop.pinHash);
    } else {
      const candidate = await hashPinAsync(cleanPin, DUMMY_SALT);
      constantTimeEqualHex(candidate, DUMMY_HASH);
    }

    if (!shop || !isMatch) {
      recordFailure(ipKey, IP_LIMIT);
      recordFailure(shopKey, SHOP_LIMIT);
      // Same answer for "no such shop" and "wrong PIN": no Shop ID enumeration
      res.status(401).json({
        success: false,
        reason: 'WRONG_PIN',
        message: 'Incorrect Shop ID or PIN. Please try again.',
      });
      return;
    }

    // Status is only revealed AFTER the PIN is proven correct
    if (shop.status !== 'active') {
      const message =
        shop.status === 'pending'
          ? 'Your shop is pending activation. Please contact BlizFlow support.'
          : shop.status === 'suspended'
          ? 'Your shop has been suspended. Please contact BlizFlow support.'
          : 'Your shop is not active. Please contact BlizFlow support.';
      res.status(403).json({ success: false, reason: 'INACTIVE', message });
      return;
    }

    limiter.delete(ipKey);

    const token = createShopSessionToken(
      cleanShopId,
      shop.name || shop.shop_name || cleanShopId,
      pinVersion(shop)
    );
    setShopCookie(req, res, token);

    res.json({ success: true, shopId: cleanShopId, shop: sanitizeShop(shop) });
  } catch (error: any) {
    console.error('[Shop Auth] verify-pin error:', error);
    res.status(500).json({
      success: false,
      reason: 'ERROR',
      message: 'Server error during verification. Please try again.',
    });
  }
});

// ── 2. GET CURRENT SHOP SESSION ──
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.[SHOP_SESSION_COOKIE];
    if (!token) {
      res.json({ authenticated: false });
      return;
    }

    const payload = verifyShopSessionToken(token);
    if (!payload) {
      clearShopCookie(req, res);
      res.json({ authenticated: false });
      return;
    }

    const shop = await findShopById(payload.shopId);
    if (!shop || shop.status !== 'active') {
      clearShopCookie(req, res);
      res.json({ authenticated: false, message: 'Shop inactive or not found.' });
      return;
    }

    // PIN was reset after this session was issued
    if (payload.pv !== pinVersion(shop)) {
      clearShopCookie(req, res);
      res.json({ authenticated: false, message: 'Session expired. Please sign in again.' });
      return;
    }

    res.json({ authenticated: true, shopId: payload.shopId, shop: sanitizeShop(shop) });
  } catch (err: any) {
    console.error('[Shop Auth] /me error:', err);
    res.status(500).json({ authenticated: false });
  }
});

// ── 3. LOGOUT ──
router.post('/logout', (req: Request, res: Response): void => {
  clearShopCookie(req, res);
  res.json({ success: true, message: 'Shop session cleared successfully.' });
});

// ── 4. ADMIN SHOP MANAGEMENT (all protected by router.use('/admin', ...) above) ──

router.get('/admin/shops', async (_req: Request, res: Response): Promise<void> => {
  try {
    const shops = await readAllShops();
    res.json({ success: true, shops: shops.map((s) => sanitizeShop(s, true)) });
  } catch (err: any) {
    console.error('[Admin] List shops error:', err);
    res.status(500).json({ success: false, error: 'Failed to load shops.' });
  }
});

router.post('/admin/shops', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId, name, ownerName, phoneNumber, pin, email, category, address, status, notes } = req.body ?? {};

    const cleanShopId = normalizeShopId(shopId);
    if (!cleanShopId) {
      res.status(400).json({
        success: false,
        error: 'Shop ID is required: 3 to 40 letters, digits, "-" or "_" (e.g. MEC001).',
      });
      return;
    }

    const cleanName = cleanStr(name, 100);
    if (!cleanName) {
      res.status(400).json({ success: false, error: 'Shop Name is required.' });
      return;
    }

    const cleanPin = cleanStr(pin, 16);
    if (!PIN_REGEX.test(cleanPin)) {
      res.status(400).json({ success: false, error: 'PIN must be 4 to 16 digits.' });
      return;
    }

    if (await findShopById(cleanShopId)) {
      res.status(409).json({ success: false, error: `Shop ID "${cleanShopId}" already exists.` });
      return;
    }

    const { pinHash, pinSalt, pinIterations } = await generatePinRecordAsync(cleanPin);

    const owner = cleanStr(ownerName, 100) || 'Shop Owner';
    const phone = cleanStr(phoneNumber, 30);
    const now = new Date().toISOString();

    const newShop: ShopRecord = {
      id: cleanShopId,
      shop_name: cleanName,
      name: cleanName,
      owner_id: `admin-created-${cleanShopId}`,
      ownerName: owner,
      owner_name: owner,
      phoneNumber: phone,
      phone_number: phone,
      email: cleanStr(email, 254),
      category: cleanStr(category, 60) || 'General Retail',
      address: cleanStr(address, 200),
      status: (SHOP_STATUSES as readonly string[]).includes(status) ? status : 'active',
      subscription_status: 'active',
      plan: 'starter',
      trial_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: now,
      createdAt: now,
      pinHash,
      pinSalt,
      pinIterations,
      notes: cleanStr(notes, 1000) || undefined,
    };

    const saved = await insertShop(newShop);
    res.status(201).json({ success: true, shop: sanitizeShop(saved, true) });
  } catch (err: any) {
    if (err?.code === 'UNIQUE_VIOLATION') {
      res.status(409).json({ success: false, error: 'That Shop ID already exists.' });
      return;
    }
    console.error('[Admin] Create shop error:', err);
    res.status(500).json({ success: false, error: 'Failed to create shop.' });
  }
});

router.put('/admin/shops/:shopId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const cleanShopId = normalizeShopId(req.params.shopId);
    if (!cleanShopId) {
      res.status(400).json({ success: false, error: 'Invalid Shop ID.' });
      return;
    }

    const status = req.body?.status;
    if (!(SHOP_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ success: false, error: 'Status must be active, pending, or suspended.' });
      return;
    }

    const updated = await updateShop(cleanShopId, { status });
    if (!updated) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }
    res.json({ success: true, shop: sanitizeShop(updated, true) });
  } catch (err: any) {
    console.error('[Admin] Update status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update status.' });
  }
});

router.put('/admin/shops/:shopId/pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const cleanShopId = normalizeShopId(req.params.shopId);
    if (!cleanShopId) {
      res.status(400).json({ success: false, error: 'Invalid Shop ID.' });
      return;
    }

    const cleanPin = cleanStr(req.body?.pin, 16);
    if (!PIN_REGEX.test(cleanPin)) {
      res.status(400).json({ success: false, error: 'PIN must be 4 to 16 digits.' });
      return;
    }

    if (!(await findShopById(cleanShopId))) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }

    const record = await generatePinRecordAsync(cleanPin);
    await updateShop(cleanShopId, record);

    // Clear lockouts so the shop can sign in with the new PIN straight away
    limiter.delete(`shop:${cleanShopId}`);

    res.json({ success: true, message: `PIN reset successfully for shop ${cleanShopId}.` });
  } catch (err: any) {
    console.error('[Admin] Reset PIN error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset PIN.' });
  }
});

router.put('/admin/shops/:shopId/details', async (req: Request, res: Response): Promise<void> => {
  try {
    const cleanShopId = normalizeShopId(req.params.shopId);
    if (!cleanShopId) {
      res.status(400).json({ success: false, error: 'Invalid Shop ID.' });
      return;
    }

    if (!(await findShopById(cleanShopId))) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }

    const b = req.body ?? {};
    const updates: Partial<ShopRecord> & Record<string, any> = {};

    const name = cleanStr(b.name, 100);
    if (name) { updates.name = name; updates.shop_name = name; }

    const owner = cleanStr(b.ownerName, 100);
    if (owner) { updates.ownerName = owner; updates.owner_name = owner; }

    if (typeof b.phoneNumber === 'string') {
      const phone = cleanStr(b.phoneNumber, 30);
      updates.phoneNumber = phone;
      updates.phone_number = phone;
    }
    if (typeof b.email === 'string') updates.email = cleanStr(b.email, 254);
    if (typeof b.address === 'string') updates.address = cleanStr(b.address, 200);
    if (typeof b.notes === 'string') updates.notes = cleanStr(b.notes, 1000);

    const category = cleanStr(b.category, 60);
    if (category) updates.category = category;

    if (b.plan !== undefined) {
      if (!(PLANS as readonly string[]).includes(b.plan)) {
        res.status(400).json({ success: false, error: 'Plan must be starter, growth, or pro.' });
        return;
      }
      updates.plan = b.plan;
    }

    const sStat = b.subscription_status ?? b.subscriptionStatus;
    if (sStat !== undefined) {
      if (!(SUB_STATUSES as readonly string[]).includes(sStat)) {
        res.status(400).json({ success: false, error: 'Invalid subscription status.' });
        return;
      }
      updates.subscription_status = sStat;
      updates.subscriptionStatus = sStat; // kept for older frontend code
    }

    const updated = await updateShop(cleanShopId, updates);
    res.json({ success: true, shop: updated ? sanitizeShop(updated, true) : null });
  } catch (err: any) {
    console.error('[Admin] Update details error:', err);
    res.status(500).json({ success: false, error: 'Failed to update shop.' });
  }
});

router.delete('/admin/shops/:shopId', async (req: Request, res: Response): Promise<void> => {
  try {
    const cleanShopId = normalizeShopId(req.params.shopId);
    if (!cleanShopId) {
      res.status(400).json({ success: false, error: 'Invalid Shop ID.' });
      return;
    }

    if (!(await deleteShop(cleanShopId))) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }
    res.json({ success: true, message: `Shop "${cleanShopId}" deleted successfully.` });
  } catch (err: any) {
    console.error('[Admin] Delete shop error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete shop.' });
  }
});

export default router;