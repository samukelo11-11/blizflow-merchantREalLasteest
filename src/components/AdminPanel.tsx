import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { ShopProfile, PaymentRecord } from '../types';
import { loginAdmin } from '../services/adminAuth';
import { 
  ShieldCheck, 
  Users, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Search, 
  Calendar, 
  DollarSign, 
  Lock, 
  Unlock, 
  Smartphone, 
  HelpCircle,
  Eye,
  RefreshCw,
  Bell,
  ChevronRight,
  Wrench,
  Receipt,
  FileCheck,
  Ban
} from 'lucide-react';

interface AdminPanelProps {
  merchants: ShopProfile[];
  onUpdateMerchant: (updated: ShopProfile) => void;
  onClose?: () => void;
  defaultTab?: 'all' | 'trial' | 'payment_pending' | 'active' | 'rejected' | 'suspended';
}

export default function AdminPanel({ merchants, onUpdateMerchant, onClose, defaultTab }: AdminPanelProps) {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('blizflow_admin_auth') === 'true';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Real-time payments collection
  const [payments, setPayments] = useState<PaymentRecord[]>([]);

  // Admin search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'trial' | 'payment_pending' | 'active' | 'rejected' | 'suspended'>(defaultTab || 'all');

  // Detail view
  const [selectedMerchant, setSelectedMerchant] = useState<ShopProfile | null>(null);
  const [showDevControls, setShowDevControls] = useState(false);
  
  // Modals / forms state
  const [rejectionModalMerchantId, setRejectionModalMerchantId] = useState<string | null>(null);
  const [rejectionModalPaymentId, setRejectionModalPaymentId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // Date adjuster modal
  const [dateModalMerchant, setDateModalMerchant] = useState<ShopProfile | null>(null);
  const [customTrialDate, setCustomTrialDate] = useState('');
  const [customRenewalDate, setCustomRenewalDate] = useState('');

  useEffect(() => {
    if (defaultTab) {
      setStatusFilter(defaultTab);
    }
  }, [defaultTab]);

  // Real-time Firestore sync for payments
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'payments'),
      (snapshot) => {
        const list: PaymentRecord[] = [];
        snapshot.forEach((d) => {
          list.push({ ...d.data(), id: d.id } as PaymentRecord);
        });
        list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        setPayments(list);
      },
      (err) => {
        console.warn('[AdminPanel] Payments sync warning:', err);
      }
    );
    return () => unsub();
  }, []);
  
  // Handle Admin Auth
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    try {
      await loginAdmin(email, password, false);
      setIsAuthenticated(true);
      sessionStorage.setItem('blizflow_admin_auth', 'true');
    } catch (err: any) {
      setAuthError(err.message || 'Incorrect email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleApprovePayment = async (mId: string, paymentId?: string) => {
    const merchant = merchants.find(m => m.id === mId);
    if (!merchant) return;

    const nextRenewal = new Date();
    nextRenewal.setDate(nextRenewal.getDate() + 30); // 30 days active
    const nowIso = new Date().toISOString();
    const adminEmail = auth.currentUser?.email || email || 'admin@blizflow.co.za';

    const updated: ShopProfile = {
      ...merchant,
      subscriptionStatus: 'active',
      plan: 'starter',
      subscriptionPrice: 149,
      subscriptionStartedAt: merchant.subscriptionStartedAt || nowIso,
      subscribedAt: nowIso,
      nextRenewalDate: nextRenewal.toISOString(),
      rejectionReason: undefined
    };

    // Update merchant record in Firestore
    try {
      await setDoc(doc(db, 'merchants', mId), updated, { merge: true });
    } catch (e) {
      console.warn('[AdminPanel] Error updating merchant in Firestore:', e);
    }

    // Find and update matching payment record
    const targetPayment = paymentId 
      ? payments.find(p => p.id === paymentId)
      : payments.find(p => p.merchantId === mId && p.status === 'PENDING');

    if (targetPayment) {
      try {
        await setDoc(doc(db, 'payments', targetPayment.id), {
          ...targetPayment,
          status: 'APPROVED',
          reviewedAt: nowIso,
          reviewedBy: adminEmail
        }, { merge: true });
      } catch (pErr) {
        console.warn('[AdminPanel] Error updating payment record:', pErr);
      }
    }

    // Save notification to merchant
    const notifyKey = `blizflow_notify_${mId}`;
    const notifications = JSON.parse(localStorage.getItem(notifyKey) || '[]');
    notifications.push({
      id: `notify-${Date.now()}`,
      title: '🎉 Subscription Activated!',
      message: 'Your payment for BlizFlow Starter has been approved! Full POS and Stock limits are unlocked.',
      type: 'success',
      timestamp: nowIso,
      read: false
    });
    localStorage.setItem(notifyKey, JSON.stringify(notifications));

    onUpdateMerchant(updated);
    setSelectedMerchant(prev => prev && prev.id === mId ? updated : prev);
  };

  const handleOpenRejection = (mId: string, paymentId?: string) => {
    setRejectionModalMerchantId(mId);
    setRejectionModalPaymentId(paymentId || null);
    setRejectionReason('Reference code not found in bank records. Please re-upload or input your correct reference code.');
  };

  const handleConfirmRejection = async () => {
    if (!rejectionModalMerchantId) return;
    const merchant = merchants.find(m => m.id === rejectionModalMerchantId);
    if (!merchant) return;

    const nowIso = new Date().toISOString();
    const adminEmail = auth.currentUser?.email || email || 'admin@blizflow.co.za';

    const updated: ShopProfile = {
      ...merchant,
      subscriptionStatus: 'rejected',
      rejectionReason: rejectionReason.trim()
    };

    // Update merchant record in Firestore
    try {
      await setDoc(doc(db, 'merchants', rejectionModalMerchantId), updated, { merge: true });
    } catch (e) {
      console.warn('[AdminPanel] Error updating rejected merchant in Firestore:', e);
    }

    // Find and update matching payment record
    const targetPayment = rejectionModalPaymentId 
      ? payments.find(p => p.id === rejectionModalPaymentId)
      : payments.find(p => p.merchantId === rejectionModalMerchantId && p.status === 'PENDING');

    if (targetPayment) {
      try {
        await setDoc(doc(db, 'payments', targetPayment.id), {
          ...targetPayment,
          status: 'REJECTED',
          reviewedAt: nowIso,
          reviewedBy: adminEmail,
          rejectionReason: rejectionReason.trim()
        }, { merge: true });
      } catch (pErr) {
        console.warn('[AdminPanel] Error updating rejected payment record:', pErr);
      }
    }

    // Save notification to merchant
    const notifyKey = `blizflow_notify_${rejectionModalMerchantId}`;
    const notifications = JSON.parse(localStorage.getItem(notifyKey) || '[]');
    notifications.push({
      id: `notify-${Date.now()}`,
      title: '❌ Payment Rejected',
      message: `Your payment was rejected. Reason: ${rejectionReason.trim()}`,
      type: 'error',
      timestamp: nowIso,
      read: false
    });
    localStorage.setItem(notifyKey, JSON.stringify(notifications));

    onUpdateMerchant(updated);
    setSelectedMerchant(prev => prev && prev.id === rejectionModalMerchantId ? updated : prev);
    setRejectionModalMerchantId(null);
    setRejectionModalPaymentId(null);
  };

  const handleSuspendStore = (mId: string, suspend: boolean) => {
    const merchant = merchants.find(m => m.id === mId);
    if (!merchant) return;

    const updated: ShopProfile = {
      ...merchant,
      subscriptionStatus: suspend ? 'suspended' : (merchant.nextRenewalDate ? 'active' : 'trial')
    };

    // Save notification to merchant
    const notifyKey = `blizflow_notify_${mId}`;
    const notifications = JSON.parse(localStorage.getItem(notifyKey) || '[]');
    notifications.push({
      id: `notify-${Date.now()}`,
      title: suspend ? '⚠️ Store Access Suspended' : '✅ Store Access Restored',
      message: suspend 
        ? 'Access to your store has been suspended by administration. Please contact billing@blizflow.co.za.' 
        : 'Your store access has been fully restored! Welcome back to normal operations.',
      type: suspend ? 'warning' : 'success',
      timestamp: new Date().toISOString(),
      read: false
    });
    localStorage.setItem(notifyKey, JSON.stringify(notifications));

    onUpdateMerchant(updated);
    setSelectedMerchant(prev => prev && prev.id === mId ? updated : prev);
  };

  const handleOpenDateAdjuster = (m: ShopProfile) => {
    setDateModalMerchant(m);
    
    // Format dates to YYYY-MM-DD
    const trialDate = m.trialEndsAt ? new Date(m.trialEndsAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setCustomTrialDate(trialDate.toISOString().split('T')[0]);

    const renewalDate = m.nextRenewalDate ? new Date(m.nextRenewalDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setCustomRenewalDate(renewalDate.toISOString().split('T')[0]);
  };

  const handleSaveDates = () => {
    if (!dateModalMerchant) return;

    const updated: ShopProfile = {
      ...dateModalMerchant,
      trialEndsAt: new Date(customTrialDate).toISOString(),
      nextRenewalDate: new Date(customRenewalDate).toISOString()
    };

    onUpdateMerchant(updated);
    setSelectedMerchant(prev => prev && prev.id === dateModalMerchant.id ? updated : prev);
    setDateModalMerchant(null);
  };

  const handleForceTrialExpiry = (mId: string) => {
    const merchant = merchants.find(m => m.id === mId);
    if (!merchant) return;

    const updated: ShopProfile = {
      ...merchant,
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Set to yesterday
    };

    onUpdateMerchant(updated);
    setSelectedMerchant(prev => prev && prev.id === mId ? updated : prev);
  };

  const handleForceActiveExpiry = (mId: string) => {
    const merchant = merchants.find(m => m.id === mId);
    if (!merchant) return;

    const updated: ShopProfile = {
      ...merchant,
      subscriptionStatus: 'expired',
      nextRenewalDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Set to yesterday
    };

    onUpdateMerchant(updated);
    setSelectedMerchant(prev => prev && prev.id === mId ? updated : prev);
  };

  // Filtering
  const filteredMerchants = merchants.filter(m => {
    const matchesSearch = 
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phoneNumber.includes(searchQuery) ||
      (m.email && m.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (statusFilter === 'all') return matchesSearch;
    return m.subscriptionStatus === statusFilter && matchesSearch;
  });

  const pendingMerchants = merchants.filter(m => m.subscriptionStatus === 'payment_pending');

  const getStatusBadge = (m: ShopProfile) => {
    const now = new Date();
    const createdDate = m.createdAt ? new Date(m.createdAt) : new Date();
    const defaultTrialEnd = new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const trialEnds = m.trialEndsAt ? new Date(m.trialEndsAt) : defaultTrialEnd;
    const calculatedDaysLeft = Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const isTrialExpired = calculatedDaysLeft === 0 && m.subscriptionStatus !== 'active';

    if (m.subscriptionStatus === 'active') {
      return <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 text-[10px] font-black uppercase px-2 py-1 rounded-full">Active Premium</span>;
    }
    if (m.subscriptionStatus === 'payment_pending') {
      return <span className="bg-indigo-950 text-indigo-400 border border-indigo-900 text-[10px] font-black uppercase px-2 py-1 rounded-full animate-pulse">Payment Pending</span>;
    }
    if (m.subscriptionStatus === 'rejected') {
      return <span className="bg-red-950/80 text-red-400 border border-red-900/40 text-[10px] font-black uppercase px-2 py-1 rounded-full">Rejected</span>;
    }
    if (m.subscriptionStatus === 'suspended') {
      return <span className="bg-red-950 text-red-500 border border-red-900 text-[10px] font-black uppercase px-2 py-1 rounded-full">Suspended Store</span>;
    }
    if (m.subscriptionStatus === 'expired') {
      return <span className="bg-amber-950 text-amber-500 border border-amber-900 text-[10px] font-black uppercase px-2 py-1 rounded-full">Expired</span>;
    }
    if (isTrialExpired) {
      return <span className="bg-amber-950 text-amber-500 border border-amber-900 text-[10px] font-black uppercase px-2 py-1 rounded-full">Trial Expired</span>;
    }
    return <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-black uppercase px-2 py-1 rounded-full">Active Trial</span>;
  };

  // Render Auth screen first
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black text-white">Administration Portal</h1>
            <p className="text-xs text-slate-400 leading-normal">
              Enter authorized administrator credentials to verify access and manage merchant profiles.
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="admin@blizflow.co.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition disabled:opacity-55"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition disabled:opacity-55"
                required
              />
            </div>

            {authError && (
              <p className="text-xs text-red-400 font-semibold bg-red-950/40 border border-red-900/40 rounded-lg p-2.5">
                {authError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose || (() => navigate('/'))}
                disabled={loading}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Back to Shop
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition shadow-md shadow-indigo-600/10 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <>
                    <span className="spinner-inline animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                    Verifying...
                  </>
                ) : (
                  'Unlock Panel'
                )}
              </button>
            </div>
          </form>

          <p className="text-[10px] text-slate-500 text-center leading-normal">
            🛡️ Secure administrative entry. Unauthorized access is strictly prohibited and logged.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans">
      
      {/* Admin Header */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/25 border border-indigo-500/30 text-indigo-400 p-2 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
              BlizFlow Admin Console
              <span className="bg-indigo-950 text-indigo-400 border border-indigo-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                System Master
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Manage billing, pending approvals, manual suspensions, and trial limits.</p>
          </div>
        </div>

        {/* Sub Routing Navbar */}
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer uppercase tracking-wider ${
              window.location.pathname === '/admin/dashboard' || window.location.pathname === '/admin'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => navigate('/admin/merchants')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer uppercase tracking-wider ${
              window.location.pathname === '/admin/merchants'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Merchants
          </button>
          <button
            onClick={() => navigate('/admin/subscriptions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer uppercase tracking-wider ${
              window.location.pathname === '/admin/subscriptions'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Subscriptions
          </button>
        </div>

        <button
          onClick={onClose || (() => navigate('/'))}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer w-full md:w-auto text-center"
        >
          Close Console
        </button>
      </header>

      {/* Main Panel Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* SECTION 1 — ADMIN OVERVIEW */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Total Shops</span>
            <span className="text-2xl font-black text-white mt-1 block">{merchants.length}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 block">Active Plans</span>
            <span className="text-2xl font-black text-emerald-400 mt-1 block">
              {merchants.filter(m => m.subscriptionStatus === 'active').length}
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 relative overflow-hidden">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">Pending Approval</span>
            <span className={`text-2xl font-black text-indigo-400 mt-1 block ${pendingMerchants.length > 0 ? 'animate-pulse' : ''}`}>
              {pendingMerchants.length}
            </span>
            {pendingMerchants.length > 0 && (
              <span className="absolute top-3 right-3 w-2 h-2 bg-indigo-500 rounded-full animate-ping" />
            )}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500 block">Trial Mode</span>
            <span className="text-2xl font-black text-amber-400 mt-1 block">
              {merchants.filter(m => m.subscriptionStatus === 'trial' || !m.subscriptionStatus).length}
            </span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 col-span-2 md:col-span-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-500 block">Suspended</span>
            <span className="text-2xl font-black text-red-400 mt-1 block">
              {merchants.filter(m => m.subscriptionStatus === 'suspended').length}
            </span>
          </div>
        </div>

        {/* SECTION 2 — ATTENTION FIRST */}
        {pendingMerchants.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Pending Payment Approvals</h2>
              <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                {pendingMerchants.length} pending
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingMerchants.map(m => {
                const merchantPayment = payments.find(p => p.merchantId === m.id && p.status === 'PENDING');
                const ref = merchantPayment?.reference || localStorage.getItem(`blizflow_eft_ref_${m.id}`) || `BF-${m.id.substring(0, 8).toUpperCase()}`;
                const amount = merchantPayment?.amount || 149;
                const submittedDate = merchantPayment?.submittedAt 
                  ? new Date(merchantPayment.submittedAt).toLocaleString() 
                  : (m.paymentSubmittedAt ? new Date(m.paymentSubmittedAt).toLocaleString() : 'Recent');

                return (
                  <div key={m.id} className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-black text-white text-sm">{m.name}</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">{m.category}</p>
                      </div>
                      <span className="bg-indigo-950 text-indigo-400 border border-indigo-900 text-[10px] font-black uppercase px-2 py-1 rounded-full animate-pulse">
                        EFT Pending
                      </span>
                    </div>

                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1.5 font-mono">
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-500 text-[10px]">Reference:</span>
                        <span className="font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40 select-all">
                          {ref}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-500 text-[10px]">Amount:</span>
                        <span className="font-bold text-emerald-400">R{amount}.00 ZAR</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-500 text-[10px]">Submitted:</span>
                        <span className="text-[10px] text-slate-400">{submittedDate}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-300"><span className="text-slate-500">Owner:</span> {m.ownerName}</p>
                      <p className="text-xs text-slate-300"><span className="text-slate-500">Phone:</span> {m.phoneNumber}</p>
                      {m.email && (
                        <p className="text-xs text-slate-300"><span className="text-slate-500">Email:</span> {m.email}</p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleApprovePayment(m.id, merchantPayment?.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-3 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Approve Payment
                      </button>
                      <button
                        onClick={() => handleOpenRejection(m.id, merchantPayment?.id)}
                        className="flex-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-extrabold text-[10px] px-3 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject Payment
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {pendingMerchants.length === 0 && statusFilter === 'payment_pending' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">No payments currently require approval.</p>
            <p className="text-[10px] text-slate-500 mt-1">All merchant payments have been processed.</p>
          </div>
        )}

        {/* SECTION 3 — FILTERS & SEARCH */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search store or owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {(['all', 'trial', 'payment_pending', 'active', 'rejected', 'suspended'] as const).map(f => {
              const count = f === 'all' ? merchants.length : merchants.filter(m => m.subscriptionStatus === f || (f === 'trial' && !m.subscriptionStatus)).length;
              const isPending = f === 'payment_pending' && count > 0;
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === f
                      ? 'bg-indigo-600 text-white'
                      : isPending
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-900 hover:bg-indigo-900'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {f.replace('_', ' ')}
                  <span className={`text-[10px] ${isPending ? 'text-indigo-400' : 'opacity-60'}`}>({count})</span>
                  {isPending && <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 4 — MERCHANT MANAGEMENT */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-200">Merchant Directory</h2>
            <span className="text-[10px] text-slate-500 font-bold">{filteredMerchants.length} result{filteredMerchants.length !== 1 ? 's' : ''}</span>
          </div>

          {filteredMerchants.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="text-slate-400 text-xs font-bold">No merchants match current filters.</p>
              <p className="text-[10px] text-slate-500">Adjust your search or status filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMerchants.map(m => {
                const now = new Date();
                const createdDate = m.createdAt ? new Date(m.createdAt) : new Date();
                const defaultTrialEnd = new Date(createdDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                const trialEnds = m.trialEndsAt ? new Date(m.trialEndsAt) : defaultTrialEnd;
                const calculatedDaysLeft = Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                const isTrialExpired = calculatedDaysLeft === 0 && m.subscriptionStatus !== 'active';

                return (
                  <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 hover:border-slate-700 transition">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-black text-white text-sm truncate">{m.name}</h3>
                          {getStatusBadge(m)}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> {m.ownerName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Smartphone className="w-3 h-3" /> {m.phoneNumber}
                          </span>
                          {m.email && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]">
                              <span className="text-slate-600">@</span> {m.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timeline Summary */}
                      <div className="text-[10px] text-slate-400 md:text-right min-w-[140px]">
                        {m.subscriptionStatus === 'active' && m.nextRenewalDate ? (
                          <div className="flex items-center md:justify-end gap-1">
                            <Calendar className="w-3 h-3 text-emerald-500" />
                            <span>Renews {new Date(m.nextRenewalDate).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <div className="flex items-center md:justify-end gap-1">
                            <Clock className="w-3 h-3 text-amber-500" />
                            <span>
                              {isTrialExpired ? 'Trial ended' : `${calculatedDaysLeft} days left`}
                              {' — '}{trialEnds.toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {m.rejectionReason && (
                          <p className="text-red-400 truncate max-w-[200px] md:ml-auto" title={m.rejectionReason}>
                            {m.rejectionReason}
                          </p>
                        )}
                      </div>

                      {/* Primary Actions */}
                      <div className="flex items-center gap-2 md:justify-end">
                        {m.subscriptionStatus === 'payment_pending' && (
                          <>
                            <button
                              onClick={() => handleApprovePayment(m.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-3 py-2 rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => handleOpenRejection(m.id)}
                              className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-extrabold text-[10px] px-3 py-2 rounded-lg transition cursor-pointer flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {m.subscriptionStatus === 'suspended' && (
                          <button
                            onClick={() => handleSuspendStore(m.id, false)}
                            className="bg-emerald-950 border border-emerald-900 text-emerald-400 hover:bg-emerald-900 transition font-bold text-[10px] px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" /> Restore
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedMerchant(m); setShowDevControls(false); }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-[10px] px-3 py-2 rounded-lg transition cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* MERCHANT DETAIL MODAL */}
      {selectedMerchant && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 my-8 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black text-white">{selectedMerchant.name}</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">{selectedMerchant.category} — ID: {selectedMerchant.id.slice(0, 8)}</p>
              </div>
              <button
                onClick={() => setSelectedMerchant(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-500 block">Owner</span>
                <span className="text-slate-200 font-bold block">{selectedMerchant.ownerName}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-500 block">Phone</span>
                <span className="text-slate-200 font-bold block">{selectedMerchant.phoneNumber}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-500 block">Email</span>
                <span className="text-slate-200 font-bold block truncate">{selectedMerchant.email || 'Not provided'}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-500 block">Status</span>
                <div className="pt-0.5">{getStatusBadge(selectedMerchant)}</div>
              </div>
            </div>

            {/* Email Verification */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${selectedMerchant.isEmailVerified ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-xs font-bold text-slate-200">
                    {selectedMerchant.isEmailVerified ? 'Email Verified' : 'Email Unverified'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const updated = { ...selectedMerchant, isEmailVerified: !selectedMerchant.isEmailVerified };
                    onUpdateMerchant(updated);
                    setSelectedMerchant(updated);
                  }}
                  className="text-[10px] font-black bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer"
                >
                  {selectedMerchant.isEmailVerified ? 'Revoke Verification' : 'Verify Email'}
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <h4 className="text-[10px] font-black uppercase text-slate-500">Subscription Timeline</h4>
              {selectedMerchant.subscriptionStatus === 'active' ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Next Renewal</span>
                  <span className="text-emerald-400 font-bold">
                    {selectedMerchant.nextRenewalDate ? new Date(selectedMerchant.nextRenewalDate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Trial Ends</span>
                  <span className="text-amber-400 font-bold">
                    {selectedMerchant.trialEndsAt ? new Date(selectedMerchant.trialEndsAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              )}
              <button
                onClick={() => { setSelectedMerchant(null); handleOpenDateAdjuster(selectedMerchant); }}
                className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                <Calendar className="w-3 h-3" /> Adjust Timeline
              </button>
            </div>

            {/* Administrative Actions */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase text-slate-500">Administrative Actions</h4>
              <div className="flex flex-wrap gap-2">
                {selectedMerchant.subscriptionStatus === 'payment_pending' && (
                  <>
                    <button
                      onClick={() => { handleApprovePayment(selectedMerchant.id); setSelectedMerchant(null); }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-4 py-2 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve Payment
                    </button>
                    <button
                      onClick={() => { setSelectedMerchant(null); handleOpenRejection(selectedMerchant.id); }}
                      className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-extrabold text-[10px] px-4 py-2 rounded-lg transition cursor-pointer flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject Payment
                    </button>
                  </>
                )}
                {selectedMerchant.subscriptionStatus === 'suspended' ? (
                  <button
                    onClick={() => { handleSuspendStore(selectedMerchant.id, false); setSelectedMerchant(null); }}
                    className="bg-emerald-950 border border-emerald-900 text-emerald-400 hover:bg-emerald-900 transition font-bold text-[10px] px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Unlock className="w-3.5 h-3.5" /> Unsuspend Store
                  </button>
                ) : (
                  <button
                    onClick={() => { handleSuspendStore(selectedMerchant.id, true); setSelectedMerchant(null); }}
                    className="bg-red-950/50 hover:bg-red-950 border border-red-900 text-red-400 transition font-bold text-[10px] px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" /> Suspend Store
                  </button>
                )}
              </div>
            </div>

            {/* Development / Testing Controls */}
            <div className="border-t border-slate-800 pt-4">
              <button
                onClick={() => setShowDevControls(v => !v)}
                className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 hover:text-slate-300 transition cursor-pointer mb-3"
              >
                <Wrench className="w-3.5 h-3.5" />
                Development & Testing Controls
                <ChevronRight className={`w-3 h-3 transition-transform ${showDevControls ? 'rotate-90' : ''}`} />
              </button>
              
              {showDevControls && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] text-slate-500">These actions modify system dates for testing purposes only.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { handleForceTrialExpiry(selectedMerchant.id); setSelectedMerchant(null); }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-950/30 border border-amber-900/50 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" /> Force Trial Expiry
                    </button>
                    <button
                      onClick={() => { handleForceActiveExpiry(selectedMerchant.id); setSelectedMerchant(null); }}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-950/30 border border-amber-900/50 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3 h-3" /> Force Active Expiry
                    </button>
                    <button
                      onClick={() => { setSelectedMerchant(null); handleOpenDateAdjuster(selectedMerchant); }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-950/30 border border-indigo-900/50 px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
                    >
                      <Calendar className="w-3 h-3" /> Adjust Timeline
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Input Modal */}
      {rejectionModalMerchantId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Rejection Reason</h3>
            <p className="text-xs text-slate-400">Specify why the payment was rejected. The merchant will see this and be allowed to resubmit their details.</p>
            
            <textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-red-500"
              placeholder="e.g. Deposit reference not matching..."
            />

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRejectionModalMerchantId(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRejection}
                className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-black px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Confirm Rejection & Notify Shop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Adjuster Modal */}
      {dateModalMerchant && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Adjust System Dates</h3>
            <p className="text-[11px] text-slate-400 leading-normal">
              Adjust the system dates for <strong>{dateModalMerchant.name}</strong> to test trial expired lockout state and renewal warning states instantly.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Trial Ends At
                </label>
                <input
                  type="date"
                  value={customTrialDate}
                  onChange={(e) => setCustomTrialDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                  Next Renewal Date (Active Plans)
                </label>
                <input
                  type="date"
                  value={customRenewalDate}
                  onChange={(e) => setCustomRenewalDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDateModalMerchant(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDates}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Save Timeline Changes
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}