/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Expense } from '../types';
import { ArrowLeft, Plus, DollarSign, Calendar, Tag, Trash2, Search, AlertCircle, TrendingDown, Info, CreditCard } from 'lucide-react';

interface ExpensesPageProps {
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => void;
  onDeleteExpense: (id: string) => void;
  onBackToDashboard: () => void;
}

const EXPENSE_CATEGORIES = [
  'Stock/Supplies',
  'Rent',
  'Electricity/Water',
  'Wages',
  'Transport',
  'Other'
];

export default function ExpensesPage({
  expenses = [],
  onAddExpense,
  onDeleteExpense,
  onBackToDashboard
}: ExpensesPageProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [amountInput, setAmountInput] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Filter fields
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = title.trim();
    const amount = parseFloat(amountInput);

    if (!cleanTitle) {
      setFormError('Please enter a description/title for this expense.');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setFormError('Please enter a valid expense amount greater than R 0.');
      return;
    }

    onAddExpense({
      title: cleanTitle,
      category,
      amount,
      notes: notes.trim() || undefined
    });

    // Clear form
    setTitle('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setAmountInput('');
    setNotes('');
    setShowAddForm(false);
  };

  // Sort and filter expenses: latest first
  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filteredExpenses = sortedExpenses.filter((exp) => {
    const matchesSearch = exp.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (exp.notes && exp.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  // Calculate sum of current list vs overall sum
  const totalFilteredAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalAllAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="bg-slate-50 min-h-screen pb-16 font-sans">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6">
        
        {/* Navigation Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button 
              onClick={onBackToDashboard}
              className="text-slate-500 hover:text-slate-900 transition p-1.5 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Cost Management</span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">Shop Expenses</h1>
            </div>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add New Expense
          </button>
        </div>

        {/* Expenses Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Active Costs</span>
            <div className="mt-4">
              <span className="text-2xl font-black text-red-600">R {totalAllAmount.toFixed(2)}</span>
              <p className="text-[10px] text-slate-400 mt-1">All cataloged expenses</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Filtered Costs</span>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-900">R {totalFilteredAmount.toFixed(2)}</span>
              <p className="text-[10px] text-slate-400 mt-1">Matching current search filters</p>
            </div>
          </div>

          <div className="col-span-2 lg:col-span-1 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Expense Items</span>
            <div className="mt-4">
              <span className="text-2xl font-black text-slate-950">{expenses.length}</span>
              <span className="text-xs text-slate-500 ml-1.5 font-medium">receipts logged</span>
            </div>
          </div>
        </div>

        {/* Form Modal/Collapsible */}
        {showAddForm && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 mb-8 max-w-lg mx-auto">
            <h2 className="text-base font-black text-slate-950 tracking-tight mb-4 flex items-center gap-1.5">
              <TrendingDown className="w-5 h-5 text-indigo-600" /> Log Business Expense
            </h2>

            {formError && (
              <div className="bg-red-50 border border-red-100 text-red-700 p-3.5 rounded-xl text-xs mb-4.5 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Expense Title / Payee</label>
                <input
                  type="text"
                  placeholder="e.g. Spar Wholesale, August Rent, Water Bill"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
                  >
                    {EXPENSE_CATEGORIES.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Amount (ZAR)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">R</span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-8 pr-3.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Optional Notes / Details</label>
                <textarea
                  placeholder="e.g. Invoice #29384, paid cash from register, electricity token"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-600 focus:bg-white transition resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition shadow-xs cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Expenses List and Filters */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center pb-4 border-b border-slate-100 mb-5">
            <h2 className="text-base font-black text-slate-950 tracking-tight">Logged Costs Directory</h2>
            
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-48 bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-600 focus:bg-white transition"
                />
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-600 transition"
              >
                <option value="all">All Categories</option>
                {EXPENSE_CATEGORIES.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <div className="bg-slate-50 text-slate-400 p-3.5 rounded-full mb-3">
                <Tag className="w-5.5 h-5.5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No matching expenses</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-normal">
                {expenses.length === 0 
                  ? "Log business costs to track supplies, wages, rent, and calculate exact store profits." 
                  : "Try adjusting your category filter dropdown."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="pb-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Description</th>
                    <th className="pb-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Category</th>
                    <th className="pb-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Notes</th>
                    <th className="pb-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Amount</th>
                    <th className="pb-2.5 text-[10px] font-black text-slate-400 tracking-wider text-center w-12">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredExpenses.map((exp) => {
                    const date = new Date(exp.createdAt);
                    const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 text-slate-500 whitespace-nowrap pr-2">
                          {formattedDate}
                        </td>
                        <td className="py-3 font-bold text-slate-900 pr-2">
                          {exp.title}
                        </td>
                        <td className="py-3 pr-2">
                          <span className="bg-slate-100 text-slate-800 text-[9px] font-bold px-2 py-0.5 rounded border border-slate-200/50">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500 italic max-w-[200px] truncate pr-2" title={exp.notes}>
                          {exp.notes || '—'}
                        </td>
                        <td className="py-3 text-right font-black text-red-600 pr-4 font-mono">
                          R {exp.amount.toFixed(2)}
                        </td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this expense record?')) {
                                onDeleteExpense(exp.id);
                              }
                            }}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition cursor-pointer"
                            title="Delete expense"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="bg-slate-50/65 rounded-xl p-3.5 mt-5 text-[10px] text-slate-500 flex items-start gap-1.5 border border-slate-100">
                <Info className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span>
                  All cash payouts and registered stock receipts should be cataloged here to generate standard gross profit statements on your Dashboard home page.
                </span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
