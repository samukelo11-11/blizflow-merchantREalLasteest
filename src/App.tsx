/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { db, handleFirestoreError, OperationType } from './services/firebaseConfig';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ShopProfile, Product, Transaction, InventoryActivity, Expense } from './types';
import { fetchShopSession, logoutShop } from './services/shopAuth';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import ProductManagement from './components/ProductManagement';
import POS from './components/POS';
import SalesPage from './components/SalesPage';
import ExpensesPage from './components/ExpensesPage';
import SettingsPage from './components/SettingsPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminRouteGuard from './components/AdminRouteGuard';
import AdminLogin from './pages/AdminLogin';
import MerchantManagement from './pages/MerchantManagement';
import SubscriptionManagement from './pages/SubscriptionManagement';
import {
  Zap, LogOut, CheckCircle, ArrowRight, ShoppingCart, Menu, X,
  Home, Package, Receipt, TrendingDown, Settings, ShieldCheck
} from 'lucide-react';
import { isDevModeActive } from './auth/devMode';

export { isDevModeActive };

// ── Starter products generator ──
function generateProductId(): string {
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

function generateStarterProducts(shopId: string): Product[] {
  const now = new Date().toISOString();
  return [
    { id: generateProductId(), shopId, name: 'Fresh Red Apple', category: 'Fresh Produce (Fruit & Veg)', sellingPrice: 5, costPrice: 3, stockQuantity: 30, unit: 'Units', availability: 'in_stock', barcode: '6001000000034', lowStockLevel: 5, createdAt: now, imageUrl: '' },
    { id: generateProductId(), shopId, name: 'Coca-Cola 2L', category: 'Beverages & Liquor', sellingPrice: 26, costPrice: 20, stockQuantity: 24, unit: 'Bottle', availability: 'in_stock', barcode: '6001087300001', lowStockLevel: 5, createdAt: now, imageUrl: '' },
    { id: generateProductId(), shopId, name: 'White Bread 700g', category: 'Bakery & Confectionery', sellingPrice: 18.5, costPrice: 14, stockQuantity: 15, unit: 'Loaf', availability: 'in_stock', barcode: '6001000000012', lowStockLevel: 5, createdAt: now, imageUrl: '' },
    { id: generateProductId(), shopId, name: 'Full Cream Milk 2L', category: 'Grocery & Supermarket', sellingPrice: 32, costPrice: 26, stockQuantity: 12, unit: 'Bottle', availability: 'in_stock', barcode: '6001000000056', lowStockLevel: 4, createdAt: now, imageUrl: '' },
  ];
}

// ── Dev Data Boundary ──
interface AppDataBoundary {
  isDev: boolean;
  products: {
    subscribe: (shopId: string, onData: (p: Product[]) => void, onError?: (e: unknown) => void) => () => void;
    save: (product: Product) => Promise<void>;
    update: (product: Product) => Promise<void>;
    delete: (id: string, shopId: string) => Promise<void>;
    saveStarters: (shopId: string, starters: Product[]) => Promise<void>;
  };
}

const createDevDataBoundary = (shopId?: string): AppDataBoundary => {
  const STORAGE_KEY = `blizflow_products_${shopId || 'local'}`;
  return {
    isDev: true,
    products: {
      subscribe: (sId, onData) => {
        const key = `blizflow_products_${sId || 'local'}`;
        const load = () => {
          try {
            const raw = localStorage.getItem(key);
            onData(raw ? JSON.parse(raw) : generateStarterProducts(sId));
          } catch {
            onData(generateStarterProducts(sId));
          }
        };
        load();
        const handler = () => load();
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
      },
      save: async (product) => {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list: Product[] = raw ? JSON.parse(raw) : [];
        const next = [product, ...list.filter(p => p.id !== product.id)];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      update: async (product) => {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list: Product[] = raw ? JSON.parse(raw) : [];
        const next = list.map(p => p.id === product.id ? product : p);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      delete: async (id) => {
        const raw = localStorage.getItem(STORAGE_KEY);
        const list: Product[] = raw ? JSON.parse(raw) : [];
        const next = list.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      },
      saveStarters: async (sId, starters) => {
        const key = `blizflow_products_${sId || 'local'}`;
        localStorage.setItem(key, JSON.stringify(starters));
      }
    }
  };
};

const prodDataBoundary: AppDataBoundary = {
  isDev: false,
  products: {
    subscribe: (shopId, onData, onError) => {
      if (typeof window === 'undefined') return () => {};
      return onSnapshot(
        collection(db, 'merchants', shopId, 'products'),
        (snap) => {
          const items: Product[] = [];
          snap.forEach(d => items.push({ ...d.data(), id: d.id } as Product));
          onData(items);
        },
        onError || ((err) => console.warn('[App] Products sync:', err))
      );
    },
    save: async (product) => {
      await setDoc(doc(db, 'merchants', product.shopId, 'products', product.id), product);
    },
    update: async (product) => {
      await setDoc(doc(db, 'merchants', product.shopId, 'products', product.id), product, { merge: true });
    },
    delete: async (id, shopId) => {
      await deleteDoc(doc(db, 'merchants', shopId, 'products', id));
    },
    saveStarters: async (shopId, starters) => {
      for (const p of starters) {
        try {
          await setDoc(doc(db, 'merchants', shopId, 'products', p.id), p);
        } catch (e) {
          console.warn(`[App] Failed to save starter product "${p.name}":`, e);
        }
      }
    }
  }
};

export const getDataBoundary = (shopId?: string): AppDataBoundary =>
  isDevModeActive() ? createDevDataBoundary(shopId) : prodDataBoundary;

export type AppAuthState =
  | 'AUTH_LOADING'
  | 'UNAUTHENTICATED'
  | 'READY';

// ── MerchantPortal Component ──
interface MerchantPortalProps {
  appAuthState: AppAuthState;
  isAuthLoading: boolean;
  shop: ShopProfile | null;
  products: Product[];
  transactions: Transaction[];
  activities: InventoryActivity[];
  expenses: Expense[];
  activeView: string;
  setActiveView: (view: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  showSuccessOverlay: boolean;
  setShowSuccessOverlay: (show: boolean) => void;
  isSigningOut: boolean;
  onLoginSuccess: (shop: ShopProfile) => void;
  onSaveShop: (profile: ShopProfile) => void;
  onUpdateShop: (profile: ShopProfile) => void;
  onAddProduct: (p: Product) => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddExpense: (exp: Omit<Expense, 'id' | 'createdAt'>) => void;
  onDeleteExpense: (id: string) => void;
  onCompleteSale: (items: { productId: string; quantity: number }[], details?: { paymentMethod?: 'cash' | 'card' | 'other'; receiptNo?: string }) => Promise<void>;
  onSignOut: () => void;
  onToggleShopStatus: () => void;
}

const MerchantPortal: React.FC<MerchantPortalProps> = ({
  appAuthState, isAuthLoading, shop, products, transactions,
  activities, expenses, activeView, setActiveView, isMobileMenuOpen,
  setIsMobileMenuOpen, showSuccessOverlay, setShowSuccessOverlay, isSigningOut,
  onLoginSuccess, onSaveShop, onUpdateShop, onAddProduct, onEditProduct, onDeleteProduct,
  onAddExpense, onDeleteExpense, onCompleteSale, onSignOut, onToggleShopStatus,
}) => {
  if (isAuthLoading || appAuthState === 'AUTH_LOADING') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans gap-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/20 animate-pulse">
          <Zap className="w-5 h-5 fill-white" />
        </div>
        <p className="text-xs font-semibold text-slate-500">Connecting to BlizFlow...</p>
      </div>
    );
  }

  // If unauthenticated or activeView is landing, show the Landing Page
  if (appAuthState === 'UNAUTHENTICATED' || !shop || activeView === 'landing') {
    return (
      <LandingPage
        onLoginSuccess={onLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Shop Navigation Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs">
              <Zap className="w-5 h-5 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-tight text-slate-900">{shop.name}</span>
                <span className="bg-slate-100 text-slate-600 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                  {shop.id}
                </span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Logged in as {shop.ownerName}</p>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {[
              { view: 'dashboard', label: 'Dashboard', icon: Home },
              { view: 'pos', label: 'Point of Sale', icon: ShoppingCart },
              { view: 'products', label: 'Products', icon: Package },
              { view: 'sales', label: 'Sales', icon: Receipt },
              { view: 'expenses', label: 'Expenses', icon: TrendingDown },
              { view: 'settings', label: 'Settings', icon: Settings },
            ].map(({ view, label, icon: Icon }) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeView === view ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}

            <button
              onClick={onSignOut}
              disabled={isSigningOut}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 transition flex items-center gap-1.5 cursor-pointer ml-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Nav Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-100 bg-white px-4 py-3 shadow-lg space-y-1">
            {[
              { view: 'dashboard', label: 'Dashboard', icon: Home },
              { view: 'pos', label: 'Point of Sale', icon: ShoppingCart },
              { view: 'products', label: 'Products', icon: Package },
              { view: 'sales', label: 'Sales', icon: Receipt },
              { view: 'expenses', label: 'Expenses', icon: TrendingDown },
              { view: 'settings', label: 'Settings', icon: Settings },
            ].map(({ view, label, icon: Icon }) => (
              <button
                key={view}
                onClick={() => { setActiveView(view); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold ${
                  activeView === view ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => { setIsMobileMenuOpen(false); onSignOut(); }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main View Router */}
      <div className="flex-1 flex flex-col">
        {activeView === 'dashboard' && (
          <Dashboard
            shop={shop}
            products={products}
            transactions={transactions}
            expenses={expenses}
            activities={activities}
            onToggleStatus={onToggleShopStatus}
            onNavigate={(view) => {
              if (view === 'profile' || view === 'settings') setActiveView('settings');
              else if (view === 'add_product' || view === 'products') setActiveView('products');
              else if (view === 'pos') setActiveView('pos');
              else if (view === 'sales') setActiveView('sales');
              else if (view === 'expenses') setActiveView('expenses');
              else setActiveView('dashboard');
            }}
            onEditProfile={() => setActiveView('settings')}
          />
        )}
        {activeView === 'products' && (
          <ProductManagement
            shop={shop}
            products={products}
            onAddProduct={onAddProduct}
            onEditProduct={onEditProduct}
            onDeleteProduct={onDeleteProduct}
            onBackToDashboard={() => setActiveView('dashboard')}
          />
        )}
        {activeView === 'pos' && (
          <POS
            products={products}
            onCompleteSale={onCompleteSale}
            onBackToDashboard={() => setActiveView('dashboard')}
          />
        )}
        {activeView === 'sales' && (
          <SalesPage
            transactions={transactions}
            onBackToDashboard={() => setActiveView('dashboard')}
          />
        )}
        {activeView === 'expenses' && (
          <ExpensesPage
            expenses={expenses}
            onAddExpense={onAddExpense}
            onDeleteExpense={onDeleteExpense}
            onBackToDashboard={() => setActiveView('dashboard')}
          />
        )}
        {activeView === 'settings' && (
          <SettingsPage
            shop={shop}
            onUpdateShop={onUpdateShop}
            onBackToDashboard={() => setActiveView('dashboard')}
            onLogout={onSignOut}
          />
        )}
      </div>

      {/* Success Notification Overlay */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-sm w-full text-center shadow-2xl space-y-5">
            <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-full mx-auto flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Shop Unlocked!</h2>
              <p className="text-xs text-slate-500 mt-1">Welcome, <strong>{shop?.name}</strong>!</p>
            </div>
            <button
              onClick={() => { setShowSuccessOverlay(false); setActiveView('dashboard'); }}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Root App Component ──
export default function App() {
  const [activeView, setActiveView] = useState<string>('landing');
  const [appAuthState, setAppAuthState] = useState<AppAuthState>('AUTH_LOADING');
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activities, setActivities] = useState<InventoryActivity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allMerchants, setAllMerchants] = useState<ShopProfile[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // ── Auth State & Session Check ──
  // Authoritative server-side session check via /api/shop/me using HTTP-only cookies
  useEffect(() => {
    let isCancelled = false;

    const restoreSession = async () => {
      // Don't intercept direct admin routes
      if (window.location.pathname.startsWith('/admin')) {
        setIsAuthLoading(false);
        return;
      }

      // Check HTTP-only shop session from server /api/shop/me
      try {
        const session = await fetchShopSession();
        if (session.authenticated && session.shop && !isCancelled) {
          setShop(session.shop);
          setAppAuthState('READY');
          setActiveView('dashboard');
          setIsAuthLoading(false);
          return;
        }
      } catch (err) {
        console.warn('[App] Session restore check note:', err);
      }

      // Unauthenticated -> show Landing Page
      if (!isCancelled) {
        setShop(null);
        setAppAuthState('UNAUTHENTICATED');
        setActiveView('landing');
        setIsAuthLoading(false);
      }
    };

    restoreSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  // ── Product Sync ──
  useEffect(() => {
    if (!shop?.id) return;
    const boundary = getDataBoundary(shop.id);
    return boundary.products.subscribe(shop.id, setProducts, (err) => console.warn('[App] Products sync error:', err));
  }, [shop?.id]);

  // ── Subcollection Listeners for Transactions, Activities, Expenses ──
  useEffect(() => {
    if (!shop?.id || isDevModeActive()) return;
    const shopId = shop.id;

    const unsubTx = onSnapshot(
      collection(db, 'merchants', shopId, 'sales'),
      (snap) => {
        const items: Transaction[] = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id } as Transaction));
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTransactions(items);
      },
      (err) => console.warn('[App] Transactions sync:', err)
    );

    const unsubAct = onSnapshot(
      collection(db, 'merchants', shopId, 'inventory_activities'),
      (snap) => {
        const items: InventoryActivity[] = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id } as InventoryActivity));
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setActivities(items);
      },
      (err) => console.warn('[App] Activities sync:', err)
    );

    const unsubExp = onSnapshot(
      collection(db, 'merchants', shopId, 'expenses'),
      (snap) => {
        const items: Expense[] = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id } as Expense));
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setExpenses(items);
      },
      (err) => console.warn('[App] Expenses sync:', err)
    );

    return () => { unsubTx(); unsubAct(); unsubExp(); };
  }, [shop?.id]);

  // Admin merchants listener
  useEffect(() => {
    if (isDevModeActive()) return;
    return onSnapshot(
      collection(db, 'merchants'),
      (snap) => {
        const items: ShopProfile[] = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id } as ShopProfile));
        setAllMerchants(items);
      },
      (err) => console.warn('[App] Merchants sync:', err)
    );
  }, []);

  const handleLoginSuccess = useCallback(async (authedShop: ShopProfile) => {
    try {
      // Re-verify authoritative server session from HTTP-only cookie
      const session = await fetchShopSession();
      if (session.authenticated && session.shop) {
        setShop(session.shop);
        setAppAuthState('READY');
        setActiveView('dashboard');
        return;
      }
    } catch (err) {
      console.warn('[App] Post-login session check note:', err);
    }
    setShop(authedShop);
    setAppAuthState('READY');
    setActiveView('dashboard');
  }, []);

  const handleSaveShop = useCallback(async (profile: ShopProfile) => {
    const isFirstTime = !shop;
    const updated: ShopProfile = {
      ...profile,
      status: profile.status || 'active',
      isEmailVerified: true
    };
    setShop(updated);
    setAppAuthState('READY');

    try { await setDoc(doc(db, 'merchants', updated.id), updated, { merge: true }); }
    catch (e) { console.error('[App] Shop save failed:', e); }

    if (isFirstTime && products.length === 0) {
      const starters = generateStarterProducts(updated.id);
      setProducts(starters);
      try { await getDataBoundary(updated.id).products.saveStarters(updated.id, starters); }
      catch (e) { console.warn('[App] Starter products save error:', e); }
    }
    if (isFirstTime) setShowSuccessOverlay(true);
    else setActiveView('dashboard');
  }, [shop, products.length]);

  const handleUpdateShop = useCallback(async (updated: ShopProfile) => {
    setShop(updated);
    try { await setDoc(doc(db, 'merchants', updated.id), updated, { merge: true }); }
    catch (e) { console.error('[App] Failed to update merchant profile:', e); }
  }, []);

  const handleAddProduct = useCallback(async (p: Product) => {
    const product = { ...p, shopId: shop?.id || '', merchantId: shop?.id || '' };
    setProducts(prev => [product, ...prev.filter(x => x.id !== product.id)]);
    try { await getDataBoundary(shop?.id).products.save(product); }
    catch (e) { console.error('[App] Failed to add product:', e); }
  }, [shop?.id]);

  const handleEditProduct = useCallback(async (p: Product) => {
    const product = { ...p, shopId: shop?.id || '', merchantId: shop?.id || '' };
    setProducts(prev => prev.map(x => x.id === product.id ? product : x));
    try { await getDataBoundary(shop?.id).products.update(product); }
    catch (e) { console.error('[App] Failed to update product:', e); }
  }, [shop?.id]);

  const handleDeleteProduct = useCallback(async (id: string) => {
    setProducts(prev => prev.filter(x => x.id !== id));
    try { await getDataBoundary(shop?.id).products.delete(id, shop?.id || ''); }
    catch (e) { console.error('[App] Failed to delete product:', e); }
  }, [shop?.id]);

  const handleAddExpense = useCallback(async (exp: Omit<Expense, 'id' | 'createdAt'>) => {
    if (!shop?.id) return;
    const newId = `exp-${Date.now()}`;
    const newExpense: Expense = { ...exp, id: newId, shopId: shop.id, merchantId: shop.id, createdAt: new Date().toISOString() };
    setExpenses(prev => [newExpense, ...prev]);
    try {
      await setDoc(doc(db, 'merchants', shop.id, 'expenses', newId), newExpense);
    } catch (err) { console.error('[App] Failed to record expense:', err); }
  }, [shop?.id]);

  const handleDeleteExpense = useCallback(async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (!shop?.id) return;
    try { await deleteDoc(doc(db, 'merchants', shop.id, 'expenses', id)); }
    catch (err) { console.error('[App] Failed to delete expense:', err); }
  }, [shop?.id]);

  const handleCompleteSale = useCallback(async (
    cartItems: { productId: string; quantity: number }[],
    saleDetails?: { paymentMethod?: 'cash' | 'card' | 'other'; receiptNo?: string }
  ) => {
    if (!shop) throw new Error('No active shop session');
    const receiptNo = saleDetails?.receiptNo || `RCP-${Date.now().toString(36).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const shopId = shop.id;

    try {
      await runTransaction(db, async (transaction) => {
        const snaps = await Promise.all(
          cartItems.map(item => transaction.get(doc(db, 'merchants', shopId, 'products', item.productId)))
        );
        for (let i = 0; i < cartItems.length; i++) {
          const snap = snaps[i];
          if (!snap.exists()) throw new Error(`Product not found`);
          const data = snap.data() as Product;
          if (data.stockQuantity < cartItems[i].quantity) throw new Error(`Insufficient stock for "${data.name}". Only ${data.stockQuantity} left.`);
        }
        let total = 0;
        const itemsDetail: Transaction['items'] = [];
        for (let i = 0; i < cartItems.length; i++) {
          const item = cartItems[i];
          const snap = snaps[i];
          const data = snap.data() as Product;
          const newStock = Math.max(0, data.stockQuantity - item.quantity);
          total += data.sellingPrice * item.quantity;
          transaction.update(snap.ref, { stockQuantity: newStock, availability: newStock === 0 ? 'out_of_stock' : 'in_stock' });
          itemsDetail.push({ productId: data.id, productName: data.name, quantity: item.quantity, price: data.sellingPrice, unit: data.unit });
          const actRef = doc(collection(db, 'merchants', shopId, 'inventory_activities'));
          transaction.set(actRef, { id: actRef.id, shopId, merchantId: shopId, productId: data.id, productName: data.name, action: 'Sale Recorded', quantity: item.quantity, details: `Sold ${item.quantity} ${data.unit}(s) [${receiptNo}]`, createdAt: nowIso });
        }
        const txRef = doc(collection(db, 'merchants', shopId, 'sales'));
        transaction.set(txRef, { id: txRef.id, shopId, merchantId: shopId, receiptNo, createdAt: nowIso, items: itemsDetail, totalAmount: Number(total.toFixed(2)), paymentMethod: saleDetails?.paymentMethod || 'cash' });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `merchants/${shopId}/sales`);
    }
  }, [shop]);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await logoutShop();
      setShop(null);
      setAppAuthState('UNAUTHENTICATED');
      setActiveView('landing');
    } catch (e) {
      console.error('[App] Sign-out error:', e);
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  const handleToggleShopStatus = useCallback(async () => {
    if (!shop) return;
    const next = shop.status === 'open' ? 'closed' : 'open';
    const updated = { ...shop, status: next };
    setShop(updated as ShopProfile);
    try { await setDoc(doc(db, 'merchants', shop.id), { status: next }, { merge: true }); } catch {}
  }, [shop]);

  const handleAdminUpdateMerchant = useCallback(async (merchantId: string, updates: Partial<ShopProfile>) => {
    try {
      await setDoc(doc(db, 'merchants', merchantId), { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('[Firestore] Admin update merchant error:', e);
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminRouteGuard><AdminDashboard merchants={allMerchants} onUpdateMerchant={handleAdminUpdateMerchant} /></AdminRouteGuard>} />
        <Route path="/admin/dashboard" element={<AdminRouteGuard><AdminDashboard merchants={allMerchants} onUpdateMerchant={handleAdminUpdateMerchant} /></AdminRouteGuard>} />
        <Route path="/admin/merchants" element={<AdminRouteGuard><MerchantManagement merchants={allMerchants} onUpdateMerchant={handleAdminUpdateMerchant} /></AdminRouteGuard>} />
        <Route path="/admin/subscriptions" element={<AdminRouteGuard><SubscriptionManagement merchants={allMerchants} onUpdateMerchant={handleAdminUpdateMerchant} /></AdminRouteGuard>} />
        <Route path="/*" element={
          <MerchantPortal
            appAuthState={appAuthState}
            isAuthLoading={isAuthLoading}
            shop={shop}
            products={products}
            transactions={transactions}
            activities={activities}
            expenses={expenses}
            activeView={activeView}
            setActiveView={setActiveView}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
            showSuccessOverlay={showSuccessOverlay}
            setShowSuccessOverlay={setShowSuccessOverlay}
            isSigningOut={isSigningOut}
            onLoginSuccess={handleLoginSuccess}
            onSaveShop={handleSaveShop}
            onUpdateShop={handleUpdateShop}
            onAddProduct={handleAddProduct}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
            onCompleteSale={handleCompleteSale}
            onSignOut={handleSignOut}
            onToggleShopStatus={handleToggleShopStatus}
          />
        } />
      </Routes>
    </BrowserRouter>
  );
}
