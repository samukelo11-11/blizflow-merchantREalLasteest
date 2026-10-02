export interface ShopProfile {
  id: string;
  shopId?: string;
  ownerUid?: string;
  name: string;
  ownerName: string;
  phoneNumber: string;
  email?: string;
  category: string;
  address?: string;
  status: 'active' | 'pending' | 'suspended' | 'open' | 'closed';
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'payment_pending' | 'rejected' | 'suspended';
  trialEndsAt?: string;
  plan?: string;
  createdAt: string;
  activatedAt?: string;
  onboardingStatus?: 'required' | 'in_progress' | 'complete';
  notes?: string;

  // Optional profile & operational properties
  logoUrl?: string;
  coverUrl?: string;
  description?: string;
  openingHours?: {
    open: string;
    close: string;
  };
  gpsLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null;
  subscriptionPrice?: number;
  subscriptionStartedAt?: string;
  subscribedAt?: string;
  nextRenewalDate?: string;
  paymentMethod?: string;
  paymentSubmittedAt?: string;
  rejectionReason?: string;
  isEmailVerified?: boolean;
}

export interface Product {
  id: string;
  ownerUid?: string;
  shopId: string;
  merchantId?: string;
  name: string;
  category: string;
  sellingPrice: number;
  costPrice?: number;
  stockQuantity: number;
  unit: string;
  availability: 'in_stock' | 'out_of_stock' | 'low_stock';
  barcode?: string;
  lowStockLevel?: number;
  imageUrl?: string;
  createdAt: string;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  unit: string;
}

export interface Transaction {
  id: string;
  ownerUid?: string;
  shopId: string;
  merchantId?: string;
  receiptNo: string;
  createdAt: string;
  items: TransactionItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'other';
}

export interface InventoryActivity {
  id: string;
  ownerUid?: string;
  shopId: string;
  merchantId?: string;
  productId: string;
  productName: string;
  action: string;
  quantity: number;
  details?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  shopId?: string;
  merchantId?: string;
  title: string;
  category: string;
  amount: number;
  createdAt: string;
  notes?: string;
}

export interface AdminUser {
  email: string;
  role: 'admin';
  name?: string;
  uid?: string;
}

export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PaymentRecord {
  id: string;
  merchantId: string;
  merchantName: string;
  ownerName?: string;
  phoneNumber?: string;
  email?: string;
  plan: string;
  amount: number;
  currency: string;
  paymentMethod: 'eft' | 'card' | 'snapscan';
  reference: string;
  status: PaymentStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface PresetAsset {
  id: string;
  name: string;
  url: string;
  category: string;
}
