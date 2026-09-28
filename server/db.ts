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
  shop_name: string;
  owner_id: string;
  status: 'open' | 'closed';
  subscription_status: 'trial' | 'active' | 'expired' | 'payment_pending' | 'suspended';
  plan: 'starter' | 'growth' | 'pro';
  trial_ends_at: string;
  next_renewal_date?: string;
  created_at: string;
  owner_name?: string;
  phone_number?: string;
  category?: string;
  address?: string;
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

// Ensure database directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Read database
function readDb(): DatabaseSchema {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const initialDb: DatabaseSchema = {
      users: {},
      shops: {},
      subscriptions: {}
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[DB] Failed to read database, creating fresh structure:', err);
    return { users: {}, shops: {}, subscriptions: {} };
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
  return db.shops[id] || null;
}

export async function insertShop(shop: ShopRecord): Promise<ShopRecord> {
  const db = readDb();
  db.shops[shop.id] = shop;
  writeDb(db);
  return shop;
}

export async function updateShop(id: string, updates: Partial<ShopRecord>): Promise<ShopRecord | null> {
  const db = readDb();
  if (!db.shops[id]) return null;
  db.shops[id] = { ...db.shops[id], ...updates };
  writeDb(db);
  return db.shops[id];
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
