/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShopRecord } from '../auth/shopAuth';
import { ShopProfile } from '../types';
import { BUSINESS_CATEGORIES } from '../data';
import {
  ArrowLeft, Save, Store, Clock, ShieldCheck, Bell,
  HelpCircle, FileText, Lock, Info, LogOut, ChevronRight,
  Upload, X, Loader2, CheckCircle, AlertCircle, User
} from 'lucide-react';

interface SettingsPageProps {
  shop: ShopRecord | ShopProfile | any;
  onUpdateShop: (updated: any) => void | Promise<void>;
  onBackToDashboard: () => void;
  onLogout: () => void;
}

type SettingsTab =
  | 'info' | 'hours' | 'subscription' | 'account'
  | 'notifications' | 'help' | 'terms' | 'privacy' | 'about';

const NOTIFICATION_KEYS = {
  lowStock:     'blizflow_notify_low_stock',
  subscription: 'blizflow_notify_subscription',
  system:       'blizflow_notify_system',
};

export default function SettingsPage({
  shop,
  onUpdateShop,
  onBackToDashboard,
  onLogout,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('info');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Business profile fields
  const [name, setName]               = useState(shop.name);
  const [ownerName, setOwnerName]     = useState(shop.ownerName);
  const [phoneNumber, setPhoneNumber] = useState(shop.phoneNumber);
  const [address, setAddress]         = useState(shop.address || '');
  const [category, setCategory]       = useState(shop.category || '');
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  // Hours
  const [openTime, setOpenTime]   = useState('08:00');
  const [closeTime, setCloseTime] = useState('18:00');
  const [isSavingHours, setIsSavingHours] = useState(false);

  // Notification preferences
  const [notifyLowStock, setNotifyLowStock] = useState(() =>
    localStorage.getItem(NOTIFICATION_KEYS.lowStock) !== 'false'
  );
  const [notifySubscription, setNotifySubscription] = useState(() =>
    localStorage.getItem(NOTIFICATION_KEYS.subscription) !== 'false'
  );
  const [notifySystem, setNotifySystem] = useState(() =>
    localStorage.getItem(NOTIFICATION_KEYS.system) !== 'false'
  );

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_KEYS.lowStock,     String(notifyLowStock));
  }, [notifyLowStock]);
  useEffect(() => {
    localStorage.setItem(NOTIFICATION_KEYS.subscription, String(notifySubscription));
  }, [notifySubscription]);
  useEffect(() => {
    localStorage.setItem(NOTIFICATION_KEYS.system,       String(notifySystem));
  }, [notifySystem]);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    if (!name.trim() || !ownerName.trim() || !phoneNumber.trim()) {
      setNotification({ type: 'error', message: 'Name, owner name, and phone are required.' });
      return;
    }
    setIsSavingInfo(true);
    try {
      await onUpdateShop({
        name:        name.trim(),
        ownerName:   ownerName.trim(),
        phoneNumber: phoneNumber.trim(),
        address:     address.trim(),
        category:    category.trim(),
      });
      setNotification({ type: 'success', message: 'Business profile saved successfully.' });
    } catch (err) {
      setNotification({ type: 'error', message: 'Failed to save. Please check your connection.' });
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    setIsSavingHours(true);
    try {
      await onUpdateShop({ openingHours: { open: openTime, close: closeTime } } as any);
      setNotification({ type: 'success', message: 'Business hours saved successfully.' });
    } catch (err) {
      setNotification({ type: 'error', message: 'Failed to save hours. Please check your connection.' });
    } finally {
      setIsSavingHours(false);
    }
  };

  const TabBtn = ({ tab, icon: Icon, label }: { tab: SettingsTab; icon: React.ElementType; label: string }) => (
    <button
      onClick={() => { setActiveTab(tab); setNotification(null); }}
      className={`w-full text-left font-bold text-xs px-3.5 py-3 rounded-xl transition flex items-center gap-2 cursor-pointer ${
        activeTab === tab
          ? 'bg-indigo-600 text-white shadow-xs'
          : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const SectionLabel = ({ label }: { label: string }) => (
    <div className="px-3.5 pt-4 pb-1">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen pb-16 font-sans">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">

        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={onBackToDashboard}
            className="text-slate-500 hover:text-slate-900 p-1.5 hover:bg-slate-100 rounded-xl cursor-pointer transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">System Preferences</span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">Business Settings</h1>
          </div>
        </div>

        {/* Notification banner */}
        {notification && (
          <div className={`mb-6 border p-4 rounded-xl text-xs flex items-start gap-2.5 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
              : 'bg-red-50 border-red-100 text-red-800'
          }`} role="alert" aria-live="polite">
            {notification.type === 'success'
              ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-6 items-start">

          {/* Sidebar */}
          <div className="space-y-0 md:col-span-1">
            <SectionLabel label="Business" />
            <TabBtn tab="info"  icon={Store} label="Business Profile" />
            <TabBtn tab="hours" icon={Clock} label="Business Hours" />

            <SectionLabel label="Subscription" />
            <TabBtn tab="subscription" icon={ShieldCheck} label="Plan & Status" />

            <SectionLabel label="Account" />
            <TabBtn tab="account"       icon={User}        label="Account Info" />
            <TabBtn tab="notifications" icon={Bell}        label="Notifications" />

            <SectionLabel label="Help & Legal" />
            <TabBtn tab="help"    icon={HelpCircle} label="Help & Support" />
            <TabBtn tab="terms"   icon={FileText}   label="Terms & Conditions" />
            <TabBtn tab="privacy" icon={Lock}       label="Privacy Policy" />
            <TabBtn tab="about"   icon={Info}       label="About BlizFlow" />

            <div className="pt-4">
              <button onClick={onLogout}
                className="w-full text-left font-bold text-xs px-3.5 py-3 rounded-xl transition flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 cursor-pointer">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs md:col-span-3 min-h-[400px]">

            {/* BUSINESS PROFILE */}
            {activeTab === 'info' && (
              <form onSubmit={handleSaveInfo} className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Store className="w-4 h-4 text-indigo-600" /> Business Profile
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Business Name *</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Owner Name *</label>
                    <input type="text" value={ownerName} onChange={e => setOwnerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone Number *</label>
                    <input type="text" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition text-slate-700">
                      {BUSINESS_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition" />
                </div>
                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={isSavingInfo}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-3 rounded-xl transition cursor-pointer flex items-center gap-1.5">
                    {isSavingInfo
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save Profile</>}
                  </button>
                </div>
              </form>
            )}

            {/* BUSINESS HOURS */}
            {activeTab === 'hours' && (
              <form onSubmit={handleSaveHours} className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" /> Business Hours
                </h3>
                <p className="text-xs text-slate-500">Set your standard daily trading hours.</p>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Opening Time</label>
                    <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition font-mono font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Closing Time</label>
                    <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition font-mono font-bold" />
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={isSavingHours}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-3 rounded-xl transition cursor-pointer flex items-center gap-1.5">
                    {isSavingHours
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      : <><Save className="w-4 h-4" /> Save Hours</>}
                  </button>
                </div>
              </form>
            )}

            {/* SUBSCRIPTION — FIX 3: read-only status, no payment form */}
            {activeTab === 'subscription' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" /> Plan & Status
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shop ID</span>
                      <p className="text-lg font-black text-slate-900 font-mono">{shop.shopId || shop.id}</p>
                    </div>
                    <span className={`font-black text-[10px] uppercase px-3 py-1.5 rounded-full border ${
                      shop.status === 'active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : shop.status === 'pending'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}>
                      {shop.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Plan</span>
                      <span className="font-bold text-slate-800 capitalize">{shop.plan || 'Starter'}</span>
                    </div>
                    {shop.activatedAt && (
                      <div>
                        <span className="text-slate-400 block">Activated</span>
                        <span className="font-bold text-slate-800">{new Date(shop.activatedAt).toLocaleDateString('en-ZA')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* FIX 3: No payment form — admin controls activation */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-900 leading-relaxed">
                  <p className="font-bold mb-1">Need to upgrade or renew?</p>
                  <p>Contact BlizFlow support to change your plan or reactivate your shop.</p>
                  <p className="mt-2">📧 support@blizflow.co.za</p>
                  <p>💬 WhatsApp: +27 67 329 3260</p>
                </div>

                {/* Feature list */}
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="text-left px-4 py-2.5 font-bold text-slate-600">Feature</th>
                        <th className="text-center px-4 py-2.5 font-bold text-indigo-700 w-28">Your Plan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        'Unlimited Product Catalog',
                        'POS Sales & Checkout',
                        'Inventory Management',
                        'Sales Reports & History',
                        'Expense Tracking',
                        'Barcode Scanning',
                        'AI Business Insights',
                      ].map(feature => (
                        <tr key={feature} className="bg-white">
                          <td className="px-4 py-2.5 text-slate-700 font-medium">{feature}</td>
                          <td className="px-4 py-2.5 text-center">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ACCOUNT INFO — FIX 1 + 2: no password change, no old auth sessions */}
            {activeTab === 'account' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" /> Account Info
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Shop ID</span>
                    <span className="font-mono font-black text-slate-900">{shop.shopId || shop.id}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Business Name</span>
                    <span className="font-bold text-slate-800">{shop.name}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Owner</span>
                    <span className="font-bold text-slate-800">{shop.ownerName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Phone</span>
                    <span className="font-bold text-slate-800">{shop.phoneNumber}</span>
                  </div>
                  {shop.email && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Email</span>
                      <span className="font-bold text-slate-800">{shop.email}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Status</span>
                    <span className={`font-black uppercase ${
                      shop.status === 'active' ? 'text-emerald-600' :
                      shop.status === 'pending' ? 'text-amber-600' : 'text-red-600'
                    }`}>{shop.status}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Account Created</span>
                    <span className="font-bold text-slate-800">{shop.createdAt ? new Date(shop.createdAt).toLocaleDateString('en-ZA') : 'Recently'}</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
                  <p className="font-bold mb-1">Need to change your PIN?</p>
                  <p>Contact BlizFlow support and we will reset your PIN securely.</p>
                  <p className="mt-1">📧 support@blizflow.co.za</p>
                </div>
              </div>
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-600" /> Notification Preferences
                </h3>
                <p className="text-xs text-slate-500">Preferences are saved automatically.</p>
                {[
                  { key: 'lowStock', label: 'Low-Stock Alerts', desc: 'Get notified when products fall below minimum stock.', state: notifyLowStock, set: setNotifyLowStock },
                  { key: 'subscription', label: 'Subscription Reminders', desc: 'Reminders about plan status and changes.', state: notifySubscription, set: setNotifySubscription },
                  { key: 'system', label: 'System Notifications', desc: 'Important account messages and updates.', state: notifySystem, set: setNotifySystem },
                ].map(item => (
                  <div key={item.key} className="flex items-start justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{item.label}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button type="button" onClick={() => item.set((v: boolean) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${item.state ? 'bg-indigo-600' : 'bg-slate-300'}`}
                      role="switch" aria-checked={item.state}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.state ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* HELP */}
            {activeTab === 'help' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-indigo-600" /> Help & Support
                </h3>
                <div className="space-y-3">
                  {[
                    { title: 'Getting Started', body: 'Set up your business profile and add products. Use the Dashboard to monitor daily sales and stock.' },
                    { title: 'POS Help', body: 'Use Quick Favourites for fast-selling items or search the catalog. Complete checkout with cash, card, or mobile payment.' },
                    { title: 'Products & Inventory', body: 'Add products with names, categories, prices, and stock quantities. Set low-stock thresholds for alerts.' },
                    { title: 'Barcode Scanning', body: 'Use the camera scanner on the POS screen to scan product barcodes directly. Works on Chrome and Edge browsers over HTTPS.' },
                    { title: 'Account Help', body: 'Your Shop ID and PIN are managed by BlizFlow. Contact support to reset your PIN or update account details.' },
                    { title: 'Contact Support', body: 'Email support@blizflow.co.za with your Shop ID and a description of your issue. WhatsApp: +27 67 329 3260' },
                  ].map(item => (
                    <div key={item.title} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                      <p className="text-[10px] text-slate-600 leading-relaxed mt-1">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TERMS */}
            {activeTab === 'terms' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" /> Terms & Conditions
                </h3>
                <div className="space-y-4 text-xs text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                  {[
                    ['1. What BlizFlow Provides', 'BlizFlow is a point-of-sale and inventory management platform for small merchants. We provide tools to manage products, record sales, track stock, and monitor business performance.'],
                    ['2. Access Model', 'Access is granted via a Shop ID and PIN assigned by BlizFlow. You are responsible for keeping your PIN confidential. Do not share your PIN with unauthorized persons.'],
                    ['3. Merchant Responsibilities', 'You are responsible for the accuracy of your business data, product information, and pricing. Comply with all applicable laws regarding sales and consumer protection.'],
                    ['4. Shop Status', 'Your shop access is controlled by BlizFlow administrators. Access may be suspended for violations of these terms or non-payment of agreed fees.'],
                    ['5. Acceptable Use', 'Do not use BlizFlow for illegal activities, fraud, or harmful content. We reserve the right to suspend shops that violate these terms.'],
                    ['6. Business Data', 'You retain ownership of your business data. We store it securely using Firebase infrastructure.'],
                    ['7. Service Availability', 'We aim for high availability but do not guarantee uninterrupted service.'],
                    ['8. Contact', 'For questions: support@blizflow.co.za'],
                  ].map(([title, body]) => (
                    <section key={title as string}>
                      <h4 className="font-black text-slate-900 text-sm mb-1">{title}</h4>
                      <p>{body}</p>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {/* PRIVACY */}
            {activeTab === 'privacy' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" /> Privacy Policy
                </h3>
                <div className="space-y-4 text-xs text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                  {[
                    ['1. Information We Collect', 'Business profile (name, owner, phone, address, category), products (names, prices, stock), sales data (amounts, items, timestamps), and expenses.'],
                    ['2. How We Use Information', 'To provide the BlizFlow service. We do not sell your data to third parties.'],
                    ['3. Data Storage', 'Stored in Google Firebase (Firestore). Firebase provides industry-standard encryption and access controls.'],
                    ['4. PIN Security', 'Your Shop PIN is stored as a cryptographic hash using PBKDF2-SHA256. The plain PIN is never stored anywhere.'],
                    ['5. Data Retention', 'Retained while your account is active. Contact support to request deletion.'],
                    ['6. Your Rights', 'You may access, correct, or request deletion of your data by contacting support@blizflow.co.za.'],
                    ['7. Contact', 'support@blizflow.co.za'],
                  ].map(([title, body]) => (
                    <section key={title as string}>
                      <h4 className="font-black text-slate-900 text-sm mb-1">{title}</h4>
                      <p>{body}</p>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {/* ABOUT */}
            {activeTab === 'about' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-600" /> About BlizFlow
                </h3>
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-14 h-14 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-indigo-600/20">
                    <Store className="w-7 h-7" />
                  </div>
                  <h2 className="text-xl font-black text-slate-950 tracking-tight">BlizFlow</h2>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                    The smart point-of-sale and inventory platform built for South African spaza shops, small retailers, and township entrepreneurs.
                  </p>
                  <span className="inline-block bg-white border border-indigo-100 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-full">Version 2.0</span>
                </div>
                <div className="space-y-2">
                  {(['terms', 'privacy'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                      <span className="flex items-center gap-2">
                        {tab === 'terms' ? <FileText className="w-4 h-4 text-slate-400" /> : <Lock className="w-4 h-4 text-slate-400" />}
                        {tab === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </button>
                  ))}
                </div>
                <div className="text-center pt-2">
                  <p className="text-[10px] text-slate-400">© {new Date().getFullYear()} BlizFlow. All rights reserved.</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">support@blizflow.co.za</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}