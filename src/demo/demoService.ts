/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShopProfile, Product, Transaction, Expense, InventoryActivity } from '../types';

export const DEMO_ACTIVE_KEY = 'blizflow_demo_active';
export const DEMO_SHOP_KEY = 'blizflow_demo_shop';
export const DEMO_PRODUCTS_KEY = 'blizflow_demo_products';
export const DEMO_TRANSACTIONS_KEY = 'blizflow_demo_transactions';
export const DEMO_EXPENSES_KEY = 'blizflow_demo_expenses';
export const DEMO_ACTIVITIES_KEY = 'blizflow_demo_activities';

export const isDemoModeActive = (): boolean => {
  try {
    return localStorage.getItem(DEMO_ACTIVE_KEY) === 'true';
  } catch (e) {
    return false;
  }
};

export const getInitialDemoShop = (): ShopProfile => {
  return {
    id: 'demo-spaza-001',
    name: "Lindiwe's Corner Spaza",
    ownerName: 'Lindiwe Dlamini',
    phoneNumber: '+27 82 555 1234',
    email: 'lindiwe.demo@blizflow.co.za',
    category: 'Grocery & Supermarket',
    address: '14 Mbeki Street, Gugulethu, Cape Town',
    gpsLocation: { latitude: -33.9850, longitude: 18.5720 },
    logoUrl: '',
    coverUrl: '',
    openingHours: { open: '07:00', close: '19:30' },
    description: 'Community corner spaza shop supplying fresh bread, cold drinks, dairy, and daily essentials.',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'open',
    subscriptionStatus: 'active',
    plan: 'standard',
    isEmailVerified: true,
    onboardingStatus: 'complete'
  };
};

export const getInitialDemoProducts = (): Product[] => {
  const shopId = 'demo-spaza-001';
  const now = new Date().toISOString();

  return [
    {
      id: 'demo-prod-bread',
      shopId,
      merchantId: shopId,
      name: 'Albany Superior White Bread 700g',
      category: 'Bakery & Confectionery',
      sellingPrice: 18.50,
      costPrice: 14.00,
      stockQuantity: 8, // Low stock trigger (threshold is 10)
      unit: 'Loaf',
      availability: 'in_stock',
      barcode: '6001000000012',
      lowStockLevel: 10,
      createdAt: now,
      imageUrl: ''
    },
    {
      id: 'demo-prod-milk',
      shopId,
      merchantId: shopId,
      name: 'Clover Full Cream Fresh Milk 2L',
      category: 'Dairy & Eggs',
      sellingPrice: 32.00,
      costPrice: 25.50,
      stockQuantity: 4, // Critical low stock trigger (threshold is 6)
      unit: 'Bottle',
      availability: 'in_stock',
      barcode: '6001000000056',
      lowStockLevel: 6,
      createdAt: now,
      imageUrl: ''
    },
    {
      id: 'demo-prod-coke',
      shopId,
      merchantId: shopId,
      name: 'Coca-Cola 330ml Can',
      category: 'Beverages & Cold Drinks',
      sellingPrice: 14.00,
      costPrice: 9.50,
      stockQuantity: 18,
      unit: 'Can',
      availability: 'in_stock',
      barcode: '6001087300001',
      lowStockLevel: 5,
      createdAt: now,
      imageUrl: ''
    },
    {
      id: 'demo-prod-chips',
      shopId,
      merchantId: shopId,
      name: 'Simba Potato Chips 120g (Smoked Beef)',
      category: 'Snacks & Sweets',
      sellingPrice: 17.50,
      costPrice: 12.00,
      stockQuantity: 24,
      unit: 'Packet',
      availability: 'in_stock',
      barcode: '6001000000078',
      lowStockLevel: 8,
      createdAt: now,
      imageUrl: ''
    },
    {
      id: 'demo-prod-flour',
      shopId,
      merchantId: shopId,
      name: 'Golden Cloud Cake Flour 2.5kg',
      category: 'Grocery & Supermarket',
      sellingPrice: 42.00,
      costPrice: 34.00,
      stockQuantity: 15,
      unit: 'Bag',
      availability: 'in_stock',
      barcode: '6001000000099',
      lowStockLevel: 5,
      createdAt: now,
      imageUrl: ''
    },
    {
      id: 'demo-prod-soap',
      shopId,
      merchantId: shopId,
      name: 'Sunlight Dishwashing Liquid 750ml',
      category: 'Household & Cleaning',
      sellingPrice: 34.99,
      costPrice: 27.50,
      stockQuantity: 11,
      unit: 'Bottle',
      availability: 'in_stock',
      barcode: '6001000000045',
      lowStockLevel: 4,
      createdAt: now,
      imageUrl: ''
    }
  ];
};

export const getInitialDemoTransactions = (): Transaction[] => {
  const shopId = 'demo-spaza-001';
  const today = new Date();
  
  // Earlier today transaction 1 (approx 2 hours ago)
  const tx1Time = new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString();
  // Earlier today transaction 2 (approx 45 minutes ago)
  const tx2Time = new Date(today.getTime() - 45 * 60 * 1000).toISOString();

  return [
    {
      id: 'demo-tx-102',
      shopId,
      merchantId: shopId,
      receiptNo: 'RCP-DEMO-002',
      createdAt: tx2Time,
      totalAmount: 50.50,
      paymentMethod: 'card',
      items: [
        {
          productId: 'demo-prod-bread',
          productName: 'Albany Superior White Bread 700g',
          quantity: 1,
          price: 18.50,
          unit: 'Loaf'
        },
        {
          productId: 'demo-prod-milk',
          productName: 'Clover Full Cream Fresh Milk 2L',
          quantity: 1,
          price: 32.00,
          unit: 'Bottle'
        }
      ]
    },
    {
      id: 'demo-tx-101',
      shopId,
      merchantId: shopId,
      receiptNo: 'RCP-DEMO-001',
      createdAt: tx1Time,
      totalAmount: 28.00,
      paymentMethod: 'cash',
      items: [
        {
          productId: 'demo-prod-coke',
          productName: 'Coca-Cola 330ml Can',
          quantity: 2,
          price: 14.00,
          unit: 'Can'
        }
      ]
    }
  ];
};

export const getInitialDemoExpenses = (): Expense[] => {
  const shopId = 'demo-spaza-001';
  const today = new Date();
  const expTime = new Date(today.getTime() - 3 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 'demo-exp-001',
      shopId,
      merchantId: shopId,
      title: 'Morning Bakery Delivery Transport',
      category: 'Transport',
      amount: 35.00,
      notes: 'Local taxi delivery fee for fresh bread consignment',
      createdAt: expTime
    }
  ];
};

export const getInitialDemoActivities = (): InventoryActivity[] => {
  const shopId = 'demo-spaza-001';
  const today = new Date();
  const actTime = new Date(today.getTime() - 45 * 60 * 1000).toISOString();

  return [
    {
      id: 'demo-act-001',
      shopId,
      merchantId: shopId,
      productId: 'demo-prod-bread',
      productName: 'Albany Superior White Bread 700g',
      action: 'Sale Recorded',
      quantity: 1,
      details: 'Sold 1 Loaf(s) [RCP-DEMO-002]',
      createdAt: actTime
    },
    {
      id: 'demo-act-002',
      shopId,
      merchantId: shopId,
      productId: 'demo-prod-milk',
      productName: 'Clover Full Cream Fresh Milk 2L',
      action: 'Sale Recorded',
      quantity: 1,
      details: 'Sold 1 Bottle(s) [RCP-DEMO-002]',
      createdAt: actTime
    }
  ];
};

// Storage Access & Mutation Helpers for Demo Mode
export const loadDemoShop = (): ShopProfile => {
  try {
    const raw = localStorage.getItem(DEMO_SHOP_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('[DemoService] Error reading demo shop:', e);
  }
  const initial = getInitialDemoShop();
  localStorage.setItem(DEMO_SHOP_KEY, JSON.stringify(initial));
  return initial;
};

export const saveDemoShop = (shop: ShopProfile): void => {
  try {
    localStorage.setItem(DEMO_SHOP_KEY, JSON.stringify(shop));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error saving demo shop:', e);
  }
};

export const loadDemoProducts = (): Product[] => {
  try {
    const raw = localStorage.getItem(DEMO_PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('[DemoService] Error reading demo products:', e);
  }
  const initial = getInitialDemoProducts();
  localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(initial));
  return initial;
};

export const saveDemoProducts = (products: Product[]): void => {
  try {
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(products));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error saving demo products:', e);
  }
};

export const loadDemoTransactions = (): Transaction[] => {
  try {
    const raw = localStorage.getItem(DEMO_TRANSACTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[DemoService] Error reading demo transactions:', e);
  }
  const initial = getInitialDemoTransactions();
  localStorage.setItem(DEMO_TRANSACTIONS_KEY, JSON.stringify(initial));
  return initial;
};

export const saveDemoTransactions = (transactions: Transaction[]): void => {
  try {
    localStorage.setItem(DEMO_TRANSACTIONS_KEY, JSON.stringify(transactions));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error saving demo transactions:', e);
  }
};

export const loadDemoExpenses = (): Expense[] => {
  try {
    const raw = localStorage.getItem(DEMO_EXPENSES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[DemoService] Error reading demo expenses:', e);
  }
  const initial = getInitialDemoExpenses();
  localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(initial));
  return initial;
};

export const saveDemoExpenses = (expenses: Expense[]): void => {
  try {
    localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(expenses));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error saving demo expenses:', e);
  }
};

export const loadDemoActivities = (): InventoryActivity[] => {
  try {
    const raw = localStorage.getItem(DEMO_ACTIVITIES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('[DemoService] Error reading demo activities:', e);
  }
  const initial = getInitialDemoActivities();
  localStorage.setItem(DEMO_ACTIVITIES_KEY, JSON.stringify(initial));
  return initial;
};

export const saveDemoActivities = (activities: InventoryActivity[]): void => {
  try {
    localStorage.setItem(DEMO_ACTIVITIES_KEY, JSON.stringify(activities));
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error saving demo activities:', e);
  }
};

/**
 * Starts the Interactive Demo Sandbox session.
 * Populates clean starter data if not already present.
 */
export const startDemoMode = (): void => {
  try {
    localStorage.setItem(DEMO_ACTIVE_KEY, 'true');
    // Ensure all demo datasets are initialized
    loadDemoShop();
    loadDemoProducts();
    loadDemoTransactions();
    loadDemoExpenses();
    loadDemoActivities();
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error starting demo mode:', e);
  }
};

/**
 * Exits the Interactive Demo Sandbox session.
 * Leaves demo data preserved in demo keys, but clears the active flag.
 */
export const stopDemoMode = (): void => {
  try {
    localStorage.removeItem(DEMO_ACTIVE_KEY);
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error stopping demo mode:', e);
  }
};

/**
 * Completely resets the Demo Sandbox to original factory preset demo state.
 */
export const resetDemoData = (): {
  shop: ShopProfile;
  products: Product[];
  transactions: Transaction[];
  expenses: Expense[];
  activities: InventoryActivity[];
} => {
  const shop = getInitialDemoShop();
  const products = getInitialDemoProducts();
  const transactions = getInitialDemoTransactions();
  const expenses = getInitialDemoExpenses();
  const activities = getInitialDemoActivities();

  try {
    localStorage.setItem(DEMO_SHOP_KEY, JSON.stringify(shop));
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(products));
    localStorage.setItem(DEMO_TRANSACTIONS_KEY, JSON.stringify(transactions));
    localStorage.setItem(DEMO_EXPENSES_KEY, JSON.stringify(expenses));
    localStorage.setItem(DEMO_ACTIVITIES_KEY, JSON.stringify(activities));
    localStorage.setItem(DEMO_ACTIVE_KEY, 'true');
    window.dispatchEvent(new CustomEvent('blizflow_demo_sync'));
  } catch (e) {
    console.warn('[DemoService] Error resetting demo data:', e);
  }

  return { shop, products, transactions, expenses, activities };
};
