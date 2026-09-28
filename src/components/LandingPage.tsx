/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Building2, 
  Store, 
  Smartphone, 
  ArrowRight, 
  Zap, 
  TrendingUp, 
  ShieldCheck, 
  Clock 
} from 'lucide-react';

interface LandingPageProps {
  onStartRegistration: () => void;
  onStartLogin: () => void;
  onStartAdmin?: () => void;
}

export default function LandingPage({ onStartRegistration, onStartLogin, onStartAdmin }: LandingPageProps) {
  return (
    <div className="bg-slate-50 min-h-screen flex flex-col font-sans" id="blizflow-landing">
      {/* Premium Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-600 text-white p-2 rounded-xl flex items-center justify-center shadow-sm shadow-indigo-600/20">
            <Zap className="w-5 h-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-slate-900">
            Bliz<span className="text-indigo-600">Flow</span>
          </span>
          <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
            Merchant Portal
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onStartAdmin && (
            <button
              onClick={onStartAdmin}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1 border border-slate-200"
            >
              🔒 System Admin
            </button>
          )}
          <button
            onClick={onStartLogin}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
          >
            Sign In
          </button>
          <button
            onClick={onStartRegistration}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm px-4.5 py-2 rounded-xl transition duration-200 flex items-center gap-1.5 shadow-sm shadow-indigo-600/10 cursor-pointer"
          >
            Register Shop <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 md:py-20 flex flex-col justify-center">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-black text-slate-950 tracking-tight leading-none mb-6">
            Put your shop online.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Reach nearby customers. Manage your products easily. Get your business ready for online orders.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-2">
            <div className="flex flex-col sm:flex-row gap-3.5 justify-center items-center w-full max-w-lg">
              <button
                onClick={onStartRegistration}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold px-8 py-4 rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-md shadow-indigo-600/15 cursor-pointer"
              >
                Get Started with Your Shop <ArrowRight className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={onStartLogin}
              className="text-slate-500 hover:text-indigo-600 text-xs font-bold transition duration-200 cursor-pointer mt-3"
            >
              Already registered? Sign In to Your Store →
            </button>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Register in Minutes</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Provide your basic shop details, business hours, and store cover. Instantly secure your place on the local commerce map.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Smartphone-Simple Inventory</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Add products, set prices, and update stock counts with an interface built specifically for quick, tap-and-go updates.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
            <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Build Community Trust</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Let your customers know exactly when you are open and what you have on the shelves. No wasted trips for them, guaranteed sales for you.
              </p>
            </div>
          </div>
        </div>

        {/* Core Philosophy & Trust Box */}
        <div className="bg-indigo-950 text-white rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 transform translate-x-12 -translate-y-12 opacity-10">
            <Building2 className="w-80 h-80" />
          </div>
          <div className="relative z-10 max-w-xl flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 bg-indigo-900/60 border border-indigo-500/30 text-indigo-200 text-xs font-semibold px-3 py-1 rounded-full w-fit">
              <ShieldCheck className="w-3.5 h-3.5" /> Built for Local Commerce
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              Ready to grow your shop with simple, smart technology?
            </h2>
            <p className="text-indigo-200 leading-relaxed text-sm md:text-base">
              Join local bakeries, grocery stores, pharmacies, and butcheries in your neighborhood that use BlizFlow to coordinate availability and build customer loyalty.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onStartRegistration}
                className="bg-white hover:bg-indigo-50 text-indigo-950 font-semibold px-6 py-3 rounded-xl transition duration-150 w-fit cursor-pointer flex items-center gap-2"
              >
                Start Free Registration <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modern footer */}
      <footer className="border-t border-slate-100 bg-white py-8 text-center text-xs text-slate-500">
        <p>© 2026 BlizFlow Inc. All rights reserved. Professional Merchant Platform, Version 1.0.</p>
      </footer>
    </div>
  );
}
