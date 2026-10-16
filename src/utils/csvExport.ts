/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopRecord } from '../auth/shopAuth';
import { Transaction } from '../types';

/**
 * Cleanly escapes a string for CSV compatibility.
 * Wraps values with commas, quotes, or newlines in double quotes.
 */
function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Calculates default subscription price based on plan if missing.
 */
function getPlanPrice(plan?: string, customPrice?: number): number {
  if (typeof customPrice === 'number' && customPrice > 0) return customPrice;
  const p = (plan || 'starter').toLowerCase();
  if (p === 'pro') return 799;
  if (p === 'growth') return 349;
  return 149;
}

/**
 * Formats ISO date to readable YYYY-MM-DD.
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

/**
 * Exports the list of merchants to a formatted CSV file and triggers automatic browser download.
 * Includes UTF-8 BOM for seamless compatibility with Microsoft Excel, Apple Numbers, and Google Sheets.
 */
export function exportMerchantsToCSV(merchants: ShopRecord[]): { count: number; filename: string } {
  if (!merchants || merchants.length === 0) {
    throw new Error('No merchant records to export.');
  }

  const headers = [
    'Shop ID',
    'Shop Name',
    'Owner Name',
    'Phone Number',
    'WhatsApp Number',
    'Email Address',
    'Business Category',
    'Physical Address',
    'Township Landmark',
    'Subscription Plan',
    'Monthly Fee (ZAR)',
    'Account Status',
    'Subscription Status',
    'Offers Delivery',
    'Registered Date',
    'Next Renewal Date'
  ];

  const rows = merchants.map(m => {
    const fee = getPlanPrice(m.plan, (m as any).subscriptionPrice);
    return [
      escapeCSV(m.shopId || m.id),
      escapeCSV(m.name),
      escapeCSV(m.ownerName || 'Owner'),
      escapeCSV(m.phoneNumber || ''),
      escapeCSV((m as any).whatsappNumber || m.phoneNumber || ''),
      escapeCSV(m.email || ''),
      escapeCSV(m.category || 'General Retail'),
      escapeCSV(m.address || ''),
      escapeCSV(m.landmark || ''),
      escapeCSV((m.plan || 'starter').toUpperCase()),
      escapeCSV(`R ${fee}`),
      escapeCSV((m.status || 'active').toUpperCase()),
      escapeCSV((m.subscriptionStatus || 'trial').toUpperCase()),
      escapeCSV(m.offersDelivery ? 'YES' : 'NO'),
      escapeCSV(formatDate(m.createdAt)),
      escapeCSV(formatDate(m.nextRenewalDate))
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  
  // Prepend UTF-8 BOM (\uFEFF) so Excel respects special characters and formatting
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const today = new Date().toISOString().split('T')[0];
  const filename = `BlizFlow_Merchants_${today}.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { count: merchants.length, filename };
}

/**
 * Exports sales transactions to a formatted CSV file.
 * Perfect for merchant daily reconciliation, bookkeeping, and accountant reporting.
 */
export function exportTransactionsToCSV(transactions: Transaction[], shopName?: string): { count: number; filename: string } {
  if (!transactions || transactions.length === 0) {
    throw new Error('No transaction records to export.');
  }

  const headers = [
    'Receipt No',
    'Date & Time',
    'Payment Method',
    'Total Amount (ZAR)',
    'Item Count',
    'Items Summary'
  ];

  const rows = transactions.map(tx => {
    const itemsSummary = (tx.items || [])
      .map(item => `${item.quantity}x ${item.productName} (R${item.price.toFixed(2)})`)
      .join('; ');

    return [
      escapeCSV(tx.receiptNo || tx.id),
      escapeCSV(new Date(tx.createdAt).toLocaleString()),
      escapeCSV(tx.paymentMethod.toUpperCase()),
      escapeCSV(`R ${tx.totalAmount.toFixed(2)}`),
      escapeCSV((tx.items || []).reduce((acc, i) => acc + i.quantity, 0)),
      escapeCSV(itemsSummary)
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const today = new Date().toISOString().split('T')[0];
  const cleanName = (shopName || 'POS').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${cleanName}_Sales_Report_${today}.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { count: transactions.length, filename };
}
