/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loginAdmin, logoutAdmin, onAdminAuthChanged, getSynchronousAdminUser } from '../services/adminAuth';
import {
  createShop,
  updateShopStatus,
  resetShopPin,
  normalizeShopRecord,
  ShopRecord,
} from '../auth/shopAuth';
import { adminDeleteShop, adminUpdateShopDetails, adminFetchAllShops } from '../services/shopAuth';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import {
  ShieldCheck, Users, CheckCircle, XCircle, Clock, Search,
  Lock, KeyRound, Edit3, PlusCircle, Smartphone, ArrowLeft,
  Loader2, AlertCircle, RefreshCw, Trash2, CreditCard, Copy,
  Check, X, ChevronRight, TrendingUp, DollarSign, Calendar,
  Store, Filter, ExternalLink
} from 'lucide-react';
import { ShopProfile } from '../types';

export interface AdminPanelProps {
  merchants?: (ShopRecord | ShopProfile)[];
  onUpdateMerchant?: (merchantId: string, updates: Partial<ShopRecord | ShopProfile>) => void | Promise<void>;
  defaultTab?: 'all' | 'active' | 'pending' | 'suspended';
  defaultSection?: 'overview' | 'merchants' | 'billing';
  onClose?: () => void;
}

export default function AdminPanel({
  merchants: propsMerchants,
  onUpdateMerchant,
  defaultTab = 'all',
  defaultSection,
  onClose
}: AdminPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Authentication state - initialized synchronously from session
  const syncAdmin = getSynchronousAdminUser();
  const [isAuthenticated, setIsAuthenticated] = useState(!!syncAdmin);

  // Merchant state (live synced from Firestore 'merchants' collection)
  const [firestoreShops, setFirestoreShops]   = useState<ShopRecord[]>([]);
  const [searchQuery, setSearchQuery]         = useState('');
  const [statusFilter, setStatusFilter]       = useState<'all' | 'active' | 'pending' | 'suspended'>(defaultTab);
  const [isRefreshing, setIsRefreshing]       = useState(false);
  const [refreshNotice, setRefreshNotice]     = useState<string | null>(null);
  const [copiedId, setCopiedId]               = useState<string | null>(null);

  // Section sync based on URL path or prop
  const currentSection = useMemo((): 'overview' | 'merchants' | 'billing' => {
    if (location.pathname.includes('/merchants')) return 'merchants';
    if (location.pathname.includes('/subscriptions')) return 'billing';
    if (defaultSection) return defaultSection;
    return 'overview';
  }, [location.pathname, defaultSection]);

  // Modals
  const [showCreateModal, setShowCreateModal]     = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState<ShopRecord | null>(null);
  const [showEditModal, setShowEditModal]         = useState<ShopRecord | null>(null);
  const [showPlanModal, setShowPlanModal]         = useState<ShopRecord | null>(null);

  // Create form
  const [newShopId, setNewShopId]     = useState('');
  const [newName, setNewName]         = useState('');
  const [newOwner, setNewOwner]       = useState('');
  const [newPhone, setNewPhone]       = useState('');
  const [newEmail, setNewEmail]       = useState('');
  const [newCategory, setNewCategory] = useState('Grocery & Spaza Shop');
  const [newAddress, setNewAddress]   = useState('');
  const [newPin, setNewPin]           = useState('');
  const [newStatus, setNewStatus]     = useState<'active' | 'pending'>('active');
  const [newPlan, setNewPlan]         = useState<'starter' | 'growth' | 'pro'>('starter');
  const [formError, setFormError]     = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Reset PIN form
  const [resetPinValue, setResetPinValue] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinLoading, setPinLoading]       = useState(false);

  // Edit form
  const [editName, setEditName]         = useState('');
  const [editOwner, setEditOwner]       = useState('');
  const [editPhone, setEditPhone]       = useState('');
  const [editEmail, setEditEmail]       = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAddress, setEditAddress]   = useState('');
  const [editPlan, setEditPlan]         = useState<'starter' | 'growth' | 'pro'>('starter');
  const [editLoading, setEditLoading]   = useState(false);

  // Plan update form
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'growth' | 'pro'>('starter');
  const [planLoading, setPlanLoading]   = useState(false);

  // 1. Subscribe to admin auth state
  useEffect(() => {
    const unsub = onAdminAuthChanged(user => {
      if (!user) {
        setIsAuthenticated(false);
        navigate('/admin/login', { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    });
    return unsub;
  }, [navigate]);

  // 2. Real-time Firestore sync directly from 'merchants' collection
  // (Only attach if propsMerchants is not provided, to avoid duplicate competing listeners)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (propsMerchants && propsMerchants.length > 0) return;

    let unsub = () => {};

    try {
      unsub = onSnapshot(
        collection(db, 'merchants'),
        snapshot => {
          const list: ShopRecord[] = [];
          snapshot.forEach(d => {
            const raw = d.data();
            list.push(normalizeShopRecord({ ...raw, id: d.id, shopId: raw.shopId || d.id }));
          });
          list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          setFirestoreShops(list);
        },
        err => {
          console.warn('[AdminPanel] Merchants snapshot listener note:', err.message);
        }
      );
    } catch (e) {
      console.warn('[AdminPanel] Failed to attach merchants listener:', e);
    }

    return () => unsub();
  }, [isAuthenticated, propsMerchants]);

  // Combine propsMerchants and firestoreShops with stable reference
  const shops: ShopRecord[] = useMemo(() => {
    if (propsMerchants && propsMerchants.length > 0) {
      return propsMerchants.map(normalizeShopRecord);
    }
    if (firestoreShops.length > 0) return firestoreShops;
    return [];
  }, [propsMerchants, firestoreShops]);

  // Actual manual refresh action
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      const snap = await getDocs(collection(db, 'merchants'));
      const list: ShopRecord[] = [];
      snap.forEach(d => {
        const raw = d.data();
        list.push(normalizeShopRecord({ ...raw, id: d.id, shopId: raw.shopId || d.id }));
      });
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      if (list.length > 0) {
        setFirestoreShops(list);
      }
      // Also try backend sync if available
      try {
        const backendShops = await adminFetchAllShops();
        if (backendShops && backendShops.length > 0) {
          const merged = [...list];
          backendShops.forEach(bs => {
            const idx = merged.findIndex(m => m.shopId === (bs.shopId || bs.id));
            const norm = normalizeShopRecord(bs);
            if (idx >= 0) merged[idx] = norm;
            else merged.push(norm);
          });
          setFirestoreShops(merged);
        }
      } catch {}
      setRefreshNotice('Data updated successfully');
      setTimeout(() => setRefreshNotice(null), 3000);
    } catch (err: any) {
      console.warn('[AdminPanel] Refresh failed:', err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignOut = async () => {
    await logoutAdmin().catch(() => {});
    navigate('/admin/login');
  };

  const handleCopy = (shop: ShopRecord) => {
    const text = `BlizFlow Shop Access\nShop ID: ${shop.shopId}\nShop Name: ${shop.name}\nStatus: ${shop.status.toUpperCase()}`;
    navigator.clipboard.writeText(text);
    setCopiedId(shop.shopId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // CREATE SHOP MUTATION
  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const cleanId = newShopId.replace(/[^A-Za-z0-9_-]/g, '').trim().toUpperCase();
    if (!cleanId)         { setFormError('Shop ID is required.'); return; }
    if (!newName.trim())  { setFormError('Shop Name is required.'); return; }
    if (!/^\d{4,16}$/.test(newPin.trim())) { setFormError('PIN must be 4–16 digits.'); return; }

    setFormLoading(true);
    const result = await createShop({
      shopId:      cleanId,
      name:        newName.trim(),
      ownerName:   newOwner.trim() || 'Owner',
      phoneNumber: newPhone.trim(),
      email:       newEmail.trim(),
      category:    newCategory,
      address:     newAddress.trim(),
      pin:         newPin.trim(),
      plan:        newPlan,
      status:      newStatus
    });
    setFormLoading(false);

    if (!result.success) {
      setFormError(result.error || 'Failed to create shop.');
      return;
    }

    if (newStatus === 'active') {
      await updateShopStatus(cleanId, 'active');
    }

    // Notify parent if provided
    if (result.shop && onUpdateMerchant) {
      onUpdateMerchant(cleanId, result.shop);
    }

    setFormSuccess(`Shop ${cleanId} created successfully!`);
    setNewShopId(''); setNewName(''); setNewOwner(''); setNewPhone('');
    setNewEmail(''); setNewAddress(''); setNewPin(''); setNewPlan('starter');
    setTimeout(() => { setShowCreateModal(false); setFormSuccess(null); }, 1400);
  };

  // STATUS CHANGE MUTATION
  const handleStatusChange = async (shopId: string, status: 'active' | 'pending' | 'suspended') => {
    try {
      const cleanId = shopId.trim().toUpperCase();
      // Optimistic update
      setFirestoreShops(prev => prev.map(s => s.shopId === cleanId ? { ...s, status } : s));
      const res = await updateShopStatus(cleanId, status);
      if (res.success && onUpdateMerchant) {
        onUpdateMerchant(cleanId, { status });
      }
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  // RESET PIN MUTATION
  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetPinModal) return;
    setPinModalError(null);
    if (!/^\d{4,16}$/.test(resetPinValue.trim())) {
      setPinModalError('PIN must be 4–16 digits.');
      return;
    }
    setPinLoading(true);
    const result = await resetShopPin(showResetPinModal.shopId, resetPinValue.trim());
    setPinLoading(false);
    if (!result.success) {
      setPinModalError(result.error || 'Failed to reset PIN.');
      return;
    }
    setShowResetPinModal(null);
    setResetPinValue('');
  };

  // EDIT SHOP MUTATION (Writes directly to 'merchants' collection)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setEditLoading(true);
    const cleanId = showEditModal.shopId;
    const payload = {
      name:        editName.trim()     || showEditModal.name,
      ownerName:   editOwner.trim()    || showEditModal.ownerName,
      phoneNumber: editPhone.trim()    || showEditModal.phoneNumber,
      email:       editEmail.trim(),
      category:    editCategory.trim() || showEditModal.category,
      address:     editAddress.trim(),
      plan:        editPlan,
      updatedAt:   new Date().toISOString()
    };

    try {
      // 1. Direct Firestore write on 'merchants'
      await setDoc(doc(db, 'merchants', cleanId), payload, { merge: true });

      // 2. Non-blocking backend sync
      try {
        await adminUpdateShopDetails(cleanId, payload);
      } catch {}

      // 3. Update local state & notify parent
      setFirestoreShops(prev => prev.map(s => s.shopId === cleanId ? { ...s, ...payload } : s));
      if (onUpdateMerchant) {
        onUpdateMerchant(cleanId, payload);
      }

      setShowEditModal(null);
    } catch (err: any) {
      alert(`Failed to update merchant: ${err.message}`);
    } finally {
      setEditLoading(false);
    }
  };

  // PLAN UPDATE MUTATION
  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPlanModal) return;
    setPlanLoading(true);
    const cleanId = showPlanModal.shopId;
    try {
      await setDoc(doc(db, 'merchants', cleanId), {
        plan: selectedPlan,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      try {
        await adminUpdateShopDetails(cleanId, { plan: selectedPlan });
      } catch {}

      setFirestoreShops(prev => prev.map(s => s.shopId === cleanId ? { ...s, plan: selectedPlan } : s));
      if (onUpdateMerchant) {
        onUpdateMerchant(cleanId, { plan: selectedPlan });
      }
      setShowPlanModal(null);
    } catch (err: any) {
      alert(`Failed to update plan: ${err.message}`);
    } finally {
      setPlanLoading(false);
    }
  };

  // DELETE SHOP MUTATION (Writes directly to 'merchants' collection)
  const handleDeleteShop = async (shopId: string, shopName: string) => {
    if (!window.confirm(`Permanently delete "${shopName}" (${shopId})? This cannot be undone.`)) return;
    const cleanId = shopId.trim().toUpperCase();
    try {
      // 1. Firestore delete
      await deleteDoc(doc(db, 'merchants', cleanId));

      // 2. Backend delete
      try {
        await adminDeleteShop(cleanId);
      } catch {}

      // 3. Remove from state
      setFirestoreShops(prev => prev.filter(s => s.shopId !== cleanId));
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const planPrice = (plan?: string) =>
    plan === 'pro' ? 350 : plan === 'growth' ? 200 : 100;

  // Filtered merchants for table/grid
  const filteredShops = useMemo(() => {
    return shops.filter(s => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name?.toLowerCase().includes(q) ||
        s.shopId?.toLowerCase().includes(q) ||
        s.ownerName?.toLowerCase().includes(q) ||
        s.phoneNumber?.includes(q) ||
        s.email?.toLowerCase().includes(q);

      if (statusFilter === 'all') return matchSearch;
      return matchSearch && s.status === statusFilter;
    });
  }, [shops, searchQuery, statusFilter]);

  // Real-time Platform Metrics Calculations
  const metrics = useMemo(() => {
    const total = shops.length;
    const active = shops.filter(s => s.status === 'active').length;
    const pending = shops.filter(s => s.status === 'pending').length;
    const suspended = shops.filter(s => s.status === 'suspended').length;

    // Monthly Recurring Revenue calculated from active shops
    const activeShops = shops.filter(s => s.status === 'active');
    const estMRR = activeShops.reduce((sum, s) => sum + planPrice(s.plan), 0);

    const starterCount = shops.filter(s => !s.plan || s.plan === 'starter').length;
    const growthCount  = shops.filter(s => s.plan === 'growth').length;
    const proCount     = shops.filter(s => s.plan === 'pro').length;

    return {
      total,
      active,
      pending,
      suspended,
      estMRR,
      starterCount,
      growthCount,
      proCount,
    };
  }, [shops]);

  if (!isAuthenticated && !syncAdmin) {
    return null;
  }

  // ── Main Admin Console Layout ──
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">

      {/* Main Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo & Platform Info */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-md shadow-indigo-600/30">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black text-white tracking-tight">BlizFlow Admin</h1>
                  <span className="bg-indigo-950 text-indigo-400 border border-indigo-800/60 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                    Control Center
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Merchants, Subscriptions & Revenue</p>
              </div>
            </div>

            {onClose && (
              <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white p-2">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Sub-Route Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-2xl border border-slate-800/90 w-full md:w-auto justify-center">
            <button
              onClick={() => navigate('/admin/dashboard')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                currentSection === 'overview'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => navigate('/admin/merchants')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                currentSection === 'merchants'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Merchants</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                currentSection === 'merchants' ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'
              }`}>
                {metrics.total}
              </span>
            </button>

            <button
              onClick={() => navigate('/admin/subscriptions')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer ${
                currentSection === 'billing'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Subscriptions</span>
            </button>
          </nav>

          {/* Action Tools */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Shop</span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Reload merchants from Firestore"
              className="bg-slate-800 border border-slate-700 text-slate-300 hover:text-white p-2.5 rounded-xl transition hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <button
              onClick={handleSignOut}
              className="bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">

        {/* Temporary Refresh Feedback */}
        {refreshNotice && (
          <div className="bg-emerald-950/70 border border-emerald-800/80 text-emerald-400 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>{refreshNotice}</span>
            </div>
            <button onClick={() => setRefreshNotice(null)} className="text-emerald-500 hover:text-emerald-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            1. OVERVIEW SECTION (/admin/dashboard)
            ══════════════════════════════════════════════════════ */}
        {currentSection === 'overview' && (
          <div className="space-y-6">
            
            {/* Top Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-bold mb-1">
                  <span>Total Shops</span>
                  <Store className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-3xl font-black text-white">{metrics.total}</div>
                <div className="text-[10px] text-slate-500 mt-1">Platform-wide merchants</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-sm">
                <div className="flex items-center justify-between text-emerald-400 text-xs font-bold mb-1">
                  <span>Active Shops</span>
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="text-3xl font-black text-emerald-400">{metrics.active}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {metrics.total ? Math.round((metrics.active / metrics.total) * 100) : 0}% of all shops
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-sm">
                <div className="flex items-center justify-between text-amber-400 text-xs font-bold mb-1">
                  <span>Pending</span>
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-3xl font-black text-amber-400">{metrics.pending}</div>
                <div className="text-[10px] text-slate-500 mt-1">Awaiting activation</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-sm">
                <div className="flex items-center justify-between text-red-400 text-xs font-bold mb-1">
                  <span>Suspended</span>
                  <XCircle className="w-4 h-4" />
                </div>
                <div className="text-3xl font-black text-red-400">{metrics.suspended}</div>
                <div className="text-[10px] text-slate-500 mt-1">Requires review</div>
              </div>

              <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-2xl p-4.5 shadow-sm col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between text-indigo-300 text-xs font-bold mb-1">
                  <span>Monthly Revenue</span>
                  <TrendingUp className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-3xl font-black text-white">R{metrics.estMRR.toLocaleString()}</div>
                <div className="text-[10px] text-indigo-400/80 mt-1">Estimated MRR (Active)</div>
              </div>
            </div>

            {/* Quick Action Navigation & Plan Tiers Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  Subscription Distribution
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-300">Starter (R100/mo)</span>
                    <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                      {metrics.starterCount} shops
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-300">Growth (R200/mo)</span>
                    <span className="font-mono font-bold text-blue-400 bg-slate-800 px-2 py-0.5 rounded">
                      {metrics.growthCount} shops
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-300">Pro (R350/mo)</span>
                    <span className="font-mono font-bold text-purple-400 bg-slate-800 px-2 py-0.5 rounded">
                      {metrics.proCount} shops
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/admin/subscriptions')}
                  className="w-full mt-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Manage Subscriptions</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 md:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      Quick Merchant Management
                    </h3>
                    <button
                      onClick={() => navigate('/admin/merchants')}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      View All {shops.length} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Easily provision new shops with PINs, review pending approvals, and inspect recent activity directly from the database.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Provision New Shop
                  </button>
                  <button
                    onClick={() => { setStatusFilter('pending'); navigate('/admin/merchants'); }}
                    className="bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/40 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-4 h-4" /> Pending Approvals ({metrics.pending})
                  </button>
                  <button
                    onClick={() => { setStatusFilter('all'); navigate('/admin/merchants'); }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-4 h-4" /> Search Directory
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Shops Preview Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-white">Recent Shops</h2>
                  <p className="text-xs text-slate-400">Latest merchants registered in the database</p>
                </div>
                <button
                  onClick={() => navigate('/admin/merchants')}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300"
                >
                  Open Full Directory →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold">
                      <th className="py-2.5 px-3">Shop ID</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Owner</th>
                      <th className="py-2.5 px-3">Plan</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {shops.slice(0, 6).map(s => (
                      <tr key={s.shopId} className="hover:bg-slate-850/50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-400">{s.shopId}</td>
                        <td className="py-2.5 px-3 font-bold text-white">{s.name}</td>
                        <td className="py-2.5 px-3 text-slate-300">{s.ownerName || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span className="capitalize text-slate-300 font-semibold">{s.plan || 'starter'}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            s.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' :
                            s.status === 'pending' ? 'bg-amber-950/60 text-amber-400 border-amber-800/60' :
                            'bg-red-950/60 text-red-400 border-red-800/60'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {s.status !== 'active' ? (
                              <button
                                onClick={() => handleStatusChange(s.shopId, 'active')}
                                className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold text-[10px] px-2 py-1 rounded"
                              >
                                Activate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStatusChange(s.shopId, 'suspended')}
                                className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 font-bold text-[10px] px-2 py-1 rounded"
                              >
                                Suspend
                              </button>
                            )}
                            <button
                              onClick={() => { setShowResetPinModal(s); setResetPinValue(''); setPinModalError(null); }}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1 rounded"
                              title="Reset PIN"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {shops.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No merchants registered in Firestore yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            2. MERCHANTS DIRECTORY SECTION (/admin/merchants)
            ══════════════════════════════════════════════════════ */}
        {currentSection === 'merchants' && (
          <div className="space-y-6">

            {/* Search + Filter Header */}
            <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by ID, name, owner, phone, email..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                {(['all', 'active', 'pending', 'suspended'] as const).map(tab => {
                  const count = tab === 'all'
                    ? shops.length
                    : shops.filter(s => s.status === tab).length;
                  return (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(tab)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                        statusFilter === tab
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{tab}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        statusFilter === tab ? 'bg-indigo-700 text-white' : 'bg-slate-700/60 text-slate-400'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Merchant Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredShops.length === 0 ? (
                <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-300">No shops found matching your search</p>
                  <p className="text-xs text-slate-500 mt-1">Try changing your filters or create a new shop</p>
                </div>
              ) : filteredShops.map(shop => (
                <div
                  key={shop.shopId}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition relative overflow-hidden shadow-sm flex flex-col justify-between"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${
                    shop.status === 'active' ? 'bg-emerald-500' : shop.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />

                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="bg-slate-800 text-indigo-400 font-mono font-black text-xs px-2.5 py-1 rounded-lg border border-slate-700 tracking-wider">
                            {shop.shopId}
                          </span>
                          <button
                            onClick={() => handleCopy(shop)}
                            title="Copy access info"
                            className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer"
                          >
                            {copiedId === shop.shopId
                              ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <h3 className="font-black text-base text-white mt-2 leading-tight">{shop.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{shop.category || 'General Retail'}</p>
                      </div>

                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border shrink-0 ${
                        shop.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' :
                        shop.status === 'pending' ? 'bg-amber-950/60 text-amber-400 border-amber-800/60' :
                        'bg-red-950/60 text-red-400 border-red-800/60'
                      }`}>
                        {shop.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border inline-block ${
                        shop.plan === 'pro' ? 'bg-purple-950/50 text-purple-400 border-purple-800/40' :
                        shop.plan === 'growth' ? 'bg-blue-950/50 text-blue-400 border-blue-800/40' :
                        'bg-slate-800/60 text-slate-300 border-slate-700/50'
                      }`}>
                        {(shop.plan || 'starter').toUpperCase()} — R{planPrice(shop.plan)}/mo
                      </span>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1 text-slate-300">
                      <p><span className="text-slate-500 font-medium">Owner:</span> {shop.ownerName || '—'}</p>
                      <p><span className="text-slate-500 font-medium">Phone:</span> {shop.phoneNumber || '—'}</p>
                      {shop.email && <p><span className="text-slate-500 font-medium">Email:</span> {shop.email}</p>}
                      {shop.address && <p><span className="text-slate-500 font-medium">Address:</span> {shop.address}</p>}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-wrap gap-2 mt-4">
                    {shop.status !== 'active' && (
                      <button
                        onClick={() => handleStatusChange(shop.shopId, 'active')}
                        className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs py-1.5 px-2.5 rounded-lg transition cursor-pointer"
                      >
                        Activate
                      </button>
                    )}
                    {shop.status !== 'suspended' && (
                      <button
                        onClick={() => handleStatusChange(shop.shopId, 'suspended')}
                        className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs py-1.5 px-2.5 rounded-lg transition cursor-pointer"
                      >
                        Suspend
                      </button>
                    )}
                    {shop.status !== 'pending' && (
                      <button
                        onClick={() => handleStatusChange(shop.shopId, 'pending')}
                        className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 font-bold text-xs py-1.5 px-2.5 rounded-lg transition cursor-pointer"
                      >
                        Pending
                      </button>
                    )}
                    <button
                      onClick={() => { setShowResetPinModal(shop); setResetPinValue(''); setPinModalError(null); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      title="Reset PIN"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>PIN</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowEditModal(shop);
                        setEditName(shop.name); setEditOwner(shop.ownerName);
                        setEditPhone(shop.phoneNumber || ''); setEditEmail(shop.email || '');
                        setEditCategory(shop.category || ''); setEditAddress(shop.address || '');
                        setEditPlan((shop.plan as any) || 'starter');
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      title="Edit Shop Details"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteShop(shop.shopId, shop.name)}
                      className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 font-bold text-xs py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      title="Delete Shop"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            3. SUBSCRIPTIONS & BILLING SECTION (/admin/subscriptions)
            ══════════════════════════════════════════════════════ */}
        {currentSection === 'billing' && (
          <div className="space-y-6">

            {/* Financial Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Total Est. MRR</span>
                <span className="text-3xl font-black text-emerald-400 mt-1 block">R{metrics.estMRR.toLocaleString()}</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Monthly recurring income</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 block">Starter Tier (R100)</span>
                <span className="text-3xl font-black text-white mt-1 block">{metrics.starterCount}</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Basic POS & Inventory</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-black uppercase tracking-wider text-blue-400 block">Growth Tier (R200)</span>
                <span className="text-3xl font-black text-blue-400 mt-1 block">{metrics.growthCount}</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Multi-staff & analytics</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <span className="text-xs font-black uppercase tracking-wider text-purple-400 block">Pro Tier (R350)</span>
                <span className="text-3xl font-black text-purple-400 mt-1 block">{metrics.proCount}</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Advanced multi-location</span>
              </div>
            </div>

            {/* Subscription Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-white">Merchant Plans & Subscriptions</h2>
                  <p className="text-xs text-slate-400">View and update merchant pricing plans</p>
                </div>
                <div className="relative w-full md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter subscriptions..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-bold">
                      <th className="py-3 px-3">Shop ID</th>
                      <th className="py-3 px-3">Business Name</th>
                      <th className="py-3 px-3">Current Plan</th>
                      <th className="py-3 px-3">Monthly Fee</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Change Plan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredShops.map(shop => (
                      <tr key={shop.shopId} className="hover:bg-slate-850/50 transition">
                        <td className="py-3 px-3 font-mono font-bold text-indigo-400">{shop.shopId}</td>
                        <td className="py-3 px-3 font-bold text-white">{shop.name}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase border ${
                            shop.plan === 'pro' ? 'bg-purple-950/50 text-purple-400 border-purple-800/50' :
                            shop.plan === 'growth' ? 'bg-blue-950/50 text-blue-400 border-blue-800/50' :
                            'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {shop.plan || 'starter'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-white">R{planPrice(shop.plan)}/mo</td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            shop.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' :
                            shop.status === 'pending' ? 'bg-amber-950/60 text-amber-400 border-amber-800/60' :
                            'bg-red-950/60 text-red-400 border-red-800/60'
                          }`}>
                            {shop.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => {
                              setShowPlanModal(shop);
                              setSelectedPlan((shop.plan as any) || 'starter');
                            }}
                            className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 font-bold text-xs py-1.5 px-3 rounded-lg transition cursor-pointer"
                          >
                            Update Plan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ══════════════════════════════════════════════════════
          MODALS: CREATE, RESET PIN, EDIT, PLAN
          ══════════════════════════════════════════════════════ */}

      {/* CREATE SHOP MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl relative my-8">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-black mb-1">Provision New Merchant Shop</h2>
            <p className="text-xs text-slate-400 mb-4">Directly stored into Firestore merchants collection.</p>

            {formError && <div className="bg-red-950/60 border border-red-900/60 text-red-400 p-3 rounded-xl text-xs mb-3">{formError}</div>}
            {formSuccess && <div className="bg-emerald-950/60 border border-emerald-900/60 text-emerald-400 p-3 rounded-xl text-xs mb-3">{formSuccess}</div>}

            <form onSubmit={handleCreateShop} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Shop ID *</label>
                  <input
                    type="text"
                    placeholder="MEC001"
                    value={newShopId}
                    onChange={e => setNewShopId(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold uppercase outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">PIN * (4–16 digits)</label>
                  <input
                    type="text"
                    placeholder="4827"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Shop Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Mpho Spaza & Wholesale"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Owner Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={newOwner}
                    onChange={e => setNewOwner(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="+27 72 000 0000"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option>Grocery & Spaza Shop</option>
                  <option>Auto Mechanic & Spares</option>
                  <option>Bakery & Confectionery</option>
                  <option>Butchery & Meat Market</option>
                  <option>General Retail</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Initial Status</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none"
                  >
                    <option value="active">Active (Immediate)</option>
                    <option value="pending">Pending Approval</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Subscription Plan</label>
                  <select
                    value={newPlan}
                    onChange={e => setNewPlan(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none"
                  >
                    <option value="starter">Starter (R100/mo)</option>
                    <option value="growth">Growth (R200/mo)</option>
                    <option value="pro">Pro (R350/mo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Zone 4, Meadowlands"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  {formLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save & Provision Shop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PIN MODAL */}
      {showResetPinModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-white shadow-2xl relative">
            <button onClick={() => setShowResetPinModal(null)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black mb-1">Reset Shop PIN</h2>
            <p className="text-xs text-slate-400 mb-4">
              Enter a new PIN for <strong className="text-white">{showResetPinModal.name}</strong> ({showResetPinModal.shopId}).
            </p>
            {pinModalError && <div className="bg-red-950/60 border border-red-900/60 text-red-400 p-2.5 rounded-xl text-xs mb-3">{pinModalError}</div>}
            
            <form onSubmit={handleResetPin} className="space-y-4">
              <input
                type="password"
                placeholder="New PIN (4–16 digits)"
                maxLength={16}
                value={resetPinValue}
                onChange={e => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-mono tracking-widest text-white outline-none focus:border-indigo-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetPinModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  {pinLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Update PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl relative">
            <button onClick={() => setShowEditModal(null)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black mb-1">Edit Merchant Profile</h2>
            <p className="text-xs text-slate-400 mb-4">Shop ID: <strong className="font-mono text-indigo-400">{showEditModal.shopId}</strong></p>

            <form onSubmit={handleEditSubmit} className="space-y-3">
              {[
                { label: 'Shop Name', value: editName, set: setEditName, type: 'text' },
                { label: 'Owner Name', value: editOwner, set: setEditOwner, type: 'text' },
                { label: 'Phone', value: editPhone, set: setEditPhone, type: 'tel' },
                { label: 'Email', value: editEmail, set: setEditEmail, type: 'email' },
                { label: 'Category', value: editCategory, set: setEditCategory, type: 'text' },
                { label: 'Address', value: editAddress, set: setEditAddress, type: 'text' },
              ].map(({ label, value, set, type }) => (
                <div key={label}>
                  <label className="text-xs font-bold text-slate-300 block mb-1">{label}</label>
                  <input
                    type={type}
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Plan</label>
                <select
                  value={editPlan}
                  onChange={e => setEditPlan(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none"
                >
                  <option value="starter">Starter (R100/mo)</option>
                  <option value="growth">Growth (R200/mo)</option>
                  <option value="pro">Pro (R350/mo)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  {editLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLAN CHANGE MODAL */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 text-white shadow-2xl relative">
            <button onClick={() => setShowPlanModal(null)} className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black mb-1">Update Subscription Plan</h2>
            <p className="text-xs text-slate-400 mb-4">{showPlanModal.name} ({showPlanModal.shopId})</p>

            <form onSubmit={handlePlanSubmit} className="space-y-4">
              <div className="space-y-2">
                {[
                  { id: 'starter', name: 'Starter', price: 'R100/mo', desc: 'Single terminal, inventory & sales' },
                  { id: 'growth',  name: 'Growth',  price: 'R200/mo', desc: 'Up to 3 terminals, analytics & staff' },
                  { id: 'pro',     name: 'Pro',     price: 'R350/mo', desc: 'Unlimited terminals, multi-location' },
                ].map(p => (
                  <label
                    key={p.id}
                    className={`block p-3 rounded-xl border cursor-pointer transition ${
                      selectedPlan === p.id
                        ? 'bg-indigo-950/60 border-indigo-500 text-white'
                        : 'bg-slate-800 border-slate-750 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="plan"
                          checked={selectedPlan === p.id}
                          onChange={() => setSelectedPlan(p.id as any)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-bold text-xs">{p.name}</span>
                      </div>
                      <span className="font-mono font-bold text-xs text-indigo-400">{p.price}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-5 mt-0.5">{p.desc}</p>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={planLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/20"
                >
                  {planLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
