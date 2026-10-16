/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Transaction } from '../types';
import { Search, Calendar, ChevronRight, Receipt, CreditCard, DollarSign, RefreshCw, ShoppingCart, Info, ArrowLeft, Layers, Download, CheckCircle } from 'lucide-react';
import { exportTransactionsToCSV } from '../utils/csvExport';

interface SalesPageProps {
  transactions: Transaction[];
  onBackToDashboard: () => void;
}

export default function SalesPage({ transactions = [], onBackToDashboard }: SalesPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExportCSV = () => {
    try {
      const res = exportTransactionsToCSV(filteredTransactions);
      setExportNotice(`Exported ${res.count} sales records to ${res.filename}`);
      setTimeout(() => setExportNotice(null), 3500);
    } catch (err: any) {
      alert(err.message || 'No sales transactions to export.');
    }
  };

  // Sorting transactions: latest first
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredTransactions = sortedTransactions.filter((tx) => {
    const matchesSearch = tx.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (tx.receiptNo && tx.receiptNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
      tx.items.some(item => item.productName.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesPayment = filterPayment === 'all' || tx.paymentMethod === filterPayment;

    return matchesSearch && matchesPayment;
  });

  // Calculate high-level stats
  const totalSalesAmount = transactions.reduce((sum, tx) => sum + tx.totalAmount, 0);
  const totalTxCount = transactions.length;
  
  // Average bill amount
  const averageBill = totalTxCount > 0 ? totalSalesAmount / totalTxCount : 0;

  // Breakdown by payment methods
  const cashSales = transactions.filter(t => t.paymentMethod === 'cash').reduce((sum, t) => sum + t.totalAmount, 0);
  const cardSales = transactions.filter(t => t.paymentMethod === 'card').reduce((sum, t) => sum + t.totalAmount, 0);
  const otherSales = transactions.filter(t => t.paymentMethod === 'other').reduce((sum, t) => sum + t.totalAmount, 0);

  return (
    <div className="bg-slate-50 min-h-screen pb-16 font-sans">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button 
              onClick={onBackToDashboard}
              className="text-slate-500 hover:text-slate-900 transition p-1.5 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">History & Reports</span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">Sales Records</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredTransactions.length === 0}
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-bold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Export sales transactions to CSV spreadsheet"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-indigo-100/50">
              Total Bills: {totalTxCount}
            </span>
          </div>
        </div>

        {/* Export Notification Toast */}
        {exportNotice && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-xs animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{exportNotice}</span>
          </div>
        )}

        {/* Detailed Sales Statistics Dashboard Section */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-indigo-950 text-white p-5 rounded-2xl border border-indigo-900 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-indigo-300 uppercase tracking-wider">Gross Sales Revenue</span>
            <div className="mt-4">
              <span className="text-2xl font-black">R {totalSalesAmount.toFixed(2)}</span>
              <p className="text-[10px] text-indigo-200 mt-1">All-time sales</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cash Received</span>
              <span className="text-emerald-500 bg-emerald-50 text-[10px] font-black px-2 py-0.5 rounded uppercase">Cash</span>
            </div>
            <div className="mt-4">
              <span className="text-xl font-black text-slate-950">R {cashSales.toFixed(2)}</span>
              <p className="text-[10px] text-slate-400 mt-1">Cash register total</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Card Payments</span>
              <span className="text-blue-500 bg-blue-50 text-[10px] font-black px-2 py-0.5 rounded uppercase">Card</span>
            </div>
            <div className="mt-4">
              <span className="text-xl font-black text-slate-950">R {cardSales.toFixed(2)}</span>
              <p className="text-[10px] text-slate-400 mt-1">Card terminal total</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Avg Transaction</span>
              <span className="text-purple-500 bg-purple-50 p-1.5 rounded-lg">
                <ShoppingCart className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-4">
              <span className="text-xl font-black text-slate-950">R {averageBill.toFixed(2)}</span>
              <p className="text-[10px] text-slate-400 mt-1">Per unique checkout bill</p>
            </div>
          </div>
        </div>

        {/* Sales Table and Inspector Split */}
        <div className="grid lg:grid-cols-12 gap-8">
          
          {/* List Section (Span 7) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
            
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400 w-4.5 h-4.5" />
                <input
                  type="text"
                  placeholder="Search receipt no or product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9.5 pr-4 text-xs outline-none focus:border-indigo-600 focus:bg-white transition"
                />
              </div>
              <select
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-600 transition"
              >
                <option value="all">All Payments</option>
                <option value="cash">💵 Cash Only</option>
                <option value="card">💳 Card Only</option>
                <option value="other">📱 EFT / Other</option>
              </select>
            </div>

            {/* List items */}
            {filteredTransactions.length === 0 ? (
              <div className="py-12 text-center flex flex-col items-center">
                <div className="bg-slate-50 text-slate-400 p-3 rounded-full mb-3">
                  <Receipt className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No matching sales records</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  {transactions.length === 0 
                    ? "Complete checkouts at the Point of Sale to log your transactions." 
                    : "Try adjusting your keyword filter or payment method dropdown."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                {filteredTransactions.map((tx) => {
                  const txDate = new Date(tx.createdAt);
                  const formattedDate = txDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  const formattedTime = txDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                  const isSelected = selectedTx?.id === tx.id;

                  return (
                    <button
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className={`w-full py-3.5 px-3 flex items-center justify-between gap-4 text-left rounded-xl transition ${
                        isSelected ? 'bg-indigo-50/65 border-l-4 border-l-indigo-600 pl-2' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-slate-900">
                            {tx.receiptNo || `TX-${tx.id.substring(0, 8).toUpperCase()}`}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-600 font-sans">
                            {tx.paymentMethod || 'cash'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formattedDate} at {formattedTime}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {tx.items.map(i => `${i.productName} (x${i.quantity})`).join(', ')}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <div>
                          <span className="font-black text-sm text-slate-950">R {tx.totalAmount.toFixed(2)}</span>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5">{tx.items.reduce((acc, i) => acc + i.quantity, 0)} units</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Receipt Inspector (Span 5) */}
          <div className="lg:col-span-5">
            {selectedTx ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5.5 relative overflow-hidden">
                {/* Visual receipt style top border */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600" />
                
                <div className="text-center pb-5 border-b border-dashed border-slate-200 mt-2">
                  <Receipt className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Official Store Receipt</span>
                  <h3 className="font-mono text-xs font-black text-slate-900 mt-1">
                    {selectedTx.receiptNo || `TX-${selectedTx.id.substring(0, 8).toUpperCase()}`}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {new Date(selectedTx.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="py-5 space-y-3.5 border-b border-dashed border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Items Summary</span>
                  <div className="space-y-2.5">
                    {selectedTx.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs text-slate-700 leading-tight">
                        <div className="max-w-[200px]">
                          <p className="font-bold text-slate-900">{item.productName}</p>
                          <span className="text-[10px] text-slate-400">
                            {item.quantity} {item.unit}{item.quantity !== 1 ? 's' : ''} × R {item.price.toFixed(2)}
                          </span>
                        </div>
                        <span className="font-bold text-slate-950">
                          R {(item.quantity * item.price).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sales Totals */}
                <div className="py-5 space-y-2 text-xs border-b border-dashed border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal (Excl. VAT)</span>
                    <span>R {(selectedTx.totalAmount / 1.15).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>VAT (15% standard rate)</span>
                    <span>R {(selectedTx.totalAmount - (selectedTx.totalAmount / 1.15)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-1 text-slate-950">
                    <span>Grand Total</span>
                    <span>R {selectedTx.totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Additional metadata */}
                <div className="pt-5 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-medium">Payment Method</span>
                    <span className="font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded capitalize">
                      {selectedTx.paymentMethod || 'cash'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-[10px] text-slate-500 leading-normal flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>This sale record is synced to your persistent local register cache and cloud reporting database.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center flex flex-col items-center justify-center min-h-[350px]">
                <Receipt className="w-10 h-10 text-slate-300 mb-3" />
                <h3 className="text-sm font-bold text-slate-700">No bill selected</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-[180px] leading-relaxed mx-auto">
                  Click on any transaction on the left to inspect detailed product breakdowns, VAT calculations, and bill summaries.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
