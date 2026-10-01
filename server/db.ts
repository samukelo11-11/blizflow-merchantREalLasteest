import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

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

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'blizflow_custom_db.json');

function derivePinHashSync(pin: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.pbkdf2Sync(pin, salt, 100_000, 32, 'sha256').toString('hex');
}

// Ensure database directory exists and initialize seed shops
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getInitialDb(): DatabaseSchema {
  const now = new Date().toISOString();
  return {
    users: {
      'admin-system': {
        id: 'admin-system',
        name: 'System Administrator',
        email: 'admin@blizflow.co.za',
        password_hash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', // admin123
        shop_id: 'ALL',
        role: 'admin',
        created_at: now
      },
      'admin-owner': {
        id: 'admin-owner',
        name: 'Admin Samukelo',
        email: 'mngomezulusamukelo6@gmail.com',
        password_hash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', // admin123
        shop_id: 'ALL',
        role: 'admin',
        created_at: now
      }
    },
    shops: {},
    subscriptions: {}
  };
}

// Read database
function readDb(): DatabaseSchema {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initialDb = getInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed: DatabaseSchema = JSON.parse(raw);
    
    // Ensure admin user exists in database
    if (!parsed.users || !Object.values(parsed.users).some(u => u.email.toLowerCase() === 'admin@blizflow.co.za')) {
      const initial = getInitialDb();
      if (!parsed.users) parsed.users = {};
      parsed.users['admin-system'] = initial.users['admin-system'];
      parsed.users['admin-owner'] = initial.users['admin-owner'];
      fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    }
    return parsed;
  } catch (err) {
    console.error('[DB] Failed to read database, creating fresh structure:', err);
    return getInitialDb();
  }
}

// Write database atomically
function writeDb(data: DatabaseSchema): void {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

// ── USER REPOSITORY ──

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const db = readDb();
  const normalized = email.trim().toLowerCase();
  for (const user of Object.values(db.users)) {
    if (user.email.toLowerCase() === normalized) {
      return user;
    }
  }
  return null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = readDb();
  return db.users[id] || null;
}

export async function insertUser(user: UserRecord): Promise<UserRecord> {
  const db = readDb();
  db.users[user.id] = { ...user, email: user.email.trim().toLowerCase() };
  writeDb(db);
  return db.users[user.id];
}

export async function updateUser(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
  const db = readDb();
  if (!db.users[id]) return null;
  db.users[id] = { ...db.users[id], ...updates };
  writeDb(db);
  return db.users[id];
}

// ── SHOP REPOSITORY ──

export async function findShopById(id: string): Promise<ShopRecord | null> {
  const db = readDb();
  const upper = id.trim().toUpperCase();
  return db.shops[upper] || db.shops[id] || null;
}

export async function readAllShops(): Promise<ShopRecord[]> {
  const db = readDb();
  return Object.values(db.shops);
}

export async function insertShop(shop: ShopRecord): Promise<ShopRecord> {
  const db = readDb();
  const cleanId = (shop.id || shop.shopId || '').trim().toUpperCase();
  const record = { ...shop, id: cleanId, shopId: cleanId };
  db.shops[cleanId] = record;
  writeDb(db);
  return record;
}

export async function updateShop(id: string, updates: Partial<ShopRecord>): Promise<ShopRecord | null> {
  const db = readDb();
  const cleanId = id.trim().toUpperCase();
  if (!db.shops[cleanId]) return null;
  db.shops[cleanId] = { ...db.shops[cleanId], ...updates };
  writeDb(db);
  return db.shops[cleanId];
}

export async function deleteShop(id: string): Promise<boolean> {
  const db = readDb();
  const cleanId = id.trim().toUpperCase();
  if (!db.shops[cleanId] && !db.shops[id]) return false;
  delete db.shops[cleanId];
  delete db.shops[id];
  writeDb(db);
  return true;
}

// ── SUBSCRIPTION REPOSITORY ──

export async function findSubscriptionByShopId(shopId: string): Promise<SubscriptionRecord | null> {
  const db = readDb();
  for (const sub of Object.values(db.subscriptions)) {
    if (sub.shop_id === shopId) {
      return sub;
    }
  }
  return null;
}

export async function insertSubscription(sub: SubscriptionRecord): Promise<SubscriptionRecord> {
  const db = readDb();
  db.subscriptions[sub.id] = sub;
  writeDb(db);
  return sub;
}

export async function updateSubscription(id: string, updates: Partial<SubscriptionRecord>): Promise<SubscriptionRecord | null> {
  const db = readDb();
  if (!db.subscriptions[id]) return null;
  db.subscriptions[id] = { ...db.subscriptions[id], ...updates };
  writeDb(db);
  return db.subscriptions[id];
}
