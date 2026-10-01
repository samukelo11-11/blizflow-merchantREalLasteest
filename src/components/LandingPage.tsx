/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Store, 
  ShoppingCart, 
  Barcode, 
  TrendingUp, 
  DollarSign, 
  ShieldCheck, 
  ArrowRight, 
  Zap, 
  Lock, 
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  Layers,
  Receipt
} from 'lucide-react';
import { ShopProfile } from '../types';
import { verifyShopAccess } from '../services/shopAuth';
import { getInitialDemoShop } from '../demo/demoService';

interface LandingPageProps {
  onLoginSuccess: (shop: ShopProfile) => void;
  onStartAdmin?: () => void;
}

export default function LandingPage({ onLoginSuccess, onStartAdmin }: LandingPageProps) {
  const [showEnterShopModal, setShowEnterShopModal] = useState(false);
  const [shopId, setShopId] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnterShopSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanShopId = shopId.trim().toUpperCase();
    const cleanPin = pin.trim();

    if (!cleanShopId) {
      setError('Please enter your Shop ID (e.g. MEC001).');
      return;
    }
    if (!cleanPin) {
      setError('Please enter your 4-digit Shop PIN.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await verifyShopAccess(cleanShopId, cleanPin);
      if (!result.success) {
        setError(result.message);
      } else {
        setShowEnterShopModal(false);
        onLoginSuccess(result.shop);
      }
    } catch (err: any) {
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = () => {
    const demoShop = getInitialDemoShop();
    localStorage.setItem('blizflow_demo_active', 'true');
    localStorage.setItem('blizflow_shop', JSON.stringify(demoShop));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
    onLoginSuccess(demoShop);
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col font-sans selection:bg-indigo-500 selection:text-white" id="blizflow-landing">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 text-white p-2 rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <span className="font-black text-xl tracking-tight text-slate-900">
            Bliz<span className="text-indigo-600">Flow</span>
          </span>
          <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200/60 hidden sm:inline-block">
            Store OS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEnterShopModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm px-5 py-2.5 rounded-xl transition duration-150 flex items-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <span>Enter Shop</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 md:py-20 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-6">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Built for South African Spaza Shops & Neighborhood Retail</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-slate-950 tracking-tight leading-tight mb-6">
            The complete operating system for your local shop.
          </h1>

          <p className="text-base md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Stop losing stock and wasting hours on paper notebooks. BlizFlow turns your phone, tablet, or laptop into a fast, offline-ready retail terminal.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3.5 justify-center items-center">
            <button
              onClick={() => setShowEnterShopModal(true)}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-base font-black px-8 py-4 rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer"
            >
              <span>Enter Shop with ID & PIN</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleDemoSignIn}
              className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-800 border border-slate-300/80 text-sm font-bold px-6 py-4 rounded-2xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Store className="w-4 h-4 text-amber-500" />
              <span>Explore Instant Demo</span>
            </button>
          </div>
        </div>

        {/* Core Pillars Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Instant POS Checkout</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tender cash, calculate exact change, record card payments, and reprint customer receipts in seconds with zero lag.
              </p>
            </div>
          </div>

          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Smart Barcode Inventory</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Scan products with your camera or USB scanner. Automatic low-stock warnings alert you before essential stock runs out.
              </p>
            </div>
          </div>

          <div className="bg-white p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">Daily Profit & Expenses</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record supplier payouts and operating costs. The dashboard tracks gross revenue, net margins, and top items every evening.
              </p>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="bg-indigo-900 text-white rounded-3xl p-8 md:p-12 mb-16 shadow-xl relative overflow-hidden">
          <div className="max-w-2xl">
            <span className="text-xs font-black uppercase tracking-wider text-indigo-300">How Access Works</span>
            <h2 className="text-2xl md:text-3xl font-black mt-2 mb-4">
              Direct Business Activation — No Credit Cards or Passwords
            </h2>
            <p className="text-xs md:text-sm text-indigo-200 leading-relaxed mb-6">
              BlizFlow accounts are managed directly. When you partner with BlizFlow, we configure your store catalog and issue a private <strong>Shop ID</strong> and <strong>PIN</strong>. Simply type your ID and PIN on any device to enter your shop.
            </p>
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-indigo-100">
              <div className="flex items-center gap-1.5 bg-indigo-800/80 px-3 py-1.5 rounded-xl border border-indigo-700">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Isolated Store Database</span>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-800/80 px-3 py-1.5 rounded-xl border border-indigo-700">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Encrypted PBKDF2 PIN</span>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-800/80 px-3 py-1.5 rounded-xl border border-indigo-700">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span>Instant Device Session</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">BlizFlow Retail Systems</span>
          <span>•</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-4 mt-3 sm:mt-0">
          <Link
            to="/admin/login"
            className="text-slate-400 hover:text-slate-700 text-[11px] font-semibold transition"
          >
            Admin Console
          </Link>
        </div>
      </footer>

      {/* ── ENTER SHOP MODAL ── */}
      {showEnterShopModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 border border-slate-200 shadow-2xl relative animate-fadeIn">
            {/* Close Button */}
            <button
              onClick={() => { setShowEnterShopModal(false); setError(null); }}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl mb-3">
                <Store className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Enter Your Shop</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Enter the Shop ID and private PIN provided for your business.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl font-medium mb-4 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleEnterShopSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Shop ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. MEC001"
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm font-black tracking-wider uppercase transition outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Shop PIN (4–16 digits)
                </label>
                <input
                  type="password"
                  placeholder="••••"
                  maxLength={16}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-base font-mono tracking-widest transition outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Verifying Shop...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Unlock & Open Shop</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400">
                Need a Shop ID? Contact your BlizFlow business administrator.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
