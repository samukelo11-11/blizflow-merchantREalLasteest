/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Product, ShopProfile } from '../types';
import { PRODUCT_UNITS, BUSINESS_CATEGORIES } from '../data';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  Check, 
  TrendingDown, 
  X, 
  DollarSign, 
  ShoppingBag, 
  Layers,
  ArrowLeft,
  ChevronRight,
  Upload,
  Barcode,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  PackagePlus,
  QrCode
} from 'lucide-react';
import QrScanner from './QrScanner';

interface ProductManagementProps {
  shop: ShopProfile;
  products: Product[];
  isExpired?: boolean;
  onSubscribe?: () => void;
  onAddProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onBackToDashboard: () => void;
  initialAddOpen?: boolean;
}

export default function ProductManagement({
  shop,
  products,
  isExpired = false,
  onSubscribe,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onBackToDashboard,
  initialAddOpen = false
}: ProductManagementProps) {
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Form Modals State
  const [isFormOpen, setIsFormOpen] = useState(initialAddOpen);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields State
  const [name, setName] = useState('');
  const [pCategory, setPCategory] = useState(shop.category);
  const [price, setPrice] = useState<number>(0.00);
  const [costPrice, setCostPrice] = useState<number>(0.00);
  const [stock, setStock] = useState<number>(10);
  const [unit, setUnit] = useState<string>(PRODUCT_UNITS[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [barcode, setBarcode] = useState('');
  const [lowStockLevel, setLowStockLevel] = useState<number>(5);
  const [showScanner, setShowScanner] = useState(false);

  const [scannedDuplicateProduct, setScannedDuplicateProduct] = useState<Product | null>(null);

  // Form validations
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmations
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Quick Restock State
  const [restockingProduct, setRestockingProduct] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(20);

  // Check for prefilled barcode on load (e.g. redirected from POS scanner not found)
  useEffect(() => {
    const prefill = localStorage.getItem('blizflow_prefill_barcode');
    if (prefill) {
      resetForm();
      setBarcode(prefill);
      setIsFormOpen(true);
      setEditingProduct(null);
      localStorage.removeItem('blizflow_prefill_barcode');
    }
  }, []);

  // Reset form
  const resetForm = () => {
    setName('');
    setPCategory(shop.category);
    setPrice(0.00);
    setCostPrice(0.00);
    setStock(10);
    setUnit(PRODUCT_UNITS[0]);
    setImageUrl('');
    setBarcode('');
    setLowStockLevel(5);
    setFormError(null);
    setScannedDuplicateProduct(null);
  };

  const handleOpenAdd = () => {
    if (isExpired) {
      if (onSubscribe) onSubscribe();
      return;
    }
    setEditingProduct(null);
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    if (isExpired) {
      if (onSubscribe) onSubscribe();
      return;
    }
    setEditingProduct(product);
    setName(product.name);
    setPCategory(product.category);
    setPrice(product.sellingPrice);
    setCostPrice(product.costPrice !== undefined ? product.costPrice : 0.00);
    setStock(product.stockQuantity);
    setUnit(product.unit);
    setImageUrl(product.imageUrl || '');
    setBarcode(product.barcode || '');
    setLowStockLevel(product.lowStockLevel !== undefined ? product.lowStockLevel : 5);
    setFormError(null);
    setScannedDuplicateProduct(null);
    setIsFormOpen(true);
  };

  // Handle manual or scanned barcode changes
  const handleBarcodeChange = (val: string) => {
    const code = val.trim();
    setBarcode(val);
    setFormError(null);
    setScannedDuplicateProduct(null);

    if (code) {
      const matched = products.find(p => p.barcode === code && (!editingProduct || p.id !== editingProduct.id));
      if (matched) {
        setScannedDuplicateProduct(matched);
        setFormError(`Product already exists in your inventory! This barcode belongs to "${matched.name}". Duplicate products cannot be saved with the same barcode.`);
      }
    }
  };

  // Upload Product photo
  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setImageUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      return setFormError('Product Name is required.');
    }
    if (!pCategory) {
      return setFormError('Category is required.');
    }
    if (price <= 0) {
      return setFormError('Selling Price (R) is required and must be greater than R0.00.');
    }
    if (costPrice <= 0) {
      return setFormError('Cost Price (R) is required and must be greater than R0.00.');
    }
    if (stock < 0 || stock === null) {
      return setFormError('Stock count must be a valid number (0 or more).');
    }
    if (lowStockLevel < 0) {
      return setFormError('Low Stock Threshold cannot be negative.');
    }

    // Secondary duplicate verification
    if (barcode.trim()) {
      const matched = products.find(p => p.barcode === barcode.trim() && (!editingProduct || p.id !== editingProduct.id));
      if (matched) {
        setScannedDuplicateProduct(matched);
        return setFormError(`Product already exists in your inventory! This barcode belongs to "${matched.name}". Duplicate products cannot be saved with the same barcode.`);
      }
    }

    const finalProduct: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      shopId: shop.id,
      imageUrl: imageUrl,
      name: name.trim(),
      category: pCategory,
      sellingPrice: Number(price),
      costPrice: Number(costPrice),
      stockQuantity: Number(stock),
      unit,
      availability: Number(stock) > 0 ? 'in_stock' : 'out_of_stock',
      createdAt: editingProduct ? editingProduct.createdAt : new Date().toISOString(),
      barcode: barcode.trim() || undefined,
      lowStockLevel: Number(lowStockLevel),
    };

    if (editingProduct) {
      onEditProduct(finalProduct);
    } else {
      onAddProduct(finalProduct);
    }

    setIsFormOpen(false);
    resetForm();
  };

  // Filter products based on search and category tab
  const filteredProducts = products.filter((prod) => {
    const matchesSearch = prod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          prod.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || prod.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Get active categories list present in product catalog to filter dynamically
  const existingProductCategories = Array.from(new Set(products.map((p) => p.category)));

  // Easy tap adjustments for smartphone accessibility
  const adjustStock = (amount: number) => {
    setStock(prev => Math.max(0, prev + amount));
  };

  const adjustPrice = (amount: number) => {
    setPrice(prev => Math.max(0, prev + amount));
  };

  return (
    <div className="bg-slate-50 min-h-screen py-8 px-4 sm:px-6 font-sans">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToDashboard}
              className="p-2.5 bg-white border border-slate-100 hover:bg-slate-50 rounded-xl transition shadow-xs text-slate-500 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-950 tracking-tight">Product Catalog</h1>
              <p className="text-xs text-slate-500 mt-0.5">Manage your stock counts and pricing details</p>
            </div>
          </div>
          <button
            onClick={handleOpenAdd}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-5 py-3 rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3px]" /> Add New Product
          </button>
        </div>

        {/* Search & Dynamic Filter Pill Row */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col gap-4">
          <div className="w-full">
            
            {/* Standard search */}
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-3.5 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search product name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-12 text-sm outline-none focus:border-indigo-600 focus:bg-white transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

          </div>

          {/* Dynamic Categories Tab Scroller */}
          {existingProductCategories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0 cursor-pointer ${
                  selectedCategory === 'all' 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Categories ({products.length})
              </button>
              {existingProductCategories.map((cat) => {
                const count = products.filter((p) => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition flex-shrink-0 cursor-pointer ${
                      selectedCategory === cat 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Grid / Empty State */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-16 px-6 text-center shadow-xs flex flex-col items-center max-w-lg mx-auto w-full">
            <div className="bg-indigo-50 text-indigo-600 p-4 rounded-full mb-4">
              <ShoppingBag className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-950 mb-1.5">
              {searchQuery || selectedCategory !== 'all' ? 'No products found' : 'No products yet'}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-sm">
              {searchQuery || selectedCategory !== 'all' 
                ? "We couldn't find any products matching your current search parameters."
                : "No products yet. Add your first product to see it here."}
            </p>
            {searchQuery || selectedCategory !== 'all' ? (
              <button
                onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer"
              >
                Reset Search Filters
              </button>
            ) : (
              <button
                onClick={handleOpenAdd}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-3 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3px]" /> Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4.5">
            {filteredProducts.map((prod) => (
              <div 
                key={prod.id} 
                className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden flex flex-col hover:border-slate-200 transition"
                id={`product-${prod.id}`}
              >
                {/* Header Image Frame */}
                <div className="relative aspect-square bg-slate-50 border-b border-slate-100 flex items-center justify-center overflow-hidden">
                  {prod.imageUrl ? (
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
                      <ShoppingBag className="w-8 h-8 text-slate-300 mb-1.5" />
                      <span className="text-xs font-semibold text-slate-400">Upload your photo</span>
                    </div>
                  )}
                  
                  {/* Status Overlay Badge */}
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    {prod.stockQuantity === 0 || prod.availability === 'out_of_stock' ? (
                      <span className="bg-red-600 text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
                        Out of stock
                      </span>
                    ) : prod.stockQuantity <= (prod.lowStockLevel !== undefined ? prod.lowStockLevel : 5) ? (
                      <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
                        Low Stock ({prod.stockQuantity})
                      </span>
                    ) : (
                      <span className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
                        In Stock
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setRestockingProduct(prod);
                        setRestockAmount(20);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer"
                      title="Quick Restock"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      <span>Restock</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(prod)}
                      className="bg-white/90 hover:bg-white text-slate-700 p-2 rounded-lg transition shadow-xs cursor-pointer"
                      title="Edit Product"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(prod.id)}
                      className="bg-white/90 hover:bg-red-600 hover:text-white text-red-600 p-2 rounded-lg transition shadow-xs cursor-pointer"
                      title="Delete Product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-4.5 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">
                      {prod.category}
                    </span>
                    <h3 className="font-bold text-slate-900 mt-1 line-clamp-2 leading-tight">
                      {prod.name}
                    </h3>
                    {prod.barcode && (
                      <span className="text-[9px] font-mono text-slate-400 block mt-1">
                        Barcode: {prod.barcode}
                      </span>
                    )}
                  </div>

                  <div className="pt-3.5 mt-3.5 border-t border-slate-50 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Selling Price</p>
                      <p className="text-sm font-black text-slate-900 mt-0.5">
                        R {prod.sellingPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Stock Count</p>
                      <p className="text-xs font-semibold text-slate-700 mt-0.5">
                        {prod.stockQuantity} {prod.unit}{prod.stockQuantity !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {prod.costPrice !== undefined && prod.costPrice > 0 && (
                      <div className="col-span-2 pt-1.5 border-t border-dashed border-slate-100 flex justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">Cost Price: R {prod.costPrice.toFixed(2)}</span>
                        <span className="text-emerald-600 font-bold">
                          Profit: R {(prod.sellingPrice - prod.costPrice).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delete Confirmation Modal Overlay (Scoped per card to avoid popup bugs) */}
                {confirmDeleteId === prod.id && (
                  <div className="absolute inset-0 bg-white/95 p-4 flex flex-col items-center justify-center text-center z-10">
                    <div className="bg-red-50 text-red-600 p-3 rounded-full mb-3">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-slate-950 text-sm">Delete this product?</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                      This action is permanent and cannot be undone.
                    </p>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-lg cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          onDeleteProduct(prod.id);
                          setConfirmDeleteId(null);
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg cursor-pointer"
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Slide-over Form Overlay Panel (Custom tailored, clean UI) */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="border-b border-slate-100 px-5.5 py-4 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-slate-900">
                {editingProduct ? 'Edit Inventory Product' : 'Add New Inventory Product'}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-5.5 mt-4 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold p-3.5 rounded-xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-5.5 space-y-5">
              
              {/* Barcode Manual Entry Guide (Temporary fallback during development) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-3xs">
                <p className="text-[11px] text-slate-600 font-medium text-center">
                  To import or add a product, simply type the barcode digits directly into the <strong>Barcode (Optional)</strong> field below.
                </p>
              </div>

              {/* Scanned / Typed Duplicate Alert */}
              {scannedDuplicateProduct && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex flex-col gap-2.5 shadow-2xs">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-amber-800">Product Already Exists</p>
                      <p className="text-[11px] text-amber-700 mt-0.5 leading-normal">
                        This barcode is already registered to <strong>{scannedDuplicateProduct.name}</strong> in your inventory.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenEdit(scannedDuplicateProduct);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition"
                    >
                      Edit "{scannedDuplicateProduct.name}"
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBarcode('');
                        setScannedDuplicateProduct(null);
                        setFormError(null);
                      }}
                      className="bg-white border border-amber-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-lg transition"
                    >
                      Clear Barcode
                    </button>
                  </div>
                </div>
              )}

              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fresh Whole Wheat Bread"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm text-slate-900"
                />
              </div>

              {/* Product Category */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={pCategory}
                  onChange={(e) => setPCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm text-slate-900 appearance-none font-medium"
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cost Price and Selling Price side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Cost Price */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Cost Price (R) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm font-bold text-slate-900"
                  />
                </div>

                {/* Selling Price */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Selling Price (R) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={price || ''}
                    onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Stock count and selling unit side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Stock Quantity with + and - */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Stock Quantity <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => adjustStock(-1)}
                      className="w-9 h-9 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-lg flex items-center justify-center font-black text-lg select-none cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      required
                      placeholder="10"
                      value={stock === 0 && stock !== null ? '0' : stock || ''}
                      onChange={(e) => setStock(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none text-center text-sm font-bold text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => adjustStock(1)}
                      className="w-9 h-9 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-lg flex items-center justify-center font-black text-lg select-none cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Selling Unit Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Selling Unit
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm text-slate-900 appearance-none font-medium"
                  >
                    {PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Barcode and Low Stock Threshold side-by-side */}
              <div className="grid grid-cols-2 gap-4">
                {/* Manual Barcode Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Barcode (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="text-indigo-600 hover:text-indigo-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                      title="Scan barcode with camera"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Scan
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 600123456789"
                    value={barcode}
                    onChange={(e) => handleBarcodeChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm text-slate-900 font-mono"
                  />
                </div>

                {/* Low Stock Threshold */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Low Stock Threshold <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={lowStockLevel}
                    onChange={(e) => setLowStockLevel(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm text-slate-900 font-bold"
                  />
                </div>
              </div>

              {/* Optional Product Image */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Product Image (Optional)
                </label>
                <div className="flex items-center gap-4 bg-slate-50 border border-dashed border-slate-200 p-4 rounded-xl">
                  {/* Image Placeholder */}
                  <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Uploaded Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-slate-100 flex flex-col items-center justify-center text-indigo-500">
                        <ShoppingBag className="w-5 h-5 text-indigo-400" />
                        <span className="text-[8px] font-black text-indigo-600 uppercase tracking-tight">No Photo</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProductImageUpload}
                      id="product-image-file"
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <label
                        htmlFor="product-image-file"
                        className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                        Choose Photo
                      </label>
                      {imageUrl && (
                        <button
                          type="button"
                          onClick={() => setImageUrl('')}
                          className="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {barcode.trim() ? (
                      <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-2 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span className="text-[9px] text-emerald-800 font-medium">
                          Barcode linked. Auto-sync will find product images in database.
                        </span>
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-400 mt-1">
                        PNG, JPG. Optional format.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Save & Cancel Actions */}
              <div className="border-t border-slate-100 pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-5 py-3 rounded-xl transition shadow-sm shadow-indigo-600/10 cursor-pointer min-w-[120px]"
                >
                  {editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <QrScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onDetected={(scannedVal) => {
          setShowScanner(false);
          handleBarcodeChange(scannedVal);
        }}
        title="Scan Barcode for Product"
      />

      {/* Quick Restock Modal */}
      {restockingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Quick Restock</h3>
                  <p className="text-[11px] text-slate-400">Add incoming inventory</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestockingProduct(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
              <div className="text-xs font-bold text-slate-800 line-clamp-1">
                {restockingProduct.name}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Current Stock:</span>
                <span className="font-extrabold text-slate-900">
                  {restockingProduct.stockQuantity} {restockingProduct.unit}(s)
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 block">
                Quantity to Add
              </label>

              {/* Quick Increment Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 20, 50].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setRestockAmount(qty)}
                    className={`py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
                      restockAmount === qty
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    +{qty}
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                  placeholder="Custom quantity"
                />
              </div>

              {/* Result Preview */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="text-indigo-900 font-medium">New Stock Level:</span>
                <span className="font-black text-indigo-700 text-sm">
                  {restockingProduct.stockQuantity + (restockAmount || 0)} {restockingProduct.unit}(s)
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRestockingProduct(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const updatedStock = Math.max(0, restockingProduct.stockQuantity + (restockAmount || 0));
                  onEditProduct({
                    ...restockingProduct,
                    stockQuantity: updatedStock,
                    availability: updatedStock > 0 ? 'in_stock' : 'out_of_stock'
                  });
                  setRestockingProduct(null);
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition shadow-xs cursor-pointer"
              >
                Save Restock
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
