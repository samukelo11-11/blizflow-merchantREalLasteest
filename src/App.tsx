/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './services/firebaseConfig';
import { onAuthStateChanged, signOut, sendEmailVerification } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { logSecurityEvent } from './auth/authEvents';
import { getOrCreateCurrentSessionId } from './auth/sessionSecurity';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ShopProfile, Product, Transaction, InventoryActivity, Expense } from './types';
import LandingPage from './components/LandingPage';
import LoginForm from './components/LoginForm';
import PinStep from './components/PinStep';
import BusinessOnboarding from './components/BusinessOnboarding';
import {
  hasPinConfigured,
  isPinUnlockedInSession,
  markPinUnlockedInSession,
  clearPinSessionUnlock
} from './auth/pinSecurity';
import Dashboard from './components/Dashboard';
import ProductManagement from './components/ProductManagement';
import POS from './components/POS';
import SalesPage from './components/SalesPage';
import ExpensesPage from './components/ExpensesPage';
import SettingsPage from './components/SettingsPage';
import SubscriptionPage from './components/SubscriptionPage';
import TrialBanner from './components/TrialBanner';
import AdminPanel from './components/AdminPanel';
import AdminRouteGuard from './components/AdminRouteGuard';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import MerchantManagement from './pages/MerchantManagement';
import SubscriptionManagement from './pages/SubscriptionManagement';
import {
  Zap, LogOut, CheckCircle, ArrowRight, ShoppingCart, Menu, X,
  Home, Package, Receipt, TrendingDown, Settings, CreditCard,
  ShieldCheck, Mail, RefreshCw, Clock
} from 'lucide-react';
import { isDevModeActive } from './auth/devMode';

export { isDevModeActive };

// ── Constants ──
const TRIAL_DAYS = 5;
const WHATSAPP_PAY_LINK = 'https://wa.me/27721234567?text=Hi%20BlizFlow%2C%20I%20want%20to%20activate%20my%20shop%20subscription';

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT ID GENERATION
// FIX 12: Use a counter suffix instead of relying on Date.now() uniqueness
// within the same synchronous call.
// ─────────────────────────────────────────────────────────────────────────────
let _productIdCounter = 0;
function generateProductId(): string {
  return `p-${Date.now()}-${++_productIdCounter}`;
}

const DEV_PRODUCTS_STORAGE_KEY = (shopId: string) => `blizflow_dev_products_${shopId}`;

export const generateStarterProducts = (shopId: string): Product[] => {
  const now = new Date().toISOString();
  return [
    { id: generateProductId(), shopId, name: 'Fresh Red Apple', category: 'Fresh Produce (Fruit & Veg)', sellingPrice: 5, costPrice: 3, stockQuantity: 30, unit: 'Units', availability: 'in_stock', barcode: '6001000000034', lowStockLevel: 5, createdAt: now, imageUrl: '' },
    { id: generateProductId(), shopId, name: 'Coca-Cola 2L', category: 'Beverages & Liquor', sellingPrice: 26, costPrice: 20, stockQuantity: 24, unit: 'Bottle', availability: 'in_stock', barcode: '6001087300001', lowStockLevel: 5, createdAt: now, imageUrl: '' },
    { id: generateProductId(), shopId, name: 'White Bread 700g', category: 'Bakery & Confectionery', sellingPrice: 18.5, costPrice: 14, stockQuantity: 15, unit: 'Loaf', availability: 'in_stock', barcode: '6001000000012', lowStockLevel: 5, createdAt: now, imageUrl: '' },
    { id: generateProductId(), shopId, name: 'Full Cream Milk 2L', category: 'Grocery & Supermarket', sellingPrice: 32, costPrice: 26, stockQuantity: 12, unit: 'Bottle', availability: 'in_stock', barcode: '6001000000056', lowStockLevel: 4, createdAt: now, imageUrl: '' },
  ];
};

// ─────────────────────────────────────────────────────────────────────────────
// DATA BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductDataOperations {
  subscribe: (shopId: string, onData: (items: Product[]) => void, onError?: (err: unknown) => void) => () => void;
  save: (product: Product) => Promise<void>;
  update: (product: Product) => Promise<void>;
  delete: (id: string, shopId: string) => Promise<void>;
  saveStarters: (shopId: string, starters: Product[]) => Promise<void>;
}

export interface AppDataBoundary {
  isDev: boolean;
  products: ProductDataOperations;
}

const createDevDataBoundary = (activeShopId?: string): AppDataBoundary => ({
  isDev: true,
  products: {
    subscribe: (shopId, onData) => {
      const key = DEV_PRODUCTS_STORAGE_KEY(shopId);
      const readLocal = (): Product[] => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
        } catch (e) {
          console.warn('[DevBoundary] Failed to parse local products:', e);
        }
        const starters = generateStarterProducts(shopId);
        try { localStorage.setItem(key, JSON.stringify(starters)); } catch {}
        return starters;
      };
      onData(readLocal());
      const syncHandler = () => onData(readLocal());
      window.addEventListener('blizflow_dev_products_sync', syncHandler);
      window.addEventListener('storage', syncHandler);
      return () => {
        window.removeEventListener('blizflow_dev_products_sync', syncHandler);
        window.removeEventListener('storage', syncHandler);
      };
    },
    save: async (product) => {
      const sid = product.shopId || activeShopId || 'dev-shop';
      const key = DEV_PRODUCTS_STORAGE_KEY(sid);
      try {
        const raw = localStorage.getItem(key);
        const current: Product[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(key, JSON.stringify([product, ...current.filter(p => p.id !== product.id)]));
        window.dispatchEvent(new CustomEvent('blizflow_dev_products_sync'));
      } catch (e) { console.warn('[DevBoundary] Save product error:', e); }
    },
    update: async (product) => {
      const sid = product.shopId || activeShopId || 'dev-shop';
      const key = DEV_PRODUCTS_STORAGE_KEY(sid);
      try {
        const raw = localStorage.getItem(key);
        const current: Product[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(key, JSON.stringify(current.map(p => p.id === product.id ? product : p)));
        window.dispatchEvent(new CustomEvent('blizflow_dev_products_sync'));
      } catch (e) { console.warn('[DevBoundary] Update product error:', e); }
    },
    delete: async (id, shopId) => {
      const sid = shopId || activeShopId || 'dev-shop';
      const key = DEV_PRODUCTS_STORAGE_KEY(sid);
      try {
        const raw = localStorage.getItem(key);
        const current: Product[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(key, JSON.stringify(current.filter(p => p.id !== id)));
        window.dispatchEvent(new CustomEvent('blizflow_dev_products_sync'));
      } catch (e) { console.warn('[DevBoundary] Delete product error:', e); }
    },
    saveStarters: async (shopId, starters) => {
      const key = DEV_PRODUCTS_STORAGE_KEY(shopId);
      try {
        localStorage.setItem(key, JSON.stringify(starters));
        window.dispatchEvent(new CustomEvent('blizflow_dev_products_sync'));
      } catch (e) { console.warn('[DevBoundary] Save starters error:', e); }
    }
  }
});

// FIX 3 + 4 + 5 + 6: All Firestore paths updated to subcollection structure
// matching the schema and security rules fixes.
const prodDataBoundary: AppDataBoundary = {
  isDev: false,
  products: {
    subscribe: (shopId, onData, onError) => {
      if (!auth.currentUser) return () => {};
      // FIX 3: subcollection path
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
      // FIX 3: subcollection path
      await setDoc(doc(db, 'merchants', product.shopId, 'products', product.id), product);
    },
    update: async (product) => {
      await setDoc(doc(db, 'merchants', product.shopId, 'products', product.id), product, { merge: true });
    },
    delete: async (id, shopId) => {
      await deleteDoc(doc(db, 'merchants', shopId, 'products', id));
    },
    saveStarters: async (shopId, starters) => {
      // FIX 4: Log errors per product instead of swallowing them silently
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
  | 'PIN_SETUP_REQUIRED'
  | 'PIN_REQUIRED'
  | 'ONBOARDING_REQUIRED'
  | 'READY'
  | 'BLOCKED';

// ─────────────────────────────────────────────────────────────────────────────
// FIX 11: MerchantPortal extracted outside App so it is not redefined
// on every App render, preventing full unmount/remount of the portal tree.
// ─────────────────────────────────────────────────────────────────────────────
interface MerchantPortalProps {
  appAuthState: AppAuthState;
  isAuthLoading: boolean;
  shop: ShopProfile | null;
  user: { email: string; role: 'admin' | 'merchant'; merchantId: string | null } | null;
  products: Product[];
  transactions: Transaction[];
  activities: InventoryActivity[];
  expenses: Expense[];
  activeView: string;
  setActiveView: (v: any) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (v: boolean) => void;
  showSuccessOverlay: boolean;
  setShowSuccessOverlay: (v: boolean) => void;
  isSigningOut: boolean;
  isVerifying: boolean;
  isResending: boolean;
  resendCooldown: number;
  verificationError: string | null;
  verificationSuccess: string | null;
  allMerchants: ShopProfile[];
  loginEmailPrefill: string;
  authFormMode: 'new' | 'existing';
  setAuthFormMode: (m: 'new' | 'existing') => void;
  isShopTrialExpired: boolean;
  onPinSetupSuccess: () => void;
  onPinVerifySuccess: () => void;
  onOnboardingComplete: (p: ShopProfile) => void;
  onSaveShop: (p: ShopProfile, emailSent?: boolean, emailError?: string | null) => void;
  onUpdateShop: (p: ShopProfile) => void;
  onAddProduct: (p: Product) => void;
  onEditProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddExpense: (e: Omit<Expense, 'id' | 'createdAt'>) => void;
  onDeleteExpense: (id: string) => void;
  onCompleteSale: (cart: { productId: string; quantity: number }[], details?: any) => Promise<void>;
  onSignOut: () => void;
  onManualCheckVerification: () => void;
  onResendVerification: () => void;
  onToggleShopStatus: () => void;
}

const MerchantPortal: React.FC<MerchantPortalProps> = ({
  appAuthState, isAuthLoading, shop, user, products, transactions, activities, expenses,
  activeView, setActiveView, isMobileMenuOpen, setIsMobileMenuOpen, showSuccessOverlay,
  setShowSuccessOverlay, isSigningOut, isVerifying, isResending, resendCooldown,
  verificationError, verificationSuccess, allMerchants, loginEmailPrefill,
  authFormMode, setAuthFormMode,
  onPinSetupSuccess, onPinVerifySuccess, onOnboardingComplete, onSaveShop, onUpdateShop,
  onAddProduct, onEditProduct, onDeleteProduct, onAddExpense, onDeleteExpense,
  onCompleteSale, onSignOut, onManualCheckVerification, onResendVerification, onToggleShopStatus,
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

  if (appAuthState === 'PIN_SETUP_REQUIRED') {
    return (
      <PinStep
        uid={auth.currentUser?.uid || user?.merchantId || 'current_user'}
        userEmail={auth.currentUser?.email || user?.email || ''}
        mode="setup"
        onSuccess={onPinSetupSuccess}
        onSignOut={onSignOut}
      />
    );
  }

  if (appAuthState === 'PIN_REQUIRED') {
    return (
      <PinStep
        uid={auth.currentUser?.uid || user?.merchantId || 'current_user'}
        userEmail={auth.currentUser?.email || user?.email || ''}
        mode="verify"
        onSuccess={onPinVerifySuccess}
        onSignOut={onSignOut}
      />
    );
  }

  if (appAuthState === 'ONBOARDING_REQUIRED') {
    return (
      <BusinessOnboarding
        user={{
          uid: auth.currentUser?.uid || user?.merchantId || 'current_user',
          email: auth.currentUser?.email || user?.email || '',
          displayName: auth.currentUser?.displayName || undefined
        }}
        onComplete={onOnboardingComplete}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {shop && (
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div onClick={() => { setActiveView('dashboard'); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 cursor-pointer">
                <div className="bg-indigo-600 text-white p-1.5 rounded-xl">
                  <Zap className="w-4 h-4 fill-white" />
                </div>
                <span className="font-extrabold text-base text-slate-900">Bliz<span className="text-indigo-600">Flow</span></span>
              </div>
              <div className="h-4 w-px bg-slate-200 hidden sm:block" />
              <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg">
                <span className={`w-2 h-2 rounded-full ${shop.status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-[10px] font-black text-slate-700 uppercase truncate max-w-[130px] sm:max-w-[180px]">{shop.name}</span>
              </div>
            </div>

            <nav className="hidden lg:flex items-center gap-1">
              {[
                { view: 'dashboard', label: 'Dashboard', icon: Home },
                { view: 'pos', label: 'Point of Sale', icon: ShoppingCart },
                { view: 'products', label: 'Products', icon: Package },
                { view: 'sales', label: 'Sales', icon: Receipt },
                { view: 'expenses', label: 'Expenses', icon: TrendingDown },
                { view: 'subscription', label: 'Subscription', icon: CreditCard },
                { view: 'settings', label: 'Settings', icon: Settings },
              ].map(({ view, label, icon: Icon }) => (
                <button key={view} onClick={() => setActiveView(view)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${activeView === view ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <Icon className="w-3.5 h-3.5" /><span>{label}</span>
                </button>
              ))}
              {user?.role === 'admin' && (
                <Link to="/admin/dashboard" className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs ml-1">
                  <ShieldCheck className="w-3.5 h-3.5" /><span>Admin Panel</span>
                </Link>
              )}
              <button onClick={onSignOut} disabled={isSigningOut}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 transition flex items-center gap-1.5 cursor-pointer ml-1">
                <LogOut className="w-3.5 h-3.5" /><span>Sign Out</span>
              </button>
            </nav>

            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {isMobileMenuOpen && (
            <div className="lg:hidden border-t border-slate-100 bg-white px-4 py-3 shadow-lg space-y-1">
              {[
                { view: 'dashboard', label: 'Dashboard', icon: Home },
                { view: 'pos', label: 'Point of Sale', icon: ShoppingCart },
                { view: 'products', label: 'Products', icon: Package },
                { view: 'sales', label: 'Sales', icon: Receipt },
                { view: 'expenses', label: 'Expenses', icon: TrendingDown },
                { view: 'subscription', label: 'Subscription', icon: CreditCard },
                { view: 'settings', label: 'Settings', icon: Settings },
              ].map(({ view, label, icon: Icon }) => (
                <button key={view} onClick={() => { setActiveView(view); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold ${activeView === view ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <Icon className="w-4 h-4" /><span>{label}</span>
                </button>
              ))}
              {user?.role === 'admin' && (
                <Link to="/admin/dashboard" onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800">
                  <ShieldCheck className="w-4 h-4" /><span>Admin Panel</span>
                </Link>
              )}
              <div className="pt-2 border-t border-slate-100">
                <button onClick={() => { setIsMobileMenuOpen(false); onSignOut(); }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 cursor-pointer">
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </header>
      )}

      {shop && activeView !== 'subscription' && activeView !== 'landing' && activeView !== 'login' && (
        <TrialBanner shop={shop} onUpdateShop={onUpdateShop} onNavigateToSubscribe={() => setActiveView('subscription')} />
      )}

      <div className="flex-1 flex flex-col">
        {shop && shop.isEmailVerified === false && activeView !== 'landing' && activeView !== 'login' ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 min-h-[70vh]">
            <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 text-center shadow-md space-y-6">
              <div className="bg-indigo-50 text-indigo-600 w-16 h-16 rounded-full mx-auto flex items-center justify-center border border-indigo-100">
                <Mail className="w-8 h-8 stroke-[2.25]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-950 tracking-tight">Verify your Email Address</h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  Please verify <strong className="text-slate-800 font-extrabold">{shop.email}</strong> to unlock all features.
                </p>
              </div>
              {verificationError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl font-medium text-left">⚠️ {verificationError}</div>}
              {verificationSuccess && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3.5 rounded-xl font-medium text-left">✅ {verificationSuccess}</div>}
              <div className="space-y-2">
                <button onClick={onManualCheckVerification} disabled={isVerifying}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2">
                  {isVerifying ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Checking...</> : <><RefreshCw className="w-3.5 h-3.5" />I have verified my email</>}
                </button>
                <button onClick={onResendVerification} disabled={isResending || resendCooldown > 0}
                  className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-black rounded-xl transition flex items-center justify-center gap-2">
                  {isResending ? <><div className="w-3.5 h-3.5 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" />Sending...</>
                    : resendCooldown > 0 ? <><Clock className="w-3.5 h-3.5" />Resend in {resendCooldown}s</>
                    : <><Mail className="w-3.5 h-3.5" />Resend Verification Email</>}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (shop) {
                      const updated = { ...shop, isEmailVerified: true };
                      onUpdateShop(updated);
                    }
                  }}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  Explore Store during 5-day trial →
                </button>
              </div>
              <p className="text-[11px] text-slate-400">Didn't receive it? Check your spam folder or explore during your trial.</p>
            </div>
          </div>
        ) : (
          <>
            {activeView === 'landing' && (
              <LandingPage 
                onStartRegistration={() => { 
                  setAuthFormMode('new'); 
                  setActiveView('login'); 
                }} 
                onStartLogin={() => { 
                  setAuthFormMode('existing'); 
                  setActiveView('login'); 
                }} 
              />
            )}
            {activeView === 'login' && (
              <LoginForm 
                initialEmail={loginEmailPrefill} 
                initialMode={authFormMode}
                onLoginSuccess={(p) => onSaveShop(p)} 
                onCancel={() => setActiveView('landing')} 
                onNavigateToRegister={() => {
                  setAuthFormMode('new');
                  setActiveView('login');
                }} 
              />
            )}
            {activeView === 'dashboard' && shop && <Dashboard shop={shop} products={products} transactions={transactions} expenses={expenses} activities={activities} onToggleStatus={onToggleShopStatus} onNavigate={(view) => { if (view === 'profile' || view === 'settings') setActiveView('settings'); else if (view === 'add_product' || view === 'products') setActiveView('products'); else if (view === 'pos') setActiveView('pos'); else if (view === 'sales') setActiveView('sales'); else if (view === 'expenses') setActiveView('expenses'); else setActiveView('dashboard'); }} onEditProfile={() => setActiveView('settings')} />}
            {activeView === 'products' && shop && <ProductManagement shop={shop} products={products} onAddProduct={onAddProduct} onEditProduct={onEditProduct} onDeleteProduct={onDeleteProduct} onBackToDashboard={() => setActiveView('dashboard')} />}
            {activeView === 'pos' && shop && <POS products={products} onCompleteSale={onCompleteSale} onBackToDashboard={() => setActiveView('dashboard')} />}
            {activeView === 'sales' && shop && <SalesPage transactions={transactions} onBackToDashboard={() => setActiveView('dashboard')} />}
            {activeView === 'expenses' && shop && <ExpensesPage expenses={expenses} onAddExpense={onAddExpense} onDeleteExpense={onDeleteExpense} onBackToDashboard={() => setActiveView('dashboard')} />}
            {activeView === 'settings' && shop && <SettingsPage shop={shop} onUpdateShop={onUpdateShop} onBackToDashboard={() => setActiveView('dashboard')} onLogout={onSignOut} />}
            {activeView === 'subscription' && shop && <SubscriptionPage shop={shop} onUpdateShop={onUpdateShop} onBack={() => setActiveView('dashboard')} />}
            {activeView === 'admin' && <AdminPanel merchants={allMerchants} onUpdateMerchant={onUpdateShop} onClose={() => setActiveView('dashboard')} />}
          </>
        )}
      </div>

      {showSuccessOverlay && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-sm w-full text-center shadow-2xl space-y-5">
            <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-full mx-auto flex items-center justify-center"><CheckCircle className="w-8 h-8" /></div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Shop Created!</h2>
              <p className="text-xs text-slate-500 mt-1">Welcome, <strong>{shop?.name}</strong>! You have a <strong className="text-indigo-700">{TRIAL_DAYS}-day free trial</strong>.</p>
            </div>
            <button onClick={() => { setShowSuccessOverlay(false); setActiveView('dashboard'); }}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2">
              Go to Dashboard <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="fixed bottom-3 right-3 z-50 pointer-events-none select-none">
        <div className="bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-mono px-2.5 py-1 rounded-full border border-slate-700/60 shadow-lg flex items-center gap-1.5 opacity-75">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{import.meta.env.DEV ? 'DEV / PREVIEW' : 'PRODUCTION'}</span>
        </div>
      </div>

      {!shop && activeView === 'landing' && (
        <footer className="bg-white border-t border-slate-200 py-6 mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-400">
            <span>BlizFlow © {new Date().getFullYear()} — Point of Sale for Spaza & Retail Shops</span>
            <div className="flex items-center gap-4">
              <Link to="/admin/login" className="hover:text-indigo-600 transition">Administrator Portal</Link>
              <span>•</span>
              <a href={WHATSAPP_PAY_LINK} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition">Support</a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeView, setActiveView] = useState<string>('landing');
  const [appAuthState, setAppAuthState] = useState<AppAuthState>('AUTH_LOADING');
  const [authFormMode, setAuthFormMode] = useState<'new' | 'existing'>('existing');
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
  const [loginEmailPrefill] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; role: 'admin' | 'merchant'; merchantId: string | null } | null>(null);

  // FIX 1: Removed useEffects that persisted user/shop to localStorage on
  // every state change. Storage writes now happen only at deliberate points
  // (sign-in success, sign-out) not reactively on every render.

  // ── Auth State Listener ──
  useEffect(() => {
    // FIX 9: isCancelled flag prevents stale async continuations from a
    // previous onAuthStateChanged invocation updating state after a new
    // one has fired.
    let isCancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (isCancelled) return;

      try {
        if (firebaseUser) {
          const userDocSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (isCancelled) return;

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const merchantId = userData.merchantId;
            const role = userData.role || 'merchant';

            if (role === 'admin') {
              setUser({ email: firebaseUser.email || '', role: 'admin', merchantId: null });
              setAppAuthState('READY');
              setActiveView('admin');
              setIsAuthLoading(false);
              return;
            }

            const pinConfigured = hasPinConfigured(firebaseUser.uid);
            if (!pinConfigured) {
              setAppAuthState('PIN_SETUP_REQUIRED');
              setIsAuthLoading(false);
              return;
            }

            const pinUnlocked = isPinUnlockedInSession(firebaseUser.uid);
            if (!pinUnlocked) {
              setAppAuthState('PIN_REQUIRED');
              setIsAuthLoading(false);
              return;
            }

            if (!merchantId) {
              setAppAuthState('ONBOARDING_REQUIRED');
              setIsAuthLoading(false);
              return;
            }

            const merchantDocSnap = await getDoc(doc(db, 'merchants', merchantId));
            if (isCancelled) return;

            if (merchantDocSnap.exists()) {
              const merchantData = merchantDocSnap.data() as ShopProfile;
              if (merchantData.onboardingStatus === 'required' || merchantData.onboardingStatus === 'in_progress') {
                setAppAuthState('ONBOARDING_REQUIRED');
                setIsAuthLoading(false);
                return;
              }
              const isEmailVerified = firebaseUser.emailVerified || merchantData.isEmailVerified;
              const updatedShop = { ...merchantData, isEmailVerified };
              setShop(updatedShop);
              setUser({ email: firebaseUser.email || merchantData.email || '', role: 'merchant', merchantId });
              setAppAuthState('READY');
              setActiveView('dashboard');
            } else {
              setAppAuthState('ONBOARDING_REQUIRED');
            }
          } else {
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                email: firebaseUser.email || '',
                role: 'merchant',
                merchantId: null,
                onboardingStatus: 'required',
                createdAt: new Date().toISOString(),
                authProvider: firebaseUser.providerData?.[0]?.providerId || 'google'
              }, { merge: true });
            } catch (createErr) {
              console.warn('[App] First-time user record creation warning:', createErr);
            }
            setAppAuthState(hasPinConfigured(firebaseUser.uid) ? 'ONBOARDING_REQUIRED' : 'PIN_SETUP_REQUIRED');
          }
        } else {
          // Dev or Demo mode session restore
          const isDemo = localStorage.getItem('blizflow_demo_active') === 'true';
          if (isDevModeActive() || isDemo) {
            const savedShop = localStorage.getItem(isDemo ? 'blizflow_demo_shop' : 'blizflow_shop');
            const savedUser = localStorage.getItem(isDemo ? 'blizflow_user' : 'blizflow_user');
            if (savedShop) {
              try {
                const parsedShop = JSON.parse(savedShop);
                setShop(parsedShop);
                if (savedUser) setUser(JSON.parse(savedUser));
                setAppAuthState('READY');
                setActiveView('dashboard');
                setIsAuthLoading(false);
                return;
              } catch (e) {
                console.warn('[App] Session restore:', e);
              }
            }
          }
          setShop(null);
          setUser(null);
          // Only clear storage on actual sign-out or when neither dev nor demo is active
          if (!isDevModeActive() && !isDemo) {
            localStorage.removeItem('blizflow_user');
            localStorage.removeItem('blizflow_shop');
          }
          setAppAuthState('UNAUTHENTICATED');
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[App] Auth error:', err);
          setAppAuthState('UNAUTHENTICATED');
        }
      } finally {
        if (!isCancelled) setIsAuthLoading(false);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, []);

  const handlePinSetupSuccess = useCallback(async () => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) { setAppAuthState(isDevModeActive() ? 'READY' : 'UNAUTHENTICATED'); if (isDevModeActive()) setActiveView('dashboard'); return; }
    markPinUnlockedInSession(currentUid);
    try {
      const userDocSnap = await getDoc(doc(db, 'users', currentUid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        if (userData.merchantId) {
          const merchantDocSnap = await getDoc(doc(db, 'merchants', userData.merchantId));
          if (merchantDocSnap.exists()) {
            const merchantData = merchantDocSnap.data() as ShopProfile;
            if (merchantData.onboardingStatus !== 'required' && merchantData.onboardingStatus !== 'in_progress') {
              setShop(merchantData);
              setUser({ email: auth.currentUser?.email || merchantData.email || '', role: 'merchant', merchantId: userData.merchantId });
              setAppAuthState('READY');
              setActiveView('dashboard');
              return;
            }
          }
        }
      }
    } catch (e) { console.warn('[App] Error resolving merchant after PIN setup:', e); }
    setAppAuthState('ONBOARDING_REQUIRED');
  }, []);

  const handlePinVerifySuccess = useCallback(async () => {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) { setAppAuthState(isDevModeActive() ? 'READY' : 'UNAUTHENTICATED'); if (isDevModeActive()) setActiveView('dashboard'); return; }
    markPinUnlockedInSession(currentUid);
    if (shop && shop.onboardingStatus !== 'required' && shop.onboardingStatus !== 'in_progress') {
      setAppAuthState('READY'); setActiveView('dashboard'); return;
    }
    try {
      const userDocSnap = await getDoc(doc(db, 'users', currentUid));
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        if (userData.merchantId) {
          const merchantDocSnap = await getDoc(doc(db, 'merchants', userData.merchantId));
          if (merchantDocSnap.exists()) {
            const merchantData = merchantDocSnap.data() as ShopProfile;
            setShop(merchantData);
            setUser({ email: auth.currentUser?.email || merchantData.email || '', role: 'merchant', merchantId: userData.merchantId });
            setAppAuthState('READY'); setActiveView('dashboard'); return;
          }
        }
      }
    } catch (e) { console.warn('[App] Error loading profile after PIN verify:', e); }
    setAppAuthState('ONBOARDING_REQUIRED');
  }, [shop]);

  const handleOnboardingComplete = useCallback((newProfile: ShopProfile) => {
    setShop(newProfile);
    setUser({ email: auth.currentUser?.email || newProfile.email || '', role: 'merchant', merchantId: newProfile.id });
    setAppAuthState('READY');
    setActiveView('dashboard');
  }, []);

  // ── Product Sync ──
  useEffect(() => {
    if (!shop?.id) return;
    const boundary = getDataBoundary(shop.id);
    return boundary.products.subscribe(shop.id, setProducts, (err) => console.warn('[App] Products sync error:', err));
  }, [shop?.id]);

  // FIX 5: Subcollection paths for transactions, activities, expenses
  useEffect(() => {
    if (!shop?.id || !auth.currentUser || isDevModeActive()) return;
    const shopId = shop.id;

    const unsubTx = onSnapshot(
      // FIX 5: subcollection path
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

  // FIX 7: Only run merchants listener when user is confirmed admin
  useEffect(() => {
    if (isDevModeActive() || !auth.currentUser || user?.role !== 'admin') return;
    return onSnapshot(
      collection(db, 'merchants'),
      (snap) => {
        const items: ShopProfile[] = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id } as ShopProfile));
        setAllMerchants(items);
      },
      (err) => console.warn('[App] Merchants sync:', err)
    );
  }, [user?.role]);

  const handleSaveShop = useCallback(async (profile: ShopProfile, emailSentSuccess?: boolean, emailError?: string | null) => {
    const isFirstTime = !shop;
    const trialEnds = profile.trialEndsAt || new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const isEmailVerified = auth.currentUser?.emailVerified ?? (profile.isEmailVerified ?? false);
    const updated: ShopProfile = { ...profile, trialEndsAt: trialEnds, subscriptionStatus: profile.subscriptionStatus || 'trial', plan: profile.plan || 'starter', isEmailVerified };
    if (emailSentSuccess === true) { setVerificationSuccess(`Verification email sent to ${profile.email}. Check your inbox.`); setVerificationError(null); }
    else if (emailSentSuccess === false && emailError) { setVerificationError(`Account created but verification email failed: ${emailError}`); setVerificationSuccess(null); }
    setShop(updated);
    if (auth.currentUser) {
      try { await setDoc(doc(db, 'merchants', updated.id), updated, { merge: true }); }
      catch (e) { console.error('[App] Shop save failed:', e); }
    }
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
      // FIX 5: subcollection path
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
    // FIX 2: Use the shared isDevModeActive() from devMode.ts, not an inline duplicate
    if (!auth.currentUser && !isDevModeActive()) throw new Error('Session expired. Please sign in again.');
    if (!shop) throw new Error('No shop profile active');
    const receiptNo = saleDetails?.receiptNo || `RCP-${Date.now().toString(36).toUpperCase()}`;
    const nowIso = new Date().toISOString();
    const shopId = shop.id;

    try {
      await runTransaction(db, async (transaction) => {
        // FIX 6: Read products from subcollection path
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
          // FIX 6: Write to subcollection paths
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

  const handleManualCheckVerification = useCallback(async () => {
    setIsVerifying(true);
    setVerificationError(null);
    setVerificationSuccess(null);
    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          if (shop) {
            const updated = { ...shop, isEmailVerified: true };
            setShop(updated);
            try { await setDoc(doc(db, 'merchants', shop.id), { isEmailVerified: true }, { merge: true }); }
            catch (err) { console.warn('[App] Merchant verification update:', err); }
          }
          setVerificationSuccess('Email successfully verified! Welcome to BlizFlow.');
        } else {
          setVerificationError('Not verified yet. Please click the link in your email first, then check again.');
        }
      } else {
        setVerificationError('No active session. Please sign in again.');
      }
    } catch (e: any) {
      setVerificationError(e?.message || 'Failed to check verification status.');
    } finally {
      setIsVerifying(false);
    }
  }, [shop]);

  useEffect(() => {
    const handleFocus = async () => {
      if (auth.currentUser && shop && !shop.isEmailVerified) {
        try {
          await auth.currentUser.reload();
          if (auth.currentUser.emailVerified) {
            const updated = { ...shop, isEmailVerified: true };
            setShop(updated);
            try { await setDoc(doc(db, 'merchants', shop.id), { isEmailVerified: true }, { merge: true }); } catch {}
            setVerificationSuccess('Email verified! Unlocking your dashboard.');
          }
        } catch {}
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [shop]);

  const handleResendVerification = useCallback(async () => {
    if (!auth.currentUser) { setVerificationError('No active session. Please sign in again.'); return; }
    setIsResending(true);
    setVerificationError(null);
    setVerificationSuccess(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSuccess(`Verification email sent to ${auth.currentUser.email || shop?.email}. Check your inbox and spam.`);
      setResendCooldown(60);
      const timer = setInterval(() => setResendCooldown(prev => { if (prev <= 1) { clearInterval(timer); return 0; } return prev - 1; }), 1000);
    } catch (e: any) {
      const code = e?.code || '';
      if (code === 'auth/too-many-requests') setVerificationError('Too many requests. Please wait a few minutes.');
      else if (code === 'auth/quota-exceeded') setVerificationError('Daily email quota exceeded. Please try again later.');
      else if (code === 'auth/network-request-failed') setVerificationError('Network error. Unable to reach Firebase.');
      else if (code === 'auth/user-token-expired') setVerificationError('Session expired. Please sign out and sign in again.');
      else setVerificationError(e?.message || 'Failed to resend verification email.');
    } finally {
      setIsResending(false);
    }
  }, [shop?.email]);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      const currentUid = auth.currentUser?.uid;
      if (currentUid) clearPinSessionUnlock(currentUid);
      const email = auth.currentUser?.email || shop?.email;
      if (email) logSecurityEvent('LOGOUT', { email, sessionId: getOrCreateCurrentSessionId(), reason: 'User triggered sign out' });
      await signOut(auth);
      // FIX 10: Clear state only after signOut succeeds
      setShop(null);
      setUser(null);
      localStorage.removeItem('blizflow_user');
      localStorage.removeItem('blizflow_shop');
      localStorage.removeItem('blizflow_demo_active');
      localStorage.removeItem('blizflow_demo_shop');
      sessionStorage.removeItem('blizflow_admin_auth');
      setAppAuthState('UNAUTHENTICATED');
      setActiveView('landing');
    } catch (e) {
      console.error('[App] Sign-out error:', e);
      // FIX 10: isSigningOut reset even on failure so button is not stuck
    } finally {
      setIsSigningOut(false);
    }
  }, [shop?.email]);

  const handleToggleShopStatus = useCallback(async () => {
    if (!shop) return;
    const next = shop.status === 'open' ? 'closed' : 'open';
    const updated = { ...shop, status: next };
    setShop(updated as ShopProfile);
    try { await setDoc(doc(db, 'merchants', shop.id), { status: next }, { merge: true }); } catch {}
  }, [shop]);

  const isShopTrialExpired = React.useMemo(() => {
    if (!shop || shop.subscriptionStatus === 'active') return false;
    if (shop.subscriptionStatus === 'expired') return true;
    if (shop.subscriptionStatus === 'payment_pending') return false;
    const ends = shop.trialEndsAt ? new Date(shop.trialEndsAt) : new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    return new Date() > ends;
  }, [shop]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminRouteGuard><AdminDashboard merchants={allMerchants} onUpdateMerchant={handleUpdateShop} /></AdminRouteGuard>} />
        <Route path="/admin/dashboard" element={<AdminRouteGuard><AdminDashboard merchants={allMerchants} onUpdateMerchant={handleUpdateShop} /></AdminRouteGuard>} />
        <Route path="/admin/merchants" element={<AdminRouteGuard><MerchantManagement merchants={allMerchants} onUpdateMerchant={handleUpdateShop} /></AdminRouteGuard>} />
        <Route path="/admin/subscriptions" element={<AdminRouteGuard><SubscriptionManagement merchants={allMerchants} onUpdateMerchant={handleUpdateShop} /></AdminRouteGuard>} />
        <Route path="/*" element={
          // FIX 11: MerchantPortal is now a stable component defined outside App
          <MerchantPortal
            appAuthState={appAuthState}
            isAuthLoading={isAuthLoading}
            shop={shop}
            user={user}
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
            isVerifying={isVerifying}
            isResending={isResending}
            resendCooldown={resendCooldown}
            verificationError={verificationError}
            verificationSuccess={verificationSuccess}
            allMerchants={allMerchants}
            loginEmailPrefill={loginEmailPrefill}
            authFormMode={authFormMode}
            setAuthFormMode={setAuthFormMode}
            isShopTrialExpired={isShopTrialExpired}
            onPinSetupSuccess={handlePinSetupSuccess}
            onPinVerifySuccess={handlePinVerifySuccess}
            onOnboardingComplete={handleOnboardingComplete}
            onSaveShop={handleSaveShop}
            onUpdateShop={handleUpdateShop}
            onAddProduct={handleAddProduct}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
            onAddExpense={handleAddExpense}
            onDeleteExpense={handleDeleteExpense}
            onCompleteSale={handleCompleteSale}
            onSignOut={handleSignOut}
            onManualCheckVerification={handleManualCheckVerification}
            onResendVerification={handleResendVerification}
            onToggleShopStatus={handleToggleShopStatus}
          />
        } />
      </Routes>
    </BrowserRouter>
  );
}