import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { logoutAdmin, onAdminAuthChanged } from '../services/adminAuth';
import {
  createShop,
  updateShopStatus,
  resetShopPin,
  adminFetchAllShops,
  adminDeleteShop,
  adminUpdateShopDetails,
  ShopRecord,
} from '../auth/shopAuth';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  ShieldCheck, Users, CheckCircle, XCircle, Clock, Search,
  Lock, KeyRound, Edit3, PlusCircle, Smartphone, ArrowLeft,
  Loader2, AlertCircle, RefreshCw, Trash2, CreditCard, Copy,
  Check, X
} from 'lucide-react';

interface AdminPanelProps {
  merchants?: ShopRecord[] | any[];
  onUpdateMerchant?: (updated: any) => void;
  onClose?: () => void;
  defaultTab?: 'all' | 'active' | 'pending' | 'suspended';
}

export default function AdminPanel({
  merchants: initialMerchants,
  onUpdateMerchant,
  onClose,
  defaultTab = 'all'
}: AdminPanelProps) {
  const navigate = useNavigate();

  // Synchronous initial auth check to eliminate flashing/glitching
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('blizflow_admin_auth') === 'true';
  });
  const [authLoading, setAuthLoading]         = useState<boolean>(() => {
    return typeof window !== 'undefined' && sessionStorage.getItem('blizflow_admin_auth') !== 'true';
  });

  // FIX 3: Use ShopRecord as the unified type
  const [shops, setShops]             = useState<ShopRecord[]>(() => {
    if (initialMerchants && initialMerchants.length > 0) {
      return initialMerchants.map(m => ({ ...m, shopId: m.shopId || m.id }));
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'suspended'>(defaultTab);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [adminSection, setAdminSection] = useState<'shops' | 'billing'>('shops');
  const [copiedId, setCopiedId]         = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal]     = useState(false);
  const [showResetPinModal, setShowResetPinModal] = useState<ShopRecord | null>(null);
  const [showEditModal, setShowEditModal]         = useState<ShopRecord | null>(null);

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
  const [editName, setEditName]       = useState('');
  const [editOwner, setEditOwner]     = useState('');
  const [editPhone, setEditPhone]     = useState('');
  const [editEmail, setEditEmail]     = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPlan, setEditPlan]       = useState<'starter' | 'growth' | 'pro'>('starter');
  const [editLoading, setEditLoading] = useState(false);

  // FIX 1: Subscribe to admin auth state
  useEffect(() => {
    const unsub = onAdminAuthChanged(user => {
      setIsAuthenticated(!!user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // FIX 2: Load shops via Firestore real-time listener on the 'merchants' collection + backend baseline
  useEffect(() => {
    if (!isAuthenticated) return;
    setIsRefreshing(true);

    // Initial baseline from backend API
    adminFetchAllShops()
      .then(serverShops => {
        if (serverShops && serverShops.length > 0) {
          setShops(prev => {
            const map = new Map<string, ShopRecord>();
            serverShops.forEach(s => map.set(s.id, { ...s, shopId: s.id } as ShopRecord));
            prev.forEach(s => map.set(s.shopId, s));
            return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          });
        }
      })
      .catch(e => console.warn('[AdminPanel] Server baseline fetch note:', e));

    const unsub = onSnapshot(
      collection(db, 'merchants'),
      snapshot => {
        const list: ShopRecord[] = [];
        snapshot.forEach(d => {
          const data = d.data();
          list.push({ ...data, id: d.id, shopId: d.id } as ShopRecord);
        });
        if (list.length > 0) {
          setShops(prev => {
            const map = new Map<string, ShopRecord>();
            prev.forEach(s => map.set(s.shopId, s));
            list.forEach(s => map.set(s.shopId, s));
            return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          });
        }
        setIsRefreshing(false);
      },
      err => {
        console.warn('[AdminPanel] Merchants listener error:', err);
        setIsRefreshing(false);
      }
    );
    return () => unsub();
  }, [isAuthenticated]);

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

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const cleanId = newShopId.replace(/[^A-Za-z0-9_-]/g, '').trim().toUpperCase();
    if (!cleanId)       { setFormError('Shop ID is required.'); return; }
    if (!newName.trim()) { setFormError('Shop Name is required.'); return; }
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
    });
    setFormLoading(false);

    if (!result.success) { setFormError(result.error || 'Failed to create shop.'); return; }

    // If chosen status is active, update it (createShop defaults to pending)
    if (newStatus === 'active') {
      await updateShopStatus(cleanId, 'active');
    }

    if (result.shop && onUpdateMerchant) {
      onUpdateMerchant(result.shop);
    }

    setFormSuccess(`Shop ${cleanId} created successfully!`);
    setNewShopId(''); setNewName(''); setNewOwner(''); setNewPhone('');
    setNewEmail(''); setNewAddress(''); setNewPin(''); setNewPlan('starter');
    setTimeout(() => { setShowCreateModal(false); setFormSuccess(null); }, 1500);
  };

  const handleStatusChange = async (shopId: string, status: 'active' | 'pending' | 'suspended') => {
    const prevShops = [...shops];
    // Optimistic UI update
    setShops(prev => prev.map(s => s.shopId === shopId ? { ...s, status } : s));

    const result = await updateShopStatus(shopId, status);
    if (!result.success) {
      // Revert optimistic update
      setShops(prevShops);
      alert(`Failed to update status: ${result.error}`);
    } else {
      const current = shops.find(s => s.shopId === shopId);
      const updated = result.shop 
        ? { ...current, ...result.shop, status } 
        : current 
          ? { ...current, status } 
          : null;
      if (updated && onUpdateMerchant) {
        onUpdateMerchant(updated);
      }
    }
  };

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
    if (!result.success) { setPinModalError(result.error || 'Failed to reset PIN.'); return; }
    setShowResetPinModal(null);
    setResetPinValue('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setEditLoading(true);
    const updates = {
      name:        editName.trim()     || showEditModal.name,
      ownerName:   editOwner.trim()    || showEditModal.ownerName,
      phoneNumber: editPhone.trim()    || showEditModal.phoneNumber,
      email:       editEmail.trim(),
      category:    editCategory.trim() || showEditModal.category,
      address:     editAddress.trim(),
      plan:        editPlan,
    };
    try {
      try {
        await adminUpdateShopDetails(showEditModal.shopId, updates);
      } catch (beErr) {
        console.warn('[AdminPanel] Server update note:', beErr);
      }

      await setDoc(doc(db, 'merchants', showEditModal.shopId), updates, { merge: true });
      if (onUpdateMerchant) {
        onUpdateMerchant({ ...showEditModal, ...updates });
      }
      setShowEditModal(null);
    } catch (err: any) {
      alert(`Failed to update: ${err.message}`);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteShop = async (shopId: string, shopName: string) => {
    if (!window.confirm(`Permanently delete "${shopName}" (${shopId})? This cannot be undone.`)) return;
    try {
      try {
        await adminDeleteShop(shopId);
      } catch (beErr) {
        console.warn('[AdminPanel] Server delete note:', beErr);
      }
      await deleteDoc(doc(db, 'merchants', shopId));
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const filteredShops = shops.filter(s => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      s.name?.toLowerCase().includes(q) ||
      s.shopId?.toLowerCase().includes(q) ||
      s.ownerName?.toLowerCase().includes(q) ||
      s.phoneNumber?.includes(q);
    if (statusFilter === 'all') return matchSearch;
    return matchSearch && s.status === statusFilter;
  });

  const planPrice = (plan?: string) =>
    plan === 'pro' ? 350 : plan === 'growth' ? 200 : 100;

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const serverShops = await adminFetchAllShops();
      if (serverShops && serverShops.length > 0) {
        setShops(prev => {
          const map = new Map<string, ShopRecord>();
          serverShops.forEach(s => map.set(s.id, { ...s, shopId: s.id } as ShopRecord));
          prev.forEach(s => map.set(s.shopId, s));
          return Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        });
      }
    } catch (err) {
      console.warn('[AdminPanel] Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ── Loading ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  // ── Unauthorized redirect to unified /admin/login ──
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  // ── Admin Dashboard ──
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black text-white">BlizFlow Admin Console</h1>
            <p className="text-[11px] text-slate-400">Shop ID & PIN Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCreateModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer">
            <PlusCircle className="w-4 h-4" /> Create Shop
          </button>
          <button onClick={handleRefresh} disabled={isRefreshing} title="Refresh"
            className="bg-slate-800 border border-slate-700 text-slate-300 p-2.5 rounded-xl transition hover:bg-slate-700 cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleSignOut}
            className="bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition cursor-pointer">
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* Section tabs */}
        <div className="flex gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl max-w-xs">
          {(['shops', 'billing'] as const).map(s => (
            <button key={s} onClick={() => setAdminSection(s)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                adminSection === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              {s === 'shops' ? <><Users className="w-3.5 h-3.5" />Shops</> : <><CreditCard className="w-3.5 h-3.5" />Billing</>}
            </button>
          ))}
        </div>

        {/* Stats */}
        {adminSection === 'shops' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Shops', value: shops.length, color: 'text-white' },
              { label: 'Active', value: shops.filter(s => s.status === 'active').length, color: 'text-emerald-400' },
              { label: 'Pending', value: shops.filter(s => s.status === 'pending').length, color: 'text-amber-400' },
              { label: 'Suspended', value: shops.filter(s => s.status === 'suspended').length, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">{label}</span>
                <span className={`text-2xl font-black mt-1 block ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Est. MRR', value: `R${shops.filter(s => s.status === 'active').reduce((sum, s) => sum + planPrice(s.plan), 0)}`, color: 'text-emerald-400' },
              { label: 'Starter (R100)', value: shops.filter(s => !s.plan || s.plan === 'starter').length, color: 'text-white' },
              { label: 'Growth (R200)', value: shops.filter(s => s.plan === 'growth').length, color: 'text-blue-400' },
              { label: 'Pro (R350)', value: shops.filter(s => s.plan === 'pro').length, color: 'text-purple-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">{label}</span>
                <span className={`text-2xl font-black mt-1 block ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search + filter */}
        <div className="flex flex-col md:flex-row gap-3 items-center bg-slate-900 border border-slate-800 p-3 rounded-2xl">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder="Search ID, name, owner, phone..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'active', 'pending', 'suspended'] as const).map(tab => (
              <button key={tab} onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                  statusFilter === tab ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Shops grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredShops.length === 0 ? (
            <div className="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">No shops found.</p>
            </div>
          ) : filteredShops.map(shop => (
            <div key={shop.shopId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-1 ${
                shop.status === 'active' ? 'bg-emerald-500' : shop.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'
              }`} />

              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <span className="bg-slate-800 text-indigo-400 font-mono font-black text-xs px-2.5 py-1 rounded-lg border border-slate-700 tracking-wider">
                      {shop.shopId}
                    </span>
                    <button onClick={() => handleCopy(shop)} title="Copy access info"
                      className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer">
                      {copiedId === shop.shopId
                        ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <h3 className="font-black text-base text-white mt-2">{shop.name}</h3>
                  <p className="text-xs text-slate-400">{shop.category}</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border mt-1 inline-block ${
                    shop.plan === 'pro' ? 'bg-purple-950/50 text-purple-400 border-purple-800/40' :
                    shop.plan === 'growth' ? 'bg-blue-950/50 text-blue-400 border-blue-800/40' :
                    'bg-slate-800/60 text-slate-400 border-slate-700/50'
                  }`}>
                    {(shop.plan || 'starter').charAt(0).toUpperCase() + (shop.plan || 'starter').slice(1)} — R{planPrice(shop.plan)}/mo
                  </span>
                </div>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                  shop.status === 'active' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60' :
                  shop.status === 'pending' ? 'bg-amber-950/60 text-amber-400 border-amber-800/60' :
                  'bg-red-950/60 text-red-400 border-red-800/60'
                }`}>
                  {shop.status}
                </span>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1 text-slate-300">
                <p><span className="text-slate-500">Owner:</span> {shop.ownerName}</p>
                <p><span className="text-slate-500">Phone:</span> {shop.phoneNumber || '—'}</p>
                {shop.address && <p><span className="text-slate-500">Address:</span> {shop.address}</p>}
              </div>

              <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
                {shop.status !== 'active' && (
                  <button onClick={() => handleStatusChange(shop.shopId, 'active')}
                    className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs py-1.5 px-2.5 rounded-lg transition cursor-pointer">
                    Activate
                  </button>
                )}
                {shop.status !== 'suspended' && (
                  <button onClick={() => handleStatusChange(shop.shopId, 'suspended')}
                    className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs py-1.5 px-2.5 rounded-lg transition cursor-pointer">
                    Suspend
                  </button>
                )}
                {shop.status !== 'pending' && (
                  <button onClick={() => handleStatusChange(shop.shopId, 'pending')}
                    className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 font-bold text-xs py-1.5 px-2.5 rounded-lg transition cursor-pointer">
                    Pending
                  </button>
                )}
                <button onClick={() => { setShowResetPinModal(shop); setResetPinValue(''); setPinModalError(null); }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 cursor-pointer">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" /> PIN
                </button>
                <button onClick={() => {
                  setShowEditModal(shop);
                  setEditName(shop.name); setEditOwner(shop.ownerName);
                  setEditPhone(shop.phoneNumber); setEditEmail(shop.email || '');
                  setEditCategory(shop.category || ''); setEditAddress(shop.address || '');
                  setEditPlan((shop.plan as any) || 'starter');
                }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 cursor-pointer">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDeleteShop(shop.shopId, shop.name)}
                  className="bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 font-bold text-xs py-1.5 px-2.5 rounded-lg transition flex items-center gap-1 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl relative my-8">
            <button onClick={() => setShowCreateModal(false)} className="absolute top-5 right-5 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-black mb-1">Create New Shop</h2>
            <p className="text-xs text-slate-400 mb-4">Assign a Shop ID and PIN. PIN is stored encrypted.</p>

            {formError && <div className="bg-red-950/60 border border-red-900/60 text-red-400 p-3 rounded-xl text-xs mb-3">{formError}</div>}
            {formSuccess && <div className="bg-emerald-950/60 border border-emerald-900/60 text-emerald-400 p-3 rounded-xl text-xs mb-3">{formSuccess}</div>}

            <form onSubmit={handleCreateShop} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Shop ID *</label>
                  <input type="text" placeholder="MEC001" value={newShopId}
                    onChange={e => setNewShopId(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold uppercase outline-none focus:border-indigo-500" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">PIN * (4–16 digits)</label>
                  <input type="text" placeholder="4827" value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white font-mono font-bold outline-none focus:border-indigo-500" required />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Shop Name *</label>
                <input type="text" placeholder="e.g. Mpho Spaza & Wholesale" value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Owner Name</label>
                  <input type="text" placeholder="Full name" value={newOwner}
                    onChange={e => setNewOwner(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Phone</label>
                  <input type="tel" placeholder="+27 72 000 0000" value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Category</label>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500">
                  <option>Grocery & Spaza Shop</option>
                  <option>Auto Mechanic & Spares</option>
                  <option>Bakery & Confectionery</option>
                  <option>Butchery & Meat Market</option>
                  <option>General Retail</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Status</label>
                  <select value={newStatus} onChange={e => setNewStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none">
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Plan</label>
                  <select value={newPlan} onChange={e => setNewPlan(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none">
                    <option value="starter">Starter (R100/mo)</option>
                    <option value="growth">Growth (R200/mo)</option>
                    <option value="pro">Pro (R350/mo)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Address</label>
                <input type="text" placeholder="Zone 4, Meadowlands" value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500" />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" disabled={formLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                  {formLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create & Save Shop
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
            <button onClick={() => setShowResetPinModal(null)} className="absolute top-5 right-5 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black mb-1">Reset PIN</h2>
            <p className="text-xs text-slate-400 mb-4">
              New PIN for <strong className="text-white">{showResetPinModal.name}</strong> ({showResetPinModal.shopId})
            </p>
            {pinModalError && <div className="bg-red-950/60 border border-red-900/60 text-red-400 p-2.5 rounded-xl text-xs mb-3">{pinModalError}</div>}
            <form onSubmit={handleResetPin} className="space-y-4">
              <input type="password" placeholder="New PIN (4–16 digits)" maxLength={16}
                value={resetPinValue} onChange={e => setResetPinValue(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm font-mono tracking-widest text-white outline-none focus:border-indigo-500" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowResetPinModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" disabled={pinLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                  {pinLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save PIN
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
            <button onClick={() => setShowEditModal(null)} className="absolute top-5 right-5 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-base font-black mb-1">Edit Shop</h2>
            <p className="text-xs text-slate-400 mb-4">{showEditModal.shopId}</p>
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
                  <input type={type} value={value} onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none focus:border-indigo-500" />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Plan</label>
                <select value={editPlan} onChange={e => setEditPlan(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white outline-none">
                  <option value="starter">Starter (R100/mo)</option>
                  <option value="growth">Growth (R200/mo)</option>
                  <option value="pro">Pro (R350/mo)</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowEditModal(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">Cancel</button>
                <button type="submit" disabled={editLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                  {editLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}