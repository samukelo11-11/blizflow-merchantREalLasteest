/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShopProfile, Product, Transaction, InventoryActivity, Expense } from '../types';
import { BUSINESS_CATEGORIES } from '../data';
import { 
  Plus, 
  Settings, 
  MapPin, 
  Clock, 
  Phone, 
  Package, 
  TrendingDown, 
  CheckCircle, 
  AlertTriangle, 
  Store,
  ChevronRight,
  ShieldCheck,
  Eye,
  Navigation,
  Sparkles,
  Check,
  Coins,
  Barcode,
  History,
  Activity,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Receipt
} from 'lucide-react';

interface DashboardProps {
  shop: ShopProfile;
  products: Product[];
  transactions?: Transaction[];
  activities?: InventoryActivity[];
  expenses?: Expense[];
  onToggleStatus: () => void;
  onNavigate: (view: 'dashboard' | 'products' | 'profile' | 'add_product' | 'pos' | 'sales' | 'expenses' | 'settings') => void;
  onEditProfile: () => void;
}

export default function Dashboard({
  shop,
  products,
  transactions = [],
  activities = [],
  expenses = [],
  onToggleStatus,
  onNavigate,
  onEditProfile,
}: DashboardProps) {
  
  // AI insights state
  const [insights, setInsights] = useState<string | null>(() => {
    return sessionStorage.getItem('blizflow_ai_insights');
  });
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const fetchInsights = async () => {
    if (products.length === 0) {
      setInsights("• Add products to your catalog to generate smart daily inventory insights.");
      return;
    }
    setLoadingInsights(true);
    setInsightsError(null);
    try {
      // Strip large fields like base64 imageUrl to prevent PayloadTooLarge / HTTP 413
      const strippedProducts = products.map(p => ({
        name: p.name,
        category: p.category,
        stockQuantity: p.stockQuantity,
        unit: p.unit,
        sellingPrice: p.sellingPrice,
        lowStockLevel: p.lowStockLevel
      }));

      const strippedTransactions = (transactions || []).map(t => ({
        totalAmount: t.totalAmount,
        items: (t.items || []).map(i => ({
          quantity: i.quantity,
          productName: i.productName,
          price: i.price
        }))
      }));

      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          products: strippedProducts,
          transactions: strippedTransactions
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      setInsights(data.insights);
      sessionStorage.setItem('blizflow_ai_insights', data.insights);
    } catch (err: any) {
      console.error('Error fetching insights:', err);
      setInsightsError(err.message || 'Could not connect to AI services. Ensure GEMINI_API_KEY is configured.');
    } finally {
      setLoadingInsights(false);
    }
  };

  const parseInsights = (text: string) => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.startsWith('•') ? line.substring(1).trim() : line);
  };

  // Helper to determine the style of an inventory activity log badge
  const getActionBadge = (action: string) => {
    switch (action) {
      case 'Product Added':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100/50';
      case 'Product Edited':
        return 'bg-slate-50 text-slate-700 border-slate-100';
      case 'Stock Increased':
        return 'bg-blue-50 text-blue-800 border-blue-100/50';
      case 'Stock Reduced':
        return 'bg-amber-50 text-amber-800 border-amber-100/50';
      case 'Sale Recorded':
        return 'bg-indigo-50 text-indigo-800 border-indigo-100/50';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-100';
    }
  };

  // Helper to determine if a date is today
  const isToday = (dateString: string) => {
    const today = new Date();
    const date = new Date(dateString);
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  // Calculate daily sales metrics
  const todayTransactions = transactions.filter(t => isToday(t.createdAt));
  const todaySales = todayTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
  const todayProductsSold = todayTransactions.reduce((sum, t) => sum + t.items.reduce((acc, i) => acc + i.quantity, 0), 0);
  const todayTransactionsCount = todayTransactions.length;

  // Calculate daily expenses and profit
  const todayExpensesList = expenses.filter(e => isToday(e.createdAt));
  const todayExpenses = todayExpensesList.reduce((sum, e) => sum + e.amount, 0);
  const todayProfit = todaySales - todayExpenses;

  // Calculate metric values
  const totalProducts = products.length;
  
  const inStockProducts = products.filter(
    (p) => p.stockQuantity > 0 && p.availability === 'in_stock'
  ).length;

  const lowStockProducts = products.filter(
    (p) => p.stockQuantity > 0 && p.stockQuantity <= (p.lowStockLevel !== undefined ? p.lowStockLevel : 5)
  ).length;

  const outOfStockProducts = products.filter(
    (p) => p.stockQuantity === 0 || p.availability === 'out_of_stock'
  ).length;

  // Sorting products by creation date for "Recent Products" (latest first)
  const recentProducts = [...products]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);

  // Filter low stock list
  const lowStockAlerts = products.filter(
    (p) => p.stockQuantity > 0 && p.stockQuantity <= (p.lowStockLevel !== undefined ? p.lowStockLevel : 5)
  ).slice(0, 4);

  // Find category display name
  const categoryName = BUSINESS_CATEGORIES.find((cat) => cat.id === shop.category)?.name || shop.category;

  // Calculate profile completion progress
  const completionFields = [
    { name: 'Business Name', isCompleted: !!shop.name },
    { name: 'Owner Full Name', isCompleted: !!shop.ownerName },
    { name: 'Phone Number', isCompleted: !!shop.phoneNumber },
    { name: 'Physical Address', isCompleted: !!shop.address },
    { name: 'Business Category', isCompleted: !!shop.category },
    { name: 'Opening Hours', isCompleted: !!(shop.openingHours?.open && shop.openingHours?.close) },
    { name: 'Business Logo', isCompleted: !!shop.logoUrl },
    { name: 'Business Cover Photo', isCompleted: !!shop.coverUrl },
    { name: 'Business Description', isCompleted: !!shop.description },
  ];
  
  const completedFieldsCount = completionFields.filter(f => f.isCompleted).length;
  const completionPercentage = Math.round((completedFieldsCount / completionFields.length) * 100);

  // Check checklist tasks
  const hasLogo = !!shop.logoUrl;
  const hasProduct = totalProducts > 0;
  const isProfileComplete = completionPercentage === 100;
  const isChecklistComplete = hasLogo && hasProduct && isProfileComplete;

  return (
    <div className="bg-slate-50 min-h-screen pb-16 font-sans">
      
      {/* Visual Cover Header */}
      <div className="relative h-48 md:h-64 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
        {shop.coverUrl ? (
          <img
            src={shop.coverUrl}
            alt={shop.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-65"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-950 to-indigo-900 flex flex-col items-center justify-center text-center p-6">
            <Store className="w-10 h-10 text-indigo-400/40 mb-1.5" />
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
              BlizFlow Merchant Partner
            </span>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">Upload your shop cover photo to personalize your store front</p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
        
        {/* Onboarding Trust Indicator top-right */}
        <div className="absolute top-4 right-4 hidden sm:flex items-center gap-1.5 bg-indigo-600/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-indigo-500/30 shadow-lg">
          <ShieldCheck className="w-3.5 h-3.5" /> Certified BlizFlow Merchant
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 relative -mt-16 sm:-mt-24 z-10">
        
        {/* Profile Card Overlay */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6 mb-8 flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4.5">
            {/* Store Logo with nested radius calculation */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-white bg-white overflow-hidden shadow-md flex-shrink-0 relative flex items-center justify-center">
              {shop.logoUrl ? (
                <img
                  src={shop.logoUrl}
                  alt={`${shop.name} Logo`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-center p-2">
                  <Store className="w-7 h-7 text-slate-300 mb-1" />
                  <span className="text-[9px] font-bold text-slate-400">Upload Logo</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-indigo-100/50">
                  {categoryName}
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-slate-500 text-xs font-medium flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />{' '}
                  {shop.openingHours?.isOpen24Hours
                    ? 'Open 24/7'
                    : shop.timeOfOperation || (shop.openingHours?.open ? `${shop.openingHours.open} - ${shop.openingHours.close}` : '08:00 - 18:00')}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight mt-1">
                {shop.name}
              </h1>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 max-w-md line-clamp-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" /> {shop.address}
              </p>
            </div>
          </div>

          {/* Interactive Shop Status Control */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 flex items-center justify-between w-full sm:w-auto gap-6 sm:gap-8 shadow-xs">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Status</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">
                {shop.status === 'open' ? 'Shop is Open' : 'Shop is Closed'}
              </p>
            </div>
            {/* Elegant iOS-style Custom Toggle Switch */}
            <button
              onClick={onToggleStatus}
              className={`relative inline-flex h-7.5 w-14 items-center rounded-full transition-colors duration-200 outline-none cursor-pointer ${
                shop.status === 'open' ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  shop.status === 'open' ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Today's Sales Performance Metrics */}
        <div className="mb-8 bg-indigo-950 text-white rounded-3xl p-6 shadow-md border border-indigo-900 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          {/* Subtle glowing background highlight */}
          <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-1 md:max-w-xs relative z-10">
            <span className="text-[9px] bg-indigo-500/40 text-indigo-100 font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-indigo-400/20">
              Today's Performance
            </span>
            <h2 className="text-lg font-black tracking-tight">Sales & POS Dashboard</h2>
            <p className="text-[11px] text-indigo-200/80 leading-relaxed">
              Real-time calculations of cash register sales and active checkout tickets completed today.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 flex-1 max-w-2xl w-full relative z-10">
            {/* Metric: Today's Sales */}
            <div className="bg-indigo-900/40 border border-indigo-800/50 p-4.5 rounded-2xl">
              <span className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Gross Sales</span>
              <span className="block text-xl font-black mt-1 text-white whitespace-nowrap">
                R {todaySales.toFixed(2)}
              </span>
            </div>

            {/* Metric: Total Transactions */}
            <div className="bg-indigo-900/40 border border-indigo-800/50 p-4.5 rounded-2xl">
              <span className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Transactions</span>
              <span className="block text-xl font-black mt-1 text-white whitespace-nowrap">
                {todayTransactionsCount} <span className="text-[10px] text-indigo-300 font-medium">bills</span>
              </span>
            </div>

            {/* Metric: Today's Expenses */}
            <div className="bg-indigo-900/40 border border-indigo-800/50 p-4.5 rounded-2xl">
              <span className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Expenses</span>
              <span className="block text-xl font-black mt-1 text-white whitespace-nowrap">
                R {todayExpenses.toFixed(2)}
              </span>
            </div>

            {/* Metric: Net Profit */}
            <div className="bg-indigo-900/40 border border-indigo-800/50 p-4.5 rounded-2xl">
              <span className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Net Profit</span>
              <span className="block text-xl font-black mt-1 text-white whitespace-nowrap">
                R {todayProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Quick Actions</h2>
            <span className="text-[11px] text-slate-400 font-medium">Fast shortcuts for daily merchant tasks</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* New Sale */}
            <button
              onClick={() => onNavigate('pos')}
              className="group bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white p-4 rounded-xl flex flex-col items-center justify-center text-center transition shadow-sm hover:shadow cursor-pointer"
            >
              <div className="p-2.5 bg-white/15 rounded-xl mb-2 group-hover:scale-105 transition-transform">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <span className="text-xs font-black">New Sale</span>
              <span className="text-[10px] text-indigo-200 mt-0.5">Open POS register</span>
            </button>

            {/* Add Product */}
            <button
              onClick={() => onNavigate('add_product')}
              className="group bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-800 hover:text-indigo-700 p-4 rounded-xl flex flex-col items-center justify-center text-center transition cursor-pointer"
            >
              <div className="p-2.5 bg-white rounded-xl mb-2 shadow-xs group-hover:scale-105 transition-transform text-indigo-600">
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="text-xs font-black">Add Product</span>
              <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 mt-0.5">Create stock item</span>
            </button>

            {/* View Products */}
            <button
              onClick={() => onNavigate('products')}
              className="group bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-800 hover:text-indigo-700 p-4 rounded-xl flex flex-col items-center justify-center text-center transition cursor-pointer"
            >
              <div className="p-2.5 bg-white rounded-xl mb-2 shadow-xs group-hover:scale-105 transition-transform text-slate-600 group-hover:text-indigo-600">
                <Package className="w-5 h-5" />
              </div>
              <span className="text-xs font-black">View Products</span>
              <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 mt-0.5">Manage inventory</span>
            </button>

            {/* View Sales */}
            <button
              onClick={() => onNavigate('sales')}
              className="group bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-800 hover:text-indigo-700 p-4 rounded-xl flex flex-col items-center justify-center text-center transition cursor-pointer"
            >
              <div className="p-2.5 bg-white rounded-xl mb-2 shadow-xs group-hover:scale-105 transition-transform text-emerald-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="text-xs font-black">View Sales</span>
              <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 mt-0.5">Review receipts</span>
            </button>

            {/* Add Expense */}
            <button
              onClick={() => onNavigate('expenses')}
              className="group bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 hover:border-indigo-200 text-slate-800 hover:text-indigo-700 p-4 rounded-xl flex flex-col items-center justify-center text-center transition cursor-pointer"
            >
              <div className="p-2.5 bg-white rounded-xl mb-2 shadow-xs group-hover:scale-105 transition-transform text-amber-600">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="text-xs font-black">Add Expense</span>
              <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 mt-0.5">Track shop costs</span>
            </button>
          </div>
        </div>

        {/* Onboarding Setup Checklist (Hides automatically when complete) */}
        {!isChecklistComplete && (
          <div className="bg-indigo-50/70 border border-indigo-100/80 rounded-2xl p-5 mb-8">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5 uppercase tracking-wider text-indigo-900">
                  🚀 Setup Checklist
                </h2>
                <p className="text-xs text-indigo-950 mt-1">
                  Complete these steps to get your BlizFlow merchant page fully ready for customers.
                </p>
              </div>
              <span className="bg-indigo-100/80 text-indigo-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                Onboarding
              </span>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              
              {/* Task 1: Register Shop */}
              <div className="bg-white p-3.5 rounded-xl border border-indigo-100/30 flex items-center gap-3 shadow-xs">
                <div className="bg-emerald-500 text-white p-1 rounded-full flex-shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3px]" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-950 leading-tight">Register Shop</p>
                  <span className="text-[9px] text-emerald-600 font-bold mt-0.5 block">Completed</span>
                </div>
              </div>

              {/* Task 2: Upload Logo */}
              <button
                onClick={onEditProfile}
                className="bg-white hover:bg-slate-50 transition p-3.5 rounded-xl border border-indigo-100/30 flex items-center gap-3 shadow-xs cursor-pointer text-left w-full"
              >
                {hasLogo ? (
                  <div className="bg-emerald-500 text-white p-1 rounded-full flex-shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                  </div>
                ) : (
                  <div className="border-2 border-slate-300 text-slate-400 p-1 rounded-full flex-shrink-0">
                    <div className="w-3.5 h-3.5 rounded-full" />
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-black text-slate-950 leading-tight">Upload Logo</p>
                  <span className={`text-[9px] font-bold mt-0.5 block ${hasLogo ? 'text-emerald-600' : 'text-indigo-600 hover:underline'}`}>
                    {hasLogo ? 'Completed' : 'Upload logo file'}
                  </span>
                </div>
              </button>

              {/* Task 3: Add First Product */}
              <button
                onClick={() => onNavigate('add_product')}
                className="bg-white hover:bg-slate-50 transition p-3.5 rounded-xl border border-indigo-100/30 flex items-center gap-3 shadow-xs cursor-pointer text-left w-full"
              >
                {hasProduct ? (
                  <div className="bg-emerald-500 text-white p-1 rounded-full flex-shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                  </div>
                ) : (
                  <div className="border-2 border-slate-300 text-slate-400 p-1 rounded-full flex-shrink-0">
                    <div className="w-3.5 h-3.5 rounded-full" />
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-black text-slate-950 leading-tight">Add First Product</p>
                  <span className={`text-[9px] font-bold mt-0.5 block ${hasProduct ? 'text-emerald-600' : 'text-indigo-600 hover:underline'}`}>
                    {hasProduct ? 'Completed' : 'Add product card'}
                  </span>
                </div>
              </button>

              {/* Task 4: Complete Profile */}
              <button
                onClick={onEditProfile}
                className="bg-white hover:bg-slate-50 transition p-3.5 rounded-xl border border-indigo-100/30 flex items-center gap-3 shadow-xs cursor-pointer text-left w-full"
              >
                {isProfileComplete ? (
                  <div className="bg-emerald-500 text-white p-1 rounded-full flex-shrink-0">
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                  </div>
                ) : (
                  <div className="border-2 border-slate-300 text-slate-400 p-1 rounded-full flex-shrink-0">
                    <div className="w-3.5 h-3.5 rounded-full" />
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-black text-slate-950 leading-tight">Complete Profile</p>
                  <span className={`text-[9px] font-bold mt-0.5 block ${isProfileComplete ? 'text-emerald-600' : 'text-indigo-600 hover:underline'}`}>
                    {isProfileComplete ? 'Completed' : `Currently ${completionPercentage}%`}
                  </span>
                </div>
              </button>

            </div>
          </div>
        )}

        {/* 4 Metrics Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          
          {/* Card: Total Products */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Products</span>
              <div className="text-slate-400 bg-slate-50 p-2 rounded-xl">
                <Package className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-950">{totalProducts}</span>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">items</span>
            </div>
          </div>

          {/* Card: Products in Stock */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">In Stock</span>
              <div className="text-emerald-500 bg-emerald-50 p-2 rounded-xl">
                <CheckCircle className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-950">{inStockProducts}</span>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">available</span>
            </div>
          </div>

          {/* Card: Low Stock */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Low Stock</span>
              <div className="text-amber-500 bg-amber-50 p-2 rounded-xl">
                <TrendingDown className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-950">{lowStockProducts}</span>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">items</span>
            </div>
          </div>

          {/* Card: Out of Stock */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Out of Stock</span>
              <div className="text-red-500 bg-red-50 p-2 rounded-xl">
                <AlertTriangle className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-950">{outOfStockProducts}</span>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">out</span>
            </div>
          </div>

        </div>

        {/* Dashboard 2-Column Split */}
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Left Columns (Span 2) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Section: Low Stock Alerts */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center justify-between mb-4.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base font-black text-slate-950 tracking-tight">Low Stock Alerts</h2>
                </div>
                <span className="bg-amber-50 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-amber-100/50">
                  Requires Attention
                </span>
              </div>

              {lowStockAlerts.length === 0 ? (
                <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-xl p-6.5 text-center flex flex-col items-center">
                  <div className="bg-emerald-500 text-white p-2 rounded-full mb-2.5">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">All Stock Fully Supplied!</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    You currently have no items running critically low. Nice job keeping the shelves stocked!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {lowStockAlerts.map((prod) => (
                    <div key={prod.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {prod.imageUrl ? (
                            <img
                              src={prod.imageUrl}
                              alt={prod.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 leading-tight">{prod.name}</h4>
                          <span className="text-[10px] text-slate-400 capitalize">{prod.category}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="bg-amber-100 text-amber-900 text-xs font-black px-2 py-0.5 rounded">
                          Only {prod.stockQuantity} Left
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{prod.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section: Recent Sales */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center justify-between mb-4.5">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-base font-black text-slate-950 tracking-tight">Recent Sales</h2>
                </div>
                <button
                  onClick={() => onNavigate('sales')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-0.5 cursor-pointer"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center flex flex-col items-center">
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mb-4">
                    No sales recorded yet. Open the POS register to start ringing up customer checkout transactions.
                  </p>
                  <button
                    onClick={() => onNavigate('pos')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition shadow-sm cursor-pointer inline-flex items-center gap-1"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" /> Open POS Register
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {transactions.slice(0, 5).map((tx) => {
                    const txDate = new Date(tx.createdAt);
                    const formattedDate = txDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const formattedTime = txDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                    const totalItems = tx.items.reduce((sum, item) => sum + item.quantity, 0);

                    return (
                      <div key={tx.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center flex-shrink-0 text-indigo-600">
                            <Receipt className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-900">
                                {tx.receiptNo || `#${tx.id.slice(-6).toUpperCase()}`}
                              </span>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                tx.paymentMethod === 'cash' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                                tx.paymentMethod === 'card' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {tx.paymentMethod}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {totalItems} item{totalItems !== 1 ? 's' : ''} • {formattedDate}, {formattedTime}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-slate-950">
                            R {tx.totalAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section: Recent Products */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center justify-between mb-4.5">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-base font-black text-slate-950 tracking-tight">Recent Products</h2>
                </div>
                <button
                  onClick={() => onNavigate('products')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition flex items-center gap-0.5 cursor-pointer"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {recentProducts.length === 0 ? (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center flex flex-col items-center">
                  <p className="text-xs text-slate-500 leading-relaxed max-w-xs mb-4">
                    Your stock inventory is empty. Complete your profile setup by adding your first few inventory items.
                  </p>
                  <button
                    onClick={() => onNavigate('add_product')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition shadow-sm cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Product
                  </button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {recentProducts.map((prod) => (
                    <div 
                      key={prod.id} 
                      className="border border-slate-100 hover:border-slate-200 transition p-3 rounded-xl flex gap-3 items-center bg-slate-50/50"
                    >
                      <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {prod.imageUrl ? (
                          <img
                            src={prod.imageUrl}
                            alt={prod.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-5.5 h-5.5 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate leading-tight">{prod.name}</h4>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-slate-500 font-medium">
                            {prod.stockQuantity} {prod.unit}{prod.stockQuantity !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            R {prod.sellingPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section: Inventory Activity History Log */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex items-center justify-between mb-4.5">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <h2 className="text-base font-black text-slate-950 tracking-tight">Inventory Activity History</h2>
                </div>
                <span className="bg-slate-50 text-slate-500 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-slate-100">
                  Real-time Logs
                </span>
              </div>

              {activities.length === 0 ? (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center flex flex-col items-center">
                  <div className="bg-slate-100 text-slate-400 p-2.5 rounded-full mb-2.5">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">No logs captured yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs leading-normal text-center">
                    Activities such as product additions, detail updates, stock replenishment, or cash register sales will list here automatically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Date & Time</th>
                        <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Product Name</th>
                        <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Action Completed</th>
                        <th className="pb-2 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {activities.slice(0, 6).map((act) => {
                        const date = new Date(act.createdAt);
                        const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

                        return (
                          <tr key={act.id} className="hover:bg-slate-50/50 transition">
                            <td className="py-2.5 pr-2 whitespace-nowrap text-slate-500">
                              <span>{formattedDate}</span>
                              <span className="text-[10px] text-slate-400 ml-1.5">{formattedTime}</span>
                            </td>
                            <td className="py-2.5 pr-2 font-bold text-slate-900 max-w-[150px] truncate" title={act.productName}>
                              {act.productName}
                            </td>
                            <td className="py-2.5 pr-2">
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded border ${getActionBadge(act.action)}`}>
                                {act.action}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-black text-slate-950">
                              {act.quantity > 0 ? act.quantity : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {activities.length > 6 && (
                    <p className="text-[10px] text-slate-400 font-medium text-center mt-3 pt-2.5 border-t border-slate-100">
                      Showing latest 6 inventory events. Add more products or complete transactions to log details.
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Right Column (Span 1) */}
          <div className="space-y-8">
            
            {/* AI Smart Assistant Insights */}
            <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 rounded-2xl border border-indigo-100 shadow-xs p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-950 tracking-tight">AI Smart Assistant</h3>
                </div>
                <button
                  onClick={fetchInsights}
                  disabled={loadingInsights}
                  className="bg-white hover:bg-slate-50 transition p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-600 shadow-2xs cursor-pointer disabled:opacity-50"
                  title="Recalculate insights"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingInsights ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingInsights ? (
                <div className="space-y-2 py-3">
                  <div className="h-2 bg-indigo-200/40 rounded-full animate-pulse w-full" />
                  <div className="h-2 bg-indigo-200/40 rounded-full animate-pulse w-5/6" />
                  <div className="h-2 bg-indigo-200/40 rounded-full animate-pulse w-4/5" />
                </div>
              ) : insightsError ? (
                <div className="bg-red-50 border border-red-100 text-red-800 p-3 rounded-xl">
                  <p className="text-xs text-red-700 font-medium flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                    {insightsError}
                  </p>
                </div>
              ) : insights ? (
                <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {parseInsights(insights).map((bullet, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-indigo-950 leading-relaxed bg-white/65 p-3 rounded-xl border border-indigo-100/40 shadow-2xs">
                      <span className="text-indigo-600 mt-1 font-bold">•</span>
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3.5 text-center py-2">
                  <p className="text-xs text-indigo-950/70 leading-relaxed">
                    Generate automated insights about stock trends, top categories, and sales performance using Gemini.
                  </p>
                  <button
                    type="button"
                    onClick={fetchInsights}
                    disabled={loadingInsights || products.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Insights</span>
                  </button>
                </div>
              )}
            </div>

            {/* Profile Completion Progress */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Profile Completion</h3>
                <span className="text-xs font-black text-indigo-600">{completionPercentage}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-4">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {completionPercentage === 100 
                  ? "🎉 Your store profile is completely finalized! Your customers have access to all your information." 
                  : `You're missing a few details. Upload a store cover photo or write a business description to help build customer trust.`}
              </p>
            </div>

            {/* Business Description & Contacts */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2.5">About Our Shop</h3>
                <p className="text-xs text-slate-600 leading-relaxed italic">
                  {shop.description || 'No business description provided yet. Edit your store profile to add a warm greeting for your visitors.'}
                </p>
              </div>
              
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex items-center gap-2.5 text-xs text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="font-semibold text-slate-800">{shop.phoneNumber || 'No phone number'}</span>
                </div>
                
                {shop.email && (
                  <div className="flex items-center gap-2.5 text-xs text-slate-600 truncate">
                    <span className="text-slate-400 font-bold flex-shrink-0 w-4 text-center">@</span>
                    <span className="font-semibold text-slate-800 truncate">{shop.email}</span>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
