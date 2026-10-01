/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { updateUserPassword } from '../services/customAuth';
import { ShopProfile } from '../types';
import { BUSINESS_CATEGORIES } from '../data';
import { getRecognizedSessions, revokeSession, SessionContext } from '../auth/sessionSecurity';
import { getSecurityEvents, SecurityEvent, logSecurityEvent } from '../auth/authEvents';
import {
  ArrowLeft,
  Save,
  Store,
  Clock,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  CheckCircle,
  User,
  Bell,
  HelpCircle,
  FileText,
  Lock,
  Eye,
  EyeOff,
  Info,
  LogOut,
  ChevronRight,
  Upload,
  X,
  Loader2,
  Laptop,
  Smartphone,
  ShieldAlert,
  Trash2,
  History
} from 'lucide-react';

interface SettingsPageProps {
  shop: ShopProfile;
  onUpdateShop: (updated: ShopProfile) => void | Promise<void>;
  onBackToDashboard: () => void;
  onLogout: () => void;
}

type SettingsTab =
  | 'info'
  | 'hours'
  | 'subscription'
  | 'account'
  | 'notifications'
  | 'help'
  | 'terms'
  | 'privacy'
  | 'about';

const NOTIFICATION_KEYS = {
  lowStock: 'blizflow_notify_low_stock',
  subscription: 'blizflow_notify_subscription',
  system: 'blizflow_notify_system',
};

export default function SettingsPage({
  shop,
  onUpdateShop,
  onBackToDashboard,
  onLogout,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('info');

  // ── Shop states (existing) ──
  const [name, setName] = useState(shop.name);
  const [ownerName, setOwnerName] = useState(shop.ownerName);
  const [phoneNumber, setPhoneNumber] = useState(shop.phoneNumber);
  const [address, setAddress] = useState(shop.address);
  const [category, setCategory] = useState(shop.category);
  const [description, setDescription] = useState(shop.description || '');
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl || '');
  const [coverUrl, setCoverUrl] = useState(shop.coverUrl || '');

  // ── Hours states (existing) ──
  const [openTime, setOpenTime] = useState(shop.openingHours?.open || '08:00');
  const [closeTime, setCloseTime] = useState(shop.openingHours?.close || '18:00');

  // ── Notification banner (existing) ──
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Notification preferences (new) ──
  const [notifyLowStock, setNotifyLowStock] = useState(() => {
    const v = localStorage.getItem(NOTIFICATION_KEYS.lowStock);
    return v === null ? true : v === 'true';
  });
  const [notifySubscription, setNotifySubscription] = useState(() => {
    const v = localStorage.getItem(NOTIFICATION_KEYS.subscription);
    return v === null ? true : v === 'true';
  });
  const [notifySystem, setNotifySystem] = useState(() => {
    const v = localStorage.getItem(NOTIFICATION_KEYS.system);
    return v === null ? true : v === 'true';
  });

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_KEYS.lowStock, String(notifyLowStock));
  }, [notifyLowStock]);
  useEffect(() => {
    localStorage.setItem(NOTIFICATION_KEYS.subscription, String(notifySubscription));
  }, [notifySubscription]);
  useEffect(() => {
    localStorage.setItem(NOTIFICATION_KEYS.system, String(notifySystem));
  }, [notifySystem]);

  // ── Password change states (new) ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // ── Subscription calculations ──
  const now = new Date();
  const trialEnd = shop.trialEndsAt ? new Date(shop.trialEndsAt) : null;
  const renewalDate = shop.nextRenewalDate ? new Date(shop.nextRenewalDate) : null;
  const trialDaysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const isTrial = shop.subscriptionStatus === 'trial' || !shop.subscriptionStatus;
  const isActive = shop.subscriptionStatus === 'active';
  const isExpired = shop.subscriptionStatus === 'expired';
  const showTrialWarning = isTrial && trialDaysLeft > 0 && trialDaysLeft <= 3;

  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isSavingHours, setIsSavingHours] = useState(false);

  // ── Existing handlers ──
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    if (!name.trim() || !ownerName.trim() || !phoneNumber.trim() || !address.trim()) {
      setNotification({ type: 'error', message: 'All profile info fields except description are required.' });
      return;
    }
    setIsSavingInfo(true);
    try {
      await onUpdateShop({
        ...shop,
        name: name.trim(),
        ownerName: ownerName.trim(),
        phoneNumber: phoneNumber.trim(),
        address: address.trim(),
        category,
        description: description.trim(),
        logoUrl,
        coverUrl,
      });
      setNotification({ type: 'success', message: 'Store profile details saved and synced to database successfully!' });
    } catch (err: unknown) {
      console.error('[SettingsPage] Error saving profile:', err);
      setNotification({ type: 'error', message: 'Failed to sync changes to database. Please check your connection.' });
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    setIsSavingHours(true);
    try {
      await onUpdateShop({
        ...shop,
        openingHours: { open: openTime, close: closeTime },
      });
      setNotification({ type: 'success', message: 'Business operational hours updated and synced successfully!' });
    } catch (err: unknown) {
      console.error('[SettingsPage] Error saving hours:', err);
      setNotification({ type: 'error', message: 'Failed to sync hours to database. Please check your connection.' });
    } finally {
      setIsSavingHours(false);
    }
  };

  // ── Password change handler ──
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    if (!currentPassword.trim() || !newPassword.trim()) {
      setNotification({ type: 'error', message: 'Please fill in all password fields.' });
      return;
    }
    if (newPassword.length < 6) {
      setNotification({ type: 'error', message: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotification({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setChangingPassword(true);
    try {
      await updateUserPassword(currentPassword, newPassword);
      setNotification({ type: 'success', message: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      let msg = 'Unable to change password. Please try again.';
      if (err instanceof Error) {
        msg = err.message;
      }
      setNotification({ type: 'error', message: msg });
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Logo / Cover upload helpers ──
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') setLogoUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') setCoverUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // ── Sidebar tab button helper ──
  const TabBtn = ({
    tab,
    icon: Icon,
    label,
  }: {
    tab: SettingsTab;
    icon: React.ElementType;
    label: string;
  }) => (
    <button
      onClick={() => {
        setActiveTab(tab);
        setNotification(null);
      }}
      className={`w-full text-left font-bold text-xs px-3.5 py-3 rounded-xl transition flex items-center gap-2 cursor-pointer ${
        activeTab === tab
          ? 'bg-indigo-600 text-white shadow-xs'
          : 'bg-white border border-slate-100 text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  // ── Section header helper ──
  const SectionLabel = ({ label }: { label: string }) => (
    <div className="px-3.5 pt-4 pb-1">
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-screen pb-16 font-sans">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToDashboard}
              className="text-slate-500 hover:text-slate-900 transition p-1.5 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">System Preferences</span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">Business Settings</h1>
            </div>
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div
            className={`mb-6 border p-4 rounded-xl text-xs flex items-start gap-2.5 ${
              notification.type === 'success'
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                : 'bg-red-50 border-red-100 text-red-800'
            }`}
            role="alert"
            aria-live="polite"
          >
            {notification.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main grid */}
        <div className="grid md:grid-cols-4 gap-6 items-start">
          {/* Sidebar */}
          <div className="space-y-0 md:col-span-1">
            <SectionLabel label="Business" />
            <TabBtn tab="info" icon={Store} label="Business Profile" />
            <TabBtn tab="hours" icon={Clock} label="Business Hours" />

            <SectionLabel label="Subscription" />
            <TabBtn tab="subscription" icon={ShieldCheck} label="Plan & Subscription" />

            <SectionLabel label="Account" />
            <TabBtn tab="account" icon={User} label="Account & Security" />
            <TabBtn tab="notifications" icon={Bell} label="Notifications" />

            <SectionLabel label="Help & Legal" />
            <TabBtn tab="help" icon={HelpCircle} label="Help & Support" />
            <TabBtn tab="terms" icon={FileText} label="Terms & Conditions" />
            <TabBtn tab="privacy" icon={Lock} label="Privacy Policy" />
            <TabBtn tab="about" icon={Info} label="About BlizFlow" />

            <div className="pt-4">
              <button
                onClick={onLogout}
                className="w-full text-left font-bold text-xs px-3.5 py-3 rounded-xl transition flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>

          {/* Content Panel */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs md:col-span-3 min-h-[400px]">
            {/* ── BUSINESS PROFILE ── */}
            {activeTab === 'info' && (
              <form onSubmit={handleSaveInfo} className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Store className="w-4 h-4 text-indigo-600" /> Business Profile
                </h3>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Business Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Owner / Representative <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Business Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition text-slate-700"
                    >
                      {BUSINESS_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Physical Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Business Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Tell customers what makes your shop special..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition resize-none"
                  />
                </div>

                {/* Logo Upload */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Business Logo
                  </label>
                  <div className="flex items-center gap-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
                    <div className="relative w-16 h-16 rounded-xl border border-slate-200 bg-white overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} id="settings-logo-input" className="hidden" />
                      <label
                        htmlFor="settings-logo-input"
                        className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" /> Choose Logo
                      </label>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="ml-2 text-[10px] text-red-600 font-bold hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cover Upload */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Business Cover Photo
                  </label>
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 space-y-3">
                    {coverUrl ? (
                      <div className="relative w-full h-32 rounded-lg border border-slate-200 overflow-hidden bg-white">
                        <img src={coverUrl} alt="Cover" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setCoverUrl('')}
                          className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg text-xs font-semibold shadow-md cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="w-full h-32 rounded-lg bg-white border border-slate-100 flex flex-col items-center justify-center text-center">
                        <Upload className="w-8 h-8 text-slate-400 mb-2" />
                        <span className="text-sm font-bold text-slate-700">Upload cover photo</span>
                        <p className="text-xs text-slate-400 mt-1">Recommended: 800x400 landscape</p>
                      </div>
                    )}
                    <div>
                      <input type="file" accept="image/*" onChange={handleCoverUpload} id="settings-cover-input" className="hidden" />
                      <label
                        htmlFor="settings-cover-input"
                        className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" /> Choose Cover Image
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingInfo}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingInfo ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving & Syncing...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" /> Save Profile Details
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* ── BUSINESS HOURS ── */}
            {activeTab === 'hours' && (
              <form onSubmit={handleSaveHours} className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600" /> Business Hours
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Set your standard daily trading hours. These display to customers in the BlizFlow directory.
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-sm">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Opening Time</label>
                    <input
                      type="time"
                      value={openTime}
                      onChange={(e) => setOpenTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Closing Time</label>
                    <input
                      type="time"
                      value={closeTime}
                      onChange={(e) => setCloseTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition font-mono font-bold"
                    />
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingHours}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingHours ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving & Syncing...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" /> Save Business Hours
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* ── PLAN & SUBSCRIPTION ── */}
            {activeTab === 'subscription' && (
              <div className="space-y-6">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" /> Plan & Subscription
                </h3>

                {/* Status Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Plan</span>
                      <h4 className="text-lg font-black text-slate-900 mt-0.5 capitalize">
                        BlizFlow {shop.plan || 'Starter'}
                      </h4>
                    </div>
                    <span
                      className={`self-start font-black text-[10px] uppercase px-3 py-1.5 rounded-full border ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : isExpired
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : showTrialWarning
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      {isActive ? 'Active Premium' : isExpired ? 'Expired' : isTrial ? 'Free Trial' : shop.subscriptionStatus || 'Active'}
                    </span>
                  </div>

                  {isTrial && trialDaysLeft > 0 && (
                    <div className={`text-xs font-bold ${showTrialWarning ? 'text-amber-700' : 'text-slate-600'}`}>
                      {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining in your 5-day trial.
                      {showTrialWarning && ' Upgrade soon to avoid interruption.'}
                    </div>
                  )}
                  {isTrial && trialDaysLeft === 0 && (
                    <div className="text-xs font-bold text-red-700">Your trial has ended. Upgrade to continue full access.</div>
                  )}
                  {isActive && renewalDate && (
                    <div className="text-xs text-slate-600">
                      Next renewal: <strong>{renewalDate.toLocaleDateString('en-ZA')}</strong>
                    </div>
                  )}
                  {isExpired && (
                    <div className="text-xs text-red-700 font-medium">
                      Your subscription has expired. Renew to restore full POS and inventory access.
                    </div>
                  )}
                </div>

                {/* Feature Comparison */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Feature Comparison</span>
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="text-left px-4 py-2.5 font-bold text-slate-600">Feature</th>
                          <th className="text-center px-4 py-2.5 font-bold text-slate-500 w-28">Free / Limited</th>
                          <th className="text-center px-4 py-2.5 font-bold text-indigo-700 w-28">Starter R100/mo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          ['Unlimited Product Catalog', false, true],
                          ['POS Sales & Checkout', false, true],
                          ['Inventory Management', false, true],
                          ['Sales Reports & History', false, true],
                          ['Expense Tracking', false, true],
                          ['Email Support', false, true],
                          ['Barcode Scanning', false, true],
                          ['AI Business Insights', false, true],
                        ].map(([feature, free, premium]) => (
                          <tr key={String(feature)} className="bg-white">
                            <td className="px-4 py-2.5 text-slate-700 font-medium">{feature}</td>
                            <td className="px-4 py-2.5 text-center">
                              {free ? (
                                <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <span className="text-slate-300 font-bold">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {premium ? (
                                <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <span className="text-slate-300 font-bold">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Billing & Renew */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Billing & Renewal</span>
                  <div className="bg-indigo-50/65 rounded-2xl p-5 text-xs text-indigo-950 border border-indigo-100/50 space-y-2 leading-relaxed">
                    <p className="font-bold text-indigo-900 mb-1">Direct EFT Payment</p>
                    <p>Pay <strong>R 100.00 / month</strong> via EFT using your Merchant ID as reference:</p>
                    <div className="bg-white/80 p-3 rounded-xl border border-indigo-100 font-mono mt-2 space-y-1">
                      <p>Bank: Capitec Bank</p>
                      <p>Account: 5284973665070474</p>
                      <p>Type: Savings (Branch: 868)</p>
                      <p>
                        Reference: <span className="font-bold text-indigo-800">{shop.id}</span>
                      </p>
                    </div>
                    <p className="text-[10px] text-indigo-900/70 pt-1">
                      Email proof of payment to support@blizflow.co.za for activation.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isActive}
                    className={`w-full py-3 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-700 cursor-default'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <CheckCircle className="w-4 h-4" /> Subscription Active
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Renew Subscription
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ── ACCOUNT & SECURITY ── */}
            {activeTab === 'account' && (
              <div className="space-y-6">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" /> Account & Security
                </h3>

                {/* Account Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Account Email</span>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">{shop.email || 'Not set'}</p>
                    </div>
                    <span
                      className={`font-black text-[10px] uppercase px-2.5 py-1 rounded-full border ${
                        shop.isEmailVerified
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {shop.isEmailVerified ? 'Verified' : 'Unverified'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Account Status</span>
                    <span className="font-bold text-slate-800">{shop.status === 'open' ? 'Active & Trading' : 'Paused'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Merchant ID</span>
                    <span className="font-mono font-bold text-slate-800">{shop.id}</span>
                  </div>
                </div>

                {/* Active Recognized Sessions */}
                <div className="border-t border-slate-100 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Laptop className="w-4 h-4 text-indigo-600" /> Recognized Sessions & Devices
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">Privacy-preserving active browser sessions for your store</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {getRecognizedSessions().map((s) => (
                      <div key={s.sessionId} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            {s.deviceLabel.includes('Phone') || s.deviceLabel.includes('Android') || s.deviceLabel.includes('iOS') ? (
                              <Smartphone className="w-4 h-4" />
                            ) : (
                              <Laptop className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-800">{s.deviceLabel}</span>
                              {s.isCurrent && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded-full">Current Device</span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              Active: {new Date(s.lastActiveAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        {!s.isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              revokeSession(s.sessionId);
                              logSecurityEvent('SESSION_REVOKED', {
                                email: shop.email,
                                sessionId: s.sessionId,
                                reason: 'Revoked by user via Settings'
                              });
                              setNotification({ type: 'success', message: 'Session revoked successfully.' });
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Revoke session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Security Audit Telemetry */}
                <div className="border-t border-slate-100 pt-5 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-indigo-600" /> Security Audit Log
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {getSecurityEvents().slice(0, 8).map((evt) => (
                      <div key={evt.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-indigo-900">{evt.type}</span>
                            {evt.riskScore !== undefined && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                evt.riskScore >= 70 ? 'bg-red-100 text-red-700' : evt.riskScore >= 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                Risk: {evt.riskScore}
                              </span>
                            )}
                          </div>
                          {evt.reason && <p className="text-[10px] text-slate-500 mt-0.5">{evt.reason}</p>}
                        </div>
                        <span className="text-[10px] text-slate-400">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {getSecurityEvents().length === 0 && (
                      <p className="text-xs text-slate-400 italic">No recent security events recorded.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {activeTab === 'notifications' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-600" /> Notification Preferences
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Choose which alerts you want to receive. Preferences are saved automatically.
                </p>

                {[
                  {
                    key: 'lowStock',
                    label: 'Low-Stock Alerts',
                    desc: 'Get notified when products fall below their minimum stock level.',
                    state: notifyLowStock,
                    set: setNotifyLowStock,
                  },
                  {
                    key: 'subscription',
                    label: 'Subscription Reminders',
                    desc: 'Receive reminders about trial expiry and subscription renewal.',
                    state: notifySubscription,
                    set: setNotifySubscription,
                  },
                  {
                    key: 'system',
                    label: 'Important Account Notifications',
                    desc: 'System updates, security alerts, and critical account messages.',
                    state: notifySystem,
                    set: setNotifySystem,
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start justify-between gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{item.label}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => item.set((v: boolean) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                        item.state ? 'bg-indigo-600' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={item.state}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          item.state ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── HELP & SUPPORT ── */}
            {activeTab === 'help' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-indigo-600" /> Help & Support
                </h3>

                <div className="space-y-3">
                  {[
                    {
                      title: 'Getting Started',
                      body: 'Set up your business profile, add products, and configure your opening hours. Use the Dashboard to monitor daily sales and stock levels.',
                    },
                    {
                      title: 'POS Help',
                      body: 'Use Quick Favourites for fast-selling items, or search the full catalog. The cart enforces stock limits automatically. Complete checkout with cash, card, or mobile payment.',
                    },
                    {
                      title: 'Products & Inventory',
                      body: 'Add products with names, categories, prices, and stock quantities. Set low-stock thresholds to receive alerts. Update stock levels as you receive new deliveries.',
                    },
                    {
                      title: 'Subscription Help',
                      body: 'Start with a 5-day free trial. After trial, upgrade to Premium (R199/month) via EFT to unlock unlimited products, POS, reports, and support.',
                    },
                    {
                      title: 'Account Help',
                      body: 'Keep your email address current for important notifications. Verify your email to ensure reliable delivery of alerts and receipts.',
                    },
                    {
                      title: 'Contact Support',
                      body: 'For assistance, email support@blizflow.co.za with your Merchant ID and a description of your issue.',
                    },
                  ].map((item) => (
                    <div key={item.title} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                      <p className="text-[10px] text-slate-600 leading-relaxed mt-1">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TERMS & CONDITIONS ── */}
            {activeTab === 'terms' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" /> Terms & Conditions
                </h3>
                <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 text-[10px] text-amber-800 font-bold">
                  This is a V1 draft for review before publication. It does not constitute final legal advice.
                </div>
                <div className="space-y-4 text-xs text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">1. What BlizFlow Provides</h4>
                    <p>
                      BlizFlow is a point-of-sale and inventory management platform designed for small merchants. We provide tools to manage products, record sales, track stock, and monitor business performance. Service availability depends on your subscription status and internet connectivity.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">2. Merchant Responsibilities</h4>
                    <p>
                      You are responsible for the accuracy of your business data, product information, and pricing. You must comply with all applicable laws regarding sales, taxation, and consumer protection in your jurisdiction.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">3. Account & Access</h4>
                    <p>
                      You must provide accurate information during registration. You are responsible for maintaining the confidentiality of your account password. Notify us immediately of any unauthorized access.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">4. Trial Period</h4>
                    <p>
                      New accounts receive a 5-day free trial with full feature access. No payment is required during the trial. After the trial ends, you must subscribe to Premium to continue using advanced features.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">5. Subscription & Pricing</h4>
                    <p>
                      Premium subscription is R199 per month, payable via direct EFT. Use your Merchant ID as payment reference. Subscription fees are subject to change with 30 days notice.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">6. Subscription Expiry</h4>
                    <p>
                      If payment is not received by the renewal date, your subscription will expire. Expired accounts retain access to view business data and the subscription renewal area, but POS and inventory editing may be restricted. We never delete your merchant data due to expiry.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">7. Acceptable Use</h4>
                    <p>
                      Do not use BlizFlow for illegal activities, fraud, or to distribute harmful content. We reserve the right to suspend accounts that violate these terms.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">8. Business Data</h4>
                    <p>
                      You retain ownership of your business data. We store it securely using Firebase infrastructure. You are responsible for maintaining backups of critical business records.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">9. Service Availability</h4>
                    <p>
                      We aim for high availability but do not guarantee uninterrupted service. Maintenance, updates, or third-party service issues may cause temporary downtime.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">10. Account Termination</h4>
                    <p>
                      You may close your account at any time. We may terminate accounts for serious violations of these terms. Upon termination, your data may be retained for a reasonable period for legal or operational purposes.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">11. Changes to Service</h4>
                    <p>
                      We may update features, pricing, or terms with reasonable notice. Continued use after changes constitutes acceptance.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">12. Support & Contact</h4>
                    <p>
                      For questions or disputes, contact support@blizflow.co.za. We will respond within a reasonable timeframe.
                    </p>
                  </section>
                </div>
              </div>
            )}

            {/* ── PRIVACY POLICY ── */}
            {activeTab === 'privacy' && (
              <div className="space-y-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" /> Privacy Policy
                </h3>
                <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 text-[10px] text-amber-800 font-bold">
                  This is a V1 draft for review before publication. It describes actual data practices supported by the application.
                </div>
                <div className="space-y-4 text-xs text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">1. Information We Collect</h4>
                    <p>
                      <strong>Account Information:</strong> Email address, password (hashed by Firebase), and phone number.
                      <br />
                      <strong>Business Profile:</strong> Business name, owner name, category, address, description, logo, and cover photo.
                      <br />
                      <strong>Products:</strong> Product names, categories, prices, stock quantities, barcodes, and images.
                      <br />
                      <strong>Sales Data:</strong> Transaction amounts, items sold, payment methods, timestamps, and receipt numbers.
                      <br />
                      <strong>Expenses:</strong> Expense descriptions, amounts, and dates.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">2. How We Use Information</h4>
                    <p>
                      We use your data to provide the BlizFlow service: managing inventory, processing sales, generating reports, and sending subscription reminders. We do not sell your data to third parties.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">3. Data Storage & Security</h4>
                    <p>
                      Data is stored in Google Firebase (Firestore and Authentication). Images are stored as base64 strings or via Firebase Storage. Firebase provides industry-standard encryption and access controls. Local data in Development Mode is stored only in your browser.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">4. Data Retention</h4>
                    <p>
                      We retain your business data for as long as your account is active. After account closure, data may be retained for a reasonable period for legal or operational purposes before deletion.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">5. Account Deletion</h4>
                    <p>
                      You may request account deletion by contacting support@blizflow.co.za. We will delete your personal data and merchant profile. Some anonymized transaction data may be retained for analytics.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">6. Your Rights</h4>
                    <p>
                      You have the right to access, correct, or delete your personal data. You can update most information directly in the Settings page. For other requests, contact support.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">7. Cookies & Local Storage</h4>
                    <p>
                      We use browser localStorage and sessionStorage to cache dashboard data, AI insights, and notification preferences. Firebase Authentication uses cookies for session management.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">8. Changes to This Policy</h4>
                    <p>
                      We may update this Privacy Policy with notice. Continued use after updates constitutes acceptance.
                    </p>
                  </section>
                  <section>
                    <h4 className="font-black text-slate-900 text-sm mb-1">9. Contact</h4>
                    <p>
                      For privacy questions, email support@blizflow.co.za.
                    </p>
                  </section>
                </div>
              </div>
            )}

            {/* ── ABOUT BLIZFLOW ── */}
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
                  <span className="inline-block bg-white border border-indigo-100 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-full">
                    Version V1
                  </span>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => setActiveTab('terms')}
                    className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" /> Terms & Conditions
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                  <button
                    onClick={() => setActiveTab('privacy')}
                    className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-slate-400" /> Privacy Policy
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                </div>

                <div className="text-center pt-2">
                  <p className="text-[10px] text-slate-400">
                    © {new Date().getFullYear()} BlizFlow. All rights reserved.
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    support@blizflow.co.za
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}