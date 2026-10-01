import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  findShopById,
  insertShop,
  updateShop,
  deleteShop,
  readAllShops,
  ShopRecord
} from './db';

const router = Router();

const SHOP_SESSION_COOKIE = 'blizflow_shop_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'blizflow-session-super-secret-key-3ddd44d7-9238';
const SHOP_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── PBKDF2 CRYPTO HELPERS (Reuses pinSecurity.ts PBKDF2 SHA-256 with 100,000 rounds) ──

export function hashPin(pin: string, saltHex: string, iterations = 100_000): string {
  const salt = Buffer.from(saltHex, 'hex');
  const derivedKey = crypto.pbkdf2Sync(pin, salt, iterations, 32, 'sha256');
  return derivedKey.toString('hex');
}

export function generatePinRecord(pin: string): { pinHash: string; pinSalt: string; pinIterations: number } {
  if (!pin || !/^\d{4,16}$/.test(pin)) {
    throw new Error('PIN must be 4 to 16 digits.');
  }
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString('hex');
  const pinHash = hashPin(pin, saltHex, 100_000);
  return {
    pinHash,
    pinSalt: saltHex,
    pinIterations: 100_000
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

// ── TOKEN / COOKIE HELPERS ──

export interface ShopSessionPayload {
  shopId: string;
  shopName: string;
  role: 'shop';
}

// In-memory brute force lockout protection for shop PIN verification
interface PinRateLimitEntry {
  attempts: number;
  lockedUntil: number;
}
const pinRateLimitMap = new Map<string, PinRateLimitEntry>();

function checkPinRateLimit(key: string, maxAttempts = 5, lockDurationSeconds = 60): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = pinRateLimitMap.get(key);

  if (!entry) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  if (entry.lockedUntil <= now && entry.attempts >= maxAttempts) {
    // Lock duration has elapsed, clear counter
    pinRateLimitMap.delete(key);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function recordFailedPinAttempt(key: string, maxAttempts = 5, lockDurationSeconds = 60): void {
  const now = Date.now();
  const entry = pinRateLimitMap.get(key) || { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;

  if (entry.attempts >= maxAttempts) {
    entry.lockedUntil = now + lockDurationSeconds * 1000;
  }

  pinRateLimitMap.set(key, entry);
}

function resetPinRateLimit(key: string): void {
  pinRateLimitMap.delete(key);
}

export function createShopSessionToken(shopId: string, shopName: string): string {
  const payload: ShopSessionPayload = {
    shopId,
    shopName,
    role: 'shop'
  };
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

export function verifyShopSessionToken(token: string): ShopSessionPayload | null {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET, { algorithms: ['HS256'] });
    return decoded as ShopSessionPayload;
  } catch (err) {
    return null;
  }
}

export function setShopCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.cookie(SHOP_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: SHOP_SESSION_MAX_AGE,
    path: '/'
  });
}

export function clearShopCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.clearCookie(SHOP_SESSION_COOKIE, {
    httpOnly: true,
    secure: Boolean(isHttps),
    sameSite: isHttps ? 'none' : 'lax',
    path: '/'
  });
}

// ── SANITIZATION HELPER ──
// Never leak pinHash or pinSalt to the browser
function sanitizeShop(shop: ShopRecord): Record<string, any> {
  const { pinHash, pinSalt, pinIterations, ...safeShop } = shop;
  return {
    ...safeShop,
    id: shop.id || (shop as any).shopId,
    shopId: shop.id || (shop as any).shopId,
    name: shop.name || shop.shop_name || 'My Store',
    ownerName: shop.ownerName || shop.owner_name || 'Owner',
    phoneNumber: shop.phoneNumber || shop.phone_number || '',
    status: shop.status
  };
}

// ── 1. VERIFY SHOP ID + PIN ──
router.post('/verify-pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId, pin } = req.body;

    if (!shopId || typeof shopId !== 'string' || !shopId.trim()) {
      res.status(400).json({ success: false, reason: 'NOT_FOUND', message: 'Please enter your Shop ID.' });
      return;
    }

    const cleanPin = typeof pin === 'string' ? pin.trim() : '';
    if (!cleanPin || !/^\d{4,16}$/.test(cleanPin)) {
      res.status(400).json({ success: false, reason: 'WRONG_PIN', message: 'PIN must be 4 to 16 digits.' });
      return;
    }

    const cleanShopId = shopId.trim().toUpperCase();
    const rateLimitKey = `${req.ip || 'ip'}:${cleanShopId}`;

    // Check brute-force lockout
    const { allowed, retryAfterSeconds } = checkPinRateLimit(rateLimitKey);
    if (!allowed) {
      res.status(429).json({
        success: false,
        reason: 'RATE_LIMITED',
        message: `Too many incorrect attempts. Please wait ${retryAfterSeconds} seconds before trying again.`
      });
      return;
    }

    // 1. Find shop in database
    const shop = await findShopById(cleanShopId);

    if (!shop) {
      recordFailedPinAttempt(rateLimitKey);
      res.status(401).json({
        success: false,
        reason: 'NOT_FOUND',
        message: 'Shop ID not found. Please check your Shop ID and try again.'
      });
      return;
    }

    // 2. Check shop status
    if (shop.status === 'pending') {
      res.status(403).json({
        success: false,
        reason: 'INACTIVE',
        message: 'Your shop is pending activation. Please contact BlizFlow support.'
      });
      return;
    }

    if (shop.status === 'suspended') {
      res.status(403).json({
        success: false,
        reason: 'INACTIVE',
        message: 'Your shop has been suspended. Please contact BlizFlow support.'
      });
      return;
    }

    if (shop.status !== 'active') {
      res.status(403).json({
        success: false,
        reason: 'INACTIVE',
        message: 'Your shop is not active. Please contact BlizFlow support.'
      });
      return;
    }

    // 3. Verify PIN using PBKDF2 with constant-time equality
    if (!shop.pinHash || !shop.pinSalt) {
      res.status(500).json({
        success: false,
        reason: 'ERROR',
        message: 'Shop security credentials not initialized. Contact support.'
      });
      return;
    }

    const candidateHash = hashPin(cleanPin, shop.pinSalt, shop.pinIterations || 100_000);
    const isMatch = constantTimeEqual(candidateHash, shop.pinHash);

    if (!isMatch) {
      recordFailedPinAttempt(rateLimitKey);
      res.status(401).json({
        success: false,
        reason: 'WRONG_PIN',
        message: 'Incorrect PIN. Please try again.'
      });
      return;
    }

    // Reset rate limiter on successful authentication
    resetPinRateLimit(rateLimitKey);

    // 4. Create secure HTTP-only session cookie
    const token = createShopSessionToken(cleanShopId, shop.name || shop.shop_name || cleanShopId);
    setShopCookie(req, res, token);

    // 5. Return success with sanitized shop
    res.json({
      success: true,
      shopId: cleanShopId,
      shop: sanitizeShop(shop)
    });
  } catch (error: any) {
    console.error('[Shop Auth] verify-pin error:', error);
    res.status(500).json({
      success: false,
      reason: 'ERROR',
      message: 'Server error during verification. Please try again.'
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
    if (!payload || !payload.shopId) {
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

    res.json({
      authenticated: true,
      shopId: payload.shopId,
      shop: sanitizeShop(shop)
    });
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

// ── 4. ADMIN SHOP MANAGEMENT ENDPOINTS ──

// List all shops for Admin console
router.get('/admin/shops', async (req: Request, res: Response): Promise<void> => {
  try {
    const shops = await readAllShops();
    const sanitized = shops.map(s => sanitizeShop(s));
    res.json({ success: true, shops: sanitized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin creates new shop
router.post('/admin/shops', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId, name, ownerName, phoneNumber, pin, email, category, address, status, notes } = req.body;

    const cleanShopId = (typeof shopId === 'string' && shopId.trim().toUpperCase()) || '';
    if (!cleanShopId) {
      res.status(400).json({ success: false, error: 'Shop ID is required (e.g. MEC001).' });
      return;
    }

    const cleanName = (typeof name === 'string' && name.trim()) || '';
    if (!cleanName) {
      res.status(400).json({ success: false, error: 'Shop Name is required.' });
      return;
    }

    const cleanPin = (typeof pin === 'string' && pin.trim()) || '';
    if (!cleanPin || !/^\d{4,16}$/.test(cleanPin)) {
      res.status(400).json({ success: false, error: 'PIN must be 4 to 16 digits.' });
      return;
    }

    // Check if Shop ID already exists
    const existing = await findShopById(cleanShopId);
    if (existing) {
      res.status(400).json({ success: false, error: `Shop ID "${cleanShopId}" already exists.` });
      return;
    }

    // Hash the PIN before storing
    const { pinHash, pinSalt, pinIterations } = generatePinRecord(cleanPin);

    const now = new Date().toISOString();
    const newShop: ShopRecord = {
      id: cleanShopId,
      shop_name: cleanName,
      name: cleanName,
      owner_id: `admin-created-${cleanShopId}`,
      ownerName: (typeof ownerName === 'string' && ownerName.trim()) || 'Shop Owner',
      owner_name: (typeof ownerName === 'string' && ownerName.trim()) || 'Shop Owner',
      phoneNumber: (typeof phoneNumber === 'string' && phoneNumber.trim()) || '',
      phone_number: (typeof phoneNumber === 'string' && phoneNumber.trim()) || '',
      email: (typeof email === 'string' && email.trim()) || '',
      category: (typeof category === 'string' && category.trim()) || 'General Retail',
      address: (typeof address === 'string' && address.trim()) || '',
      status: (status === 'active' || status === 'pending' || status === 'suspended') ? status : 'active',
      subscription_status: 'active',
      plan: 'starter',
      trial_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: now,
      createdAt: now,
      pinHash,
      pinSalt,
      pinIterations,
      notes: (typeof notes === 'string' && notes.trim()) || undefined
    };

    const saved = await insertShop(newShop);
    res.json({ success: true, shop: sanitizeShop(saved) });
  } catch (err: any) {
    console.error('[Admin] Create shop error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create shop.' });
  }
});

// Admin updates shop status (active, pending, suspended)
router.put('/admin/shops/:shopId/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.params;
    const { status } = req.body;

    const cleanShopId = shopId.trim().toUpperCase();
    if (!['active', 'pending', 'suspended'].includes(status)) {
      res.status(400).json({ success: false, error: 'Status must be active, pending, or suspended.' });
      return;
    }

    const existing = await findShopById(cleanShopId);
    if (!existing) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }

    const updated = await updateShop(cleanShopId, { status });
    res.json({ success: true, shop: updated ? sanitizeShop(updated) : null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin resets shop PIN
router.put('/admin/shops/:shopId/pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.params;
    const { pin } = req.body;

    const cleanShopId = shopId.trim().toUpperCase();
    const cleanPin = (typeof pin === 'string' && pin.trim()) || '';
    if (!cleanPin || !/^\d{4,16}$/.test(cleanPin)) {
      res.status(400).json({ success: false, error: 'PIN must be 4 to 16 digits.' });
      return;
    }

    const existing = await findShopById(cleanShopId);
    if (!existing) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }

    const { pinHash, pinSalt, pinIterations } = generatePinRecord(cleanPin);
    const updated = await updateShop(cleanShopId, { pinHash, pinSalt, pinIterations });

    res.json({ success: true, message: `PIN reset successfully for shop ${cleanShopId}.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin updates shop business details
router.put('/admin/shops/:shopId/details', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.params;
    const { name, ownerName, phoneNumber, email, category, address, notes } = req.body;

    const cleanShopId = shopId.trim().toUpperCase();
    const existing = await findShopById(cleanShopId);
    if (!existing) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }

    const updates: Partial<ShopRecord> = {};
    if (name) { updates.name = name; updates.shop_name = name; }
    if (ownerName) { updates.ownerName = ownerName; updates.owner_name = ownerName; }
    if (phoneNumber !== undefined) { updates.phoneNumber = phoneNumber; updates.phone_number = phoneNumber; }
    if (email !== undefined) updates.email = email;
    if (category) updates.category = category;
    if (address !== undefined) updates.address = address;
    if (req.body.plan) (updates as any).plan = req.body.plan;
    if (req.body.subscription_status || req.body.subscriptionStatus) {
      const sStat = req.body.subscription_status || req.body.subscriptionStatus;
      updates.subscription_status = sStat;
      (updates as any).subscriptionStatus = sStat;
    }
    if (notes !== undefined) (updates as any).notes = notes;

    const updated = await updateShop(cleanShopId, updates);
    res.json({ success: true, shop: updated ? sanitizeShop(updated) : null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin permanently deletes shop
router.delete('/admin/shops/:shopId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopId } = req.params;
    const cleanShopId = shopId.trim().toUpperCase();
    const deleted = await deleteShop(cleanShopId);
    if (!deleted) {
      res.status(404).json({ success: false, error: `Shop "${cleanShopId}" not found.` });
      return;
    }
    res.json({ success: true, message: `Shop "${cleanShopId}" deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
