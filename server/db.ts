import fs from 'fs';
import path from 'path';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  shop_id: string;
  role: 'merchant' | 'admin';
  created_at: string;
}

export interface ShopRecord {
  id: string;
  shopId?: string;
  name?: string;
  shop_name?: string;
  owner_id?: string;
  ownerName?: string;
  owner_name?: string;
  email?: string;
  phoneNumber?: string;
  phone_number?: string;
  category?: string;
  address?: string;
  status: 'active' | 'pending' | 'suspended' | 'open' | 'closed';
  subscription_status?: 'trial' | 'active' | 'expired' | 'payment_pending' | 'suspended';
  plan?: 'starter' | 'growth' | 'pro';
  trial_ends_at?: string;
  next_renewal_date?: string;
  created_at?: string;
  createdAt?: string;
  onboarding_status?: 'required' | 'in_progress' | 'complete';
  pinHash?: string;
  pinSalt?: string;
  pinIterations?: number;
  notes?: string;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  shop_id: string;
  plan: 'starter' | 'growth' | 'pro';
  status: 'trial' | 'active' | 'expired' | 'payment_pending' | 'suspended';
  started_at: string;
  expires_at: string;
  payment_reference?: string | null;
  created_at: string;
}

interface DatabaseSchema {
  users: Record<string, UserRecord>;
  shops: Record<string, ShopRecord>;
  subscriptions: Record<string, SubscriptionRecord>;
}

// ── STORAGE ──

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'blizflow_custom_db.json');

// Hash that older versions seeded into the DB as the "admin123" admin password.
// Any user still carrying it is a known-password backdoor and is removed on load.
const LEGACY_SEEDED_HASH = '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';

// In-memory cache (single-process only). Callers always get clones.
let cache: DatabaseSchema | null = null;

function emptyDb(): DatabaseSchema {
  return { users: {}, shops: {}, subscriptions: {} };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Guards against keys like "__proto__" / "constructor" resolving to prototype members
function has(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function uniqueError(message: string): Error {
  return Object.assign(new Error(`Unique constraint violation: ${message}`), {
    code: 'UNIQUE_VIOLATION',
  });
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function persist(data: DatabaseSchema): void {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpFile, DB_FILE); // atomic replace
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    throw err;
  }
}

function load(): DatabaseSchema {
  if (cache) return cache;
  ensureDataDir();

  if (!fs.existsSync(DB_FILE)) {
    const fresh = emptyDb();
    persist(fresh);
    cache = fresh;
    return cache;
  }

  let parsed: Partial<DatabaseSchema>;
  try {
    parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    // Do NOT silently start with an empty DB: the next write would erase all real data.
    const backup = `${DB_FILE}.corrupt.${Date.now()}`;
    try { fs.copyFileSync(DB_FILE, backup); } catch { /* ignore */ }
    console.error(`[DB] Database file is unreadable. A copy was saved to ${backup}.`, err);
    throw new Error('Database file is corrupt. Restore it from a backup or fix the JSON, then restart.');
  }

  const db: DatabaseSchema = {
    users: parsed.users ?? {},
    shops: parsed.shops ?? {},
    subscriptions: parsed.subscriptions ?? {},
  };

  // Remove legacy backdoor admins
  let removed = 0;
  for (const [id, user] of Object.entries(db.users)) {
    if (user.password_hash === LEGACY_SEEDED_HASH) {
      delete db.users[id];
      removed++;
    }
  }
  if (removed > 0) {
    console.warn(
      `[DB] Removed ${removed} legacy seeded user(s) with a known default password. ` +
      'Create your admin with ADMIN_EMAIL + ADMIN_BOOTSTRAP_PASSWORD.'
    );
    persist(db);
  }

  cache = db;
  return cache;
}

// Run a mutation, then save. If saving fails, drop the cache so memory never
// disagrees with what is on disk.
function mutate<T>(fn: (db: DatabaseSchema) => T): T {
  const db = load();
  try {
    const result = fn(db);
    persist(db);
    return result;
  } catch (err) {
    cache = null;
    throw err;
  }
}

// ── USER REPOSITORY ──

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  for (const user of Object.values(load().users)) {
    if (user.email.toLowerCase() === normalized) return clone(user);
  }
  return null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (typeof id !== 'string') return null;
  const db = load();
  return has(db.users, id) ? clone(db.users[id]) : null;
}

export async function insertUser(user: UserRecord): Promise<UserRecord> {
  return mutate((db) => {
    const email = user.email.trim().toLowerCase();
    if (has(db.users, user.id)) throw uniqueError('user id already exists');
    if (Object.values(db.users).some((u) => u.email.toLowerCase() === email)) {
      throw uniqueError('email already exists');
    }
    db.users[user.id] = { ...user, email };
    return clone(db.users[user.id]);
  });
}

export async function updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
  return mutate((db) => {
    if (!has(db.users, id)) return null;
    const { id: _ignoredId, ...safe } = updates; // id can never change
    if (safe.email) {
      safe.email = safe.email.trim().toLowerCase();
      const taken = Object.values(db.users).some(
        (u) => u.id !== id && u.email.toLowerCase() === safe.email
      );
      if (taken) throw uniqueError('email already exists');
    }
    db.users[id] = { ...db.users[id], ...safe };
    return clone(db.users[id]);
  });
}

// ── SHOP REPOSITORY ──

export async function findShopById(id: string): Promise<ShopRecord | null> {
  if (typeof id !== 'string') return null;
  const db = load();
  const upper = id.trim().toUpperCase();
  if (has(db.shops, upper)) return clone(db.shops[upper]);
  if (has(db.shops, id)) return clone(db.shops[id]);
  return null;
}

export async function readAllShops(): Promise<ShopRecord[]> {
  return clone(Object.values(load().shops));
}

export async function insertShop(shop: ShopRecord): Promise<ShopRecord> {
  return mutate((db) => {
    const cleanId = (shop.id || shop.shopId || '').trim().toUpperCase();
    if (!cleanId) throw new Error('Shop id is required');
    if (has(db.shops, cleanId)) throw uniqueError('shop id already exists');
    db.shops[cleanId] = { ...shop, id: cleanId, shopId: cleanId };
    return clone(db.shops[cleanId]);
  });
}

export async function updateShop(id: string, updates: Partial<ShopRecord>): Promise<ShopRecord | null> {
  return mutate((db) => {
    const cleanId = String(id ?? '').trim().toUpperCase();
    if (!has(db.shops, cleanId)) return null;
    const { id: _ignoredId, shopId: _ignoredShopId, ...safe } = updates; // ids can never change
    db.shops[cleanId] = { ...db.shops[cleanId], ...safe };
    return clone(db.shops[cleanId]);
  });
}

export async function deleteShop(id: string): Promise<boolean> {
  return mutate((db) => {
    const raw = String(id ?? '');
    const cleanId = raw.trim().toUpperCase();
    const existed = has(db.shops, cleanId) || has(db.shops, raw);
    if (!existed) return false;

    delete db.shops[cleanId];
    delete db.shops[raw];

    // Remove subscriptions of the deleted shop so none are orphaned
    for (const [subId, sub] of Object.entries(db.subscriptions)) {
      if (sub.shop_id.trim().toUpperCase() === cleanId) delete db.subscriptions[subId];
    }
    return true;
  });
}

// ── SUBSCRIPTION REPOSITORY ──

export async function findSubscriptionByShopId(shopId: string): Promise<SubscriptionRecord | null> {
  if (typeof shopId !== 'string') return null;
  const target = shopId.trim().toUpperCase();
  for (const sub of Object.values(load().subscriptions)) {
    // Case-insensitive, because shop ids are stored uppercased
    if (sub.shop_id.trim().toUpperCase() === target) return clone(sub);
  }
  return null;
}

export async function insertSubscription(sub: SubscriptionRecord): Promise<SubscriptionRecord> {
  return mutate((db) => {
    if (has(db.subscriptions, sub.id)) throw uniqueError('subscription id already exists');
    db.subscriptions[sub.id] = { ...sub };
    return clone(db.subscriptions[sub.id]);
  });
}

export async function updateSubscription(
  id: string,
  updates: Partial<SubscriptionRecord>
): Promise<SubscriptionRecord | null> {
  return mutate((db) => {
    if (!has(db.subscriptions, id)) return null;
    const { id: _ignoredId, ...safe } = updates;
    db.subscriptions[id] = { ...db.subscriptions[id], ...safe };
    return clone(db.subscriptions[id]);
  });
}