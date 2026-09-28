import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle, 
  AlertCircle, 
  ArrowLeft,
  Coins,
  Star,
  History,
  Sparkles,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  RefreshCw,
  X,
  Clock,
  Share2
} from 'lucide-react';

interface POSProps {
  products: Product[];
  isExpired?: boolean;
  onSubscribe?: () => void;
  onCompleteSale: (
    items: { productId: string; quantity: number }[],
    saleDetails?: { paymentMethod?: 'cash' | 'card' | 'other'; receiptNo?: string }
  ) => Promise<void> | void;
  onBackToDashboard: () => void;
  onNavigate?: (view: string) => void;
  onCreateProductWithBarcode?: (barcode: string) => void;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface ReceiptData {
  receiptNo: string;
  items: {
    id: string;
    name: string;
    price: number;
    qty: number;
    unit: string;
  }[];
  subtotal: number;
  vat: number;
  grandTotal: number;
  paymentMethod: 'cash' | 'card' | 'other';
  cashTendered?: number;
  change?: number;
  date: string;
  time: string;
}

const VAT_RATE = 0.15; // 15% South African VAT rate

export default function POS({ 
  products, 
  isExpired = false,
  onSubscribe,
  onCompleteSale, 
  onBackToDashboard, 
  onNavigate
}: POSProps) {
  const [activeTab, setActiveTab] = useState<'quick' | 'catalog'>('quick');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('blizflow_pos_cart');
    return saved ? JSON.parse(saved) : [];
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Checkout Flow States
  const [posStatus, setPosStatus] = useState<'selling' | 'checkout' | 'confirm' | 'receipt'>('selling');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash');
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);

  // Shop Name from localStorage
  const shopName = useMemo(() => {
    try {
      const saved = localStorage.getItem('blizflow_shop');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.name || 'Spaza Store';
      }
    } catch (e) {
      // fallback
    }
    return 'Spaza Store';
  }, []);

  // Favourites state synced with localStorage
  const [starredProductIds, setStarredProductIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('blizflow_pos_starred');
    return saved ? JSON.parse(saved) : [];
  });

  // Recent selections state synced with localStorage
  const [recentProductIds, setRecentProductIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('blizflow_pos_recent');
    return saved ? JSON.parse(saved) : [];
  });

  // Save starred products to localStorage
  useEffect(() => {
    localStorage.setItem('blizflow_pos_starred', JSON.stringify(starredProductIds));
  }, [starredProductIds]);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem('blizflow_pos_cart', JSON.stringify(cart));
  }, [cart]);

  // Audio feedback for simulated or camera scan
  const playBeep = (type: 'success' | 'warning' = 'success') => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      if (type === 'success') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime); // High pitch beep
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.12);
      } else {
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, audioCtx.currentTime); // Low buzz
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.25);
      }
    } catch (e) {
      // Audio feedback not supported or blocked by browser permissions
    }
  };

  // Toggle dynamic Star / Favourite product
  const toggleStarProduct = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid adding to cart on star click
    setStarredProductIds(prev => {
      const isStarred = prev.includes(productId);
      if (isStarred) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  // Extract unique categories for full catalog filtering
  const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];

  // Filtering products for the catalog tab
  const filteredProducts = products.filter(p => {
    const query = searchQuery.trim().toLowerCase();
    if (query === '') {
      return selectedCategory === 'All' || p.category === selectedCategory;
    }

    // Split search query by whitespaces to support multi-term matching (e.g. "Bread White")
    const terms = query.split(/\s+/);
    const matchesSearch = terms.every(term => 
      p.name.toLowerCase().includes(term) || 
      p.category.toLowerCase().includes(term) ||
      (p.barcode && p.barcode.toLowerCase().includes(term))
    );

    // If searching actively, we do not restrict by the selected category to ensure global instant discovery,
    // but if the user wants to narrow it down, they can still filter (we will also reset category to 'All' on input)
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Derived collections for Quick Sale tab
  const starredProducts = products.filter(p => starredProductIds.includes(p.id));
  const recentProducts = products.filter(p => recentProductIds.includes(p.id));

  // Suggest default favorites for fast tapping (e.g. Kota, Vetkoek, Bread, Milk, etc.)
  const keywords = ['kota', 'vetkoek', 'magwinya', 'bread', 'milk', 'chips', 'drink', 'cooldrink', 'soda'];
  const suggestedFavorites = products.filter(p => 
    !starredProductIds.includes(p.id) && 
    keywords.some(k => p.name.toLowerCase().includes(k) || p.category.toLowerCase().includes(k))
  ).slice(0, 6);

  // Totals calculations — resolve current product data to avoid stale cart prices
  const cartGrandTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const currentProduct = products.find(p => p.id === item.product.id);
      const price = currentProduct?.sellingPrice ?? item.product.sellingPrice;
      return sum + (price * item.quantity);
    }, 0);
  }, [cart, products]);

  const cartSubtotal = useMemo(() => {
    return cartGrandTotal / (1 + VAT_RATE);
  }, [cartGrandTotal]);

  const cartVat = useMemo(() => {
    return cartGrandTotal - cartSubtotal;
  }, [cartGrandTotal, cartSubtotal]);

  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Cash change calculations
  const parsedCashTendered = parseFloat(cashTenderedInput) || 0;
  const cashChange = parsedCashTendered - cartGrandTotal;

  // Handle adding product to cart
  const addToCart = (product: Product, qty: number = 1) => {
    if (product.stockQuantity <= 0) {
      setErrorMessage(`"${product.name}" is Out of Stock!`);
      playBeep('warning');
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        const nextQty = existing.quantity + qty;
        if (nextQty > product.stockQuantity) {
          setErrorMessage(`Cannot add more "${product.name}". Only ${product.stockQuantity} in stock.`);
          playBeep('warning');
          return prev;
        }
        setErrorMessage(null);
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: nextQty } : item);
      } else {
        if (qty > product.stockQuantity) {
          setErrorMessage(`Cannot add more "${product.name}". Only ${product.stockQuantity} in stock.`);
          playBeep('warning');
          return prev;
        }
        setErrorMessage(null);
        return [...prev, { product, quantity: qty }];
      }
    });
  };

  // Handle manual quantity changes
  const updateQuantity = (productId: string, qty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== productId));
      return;
    }

    if (qty > product.stockQuantity) {
      setErrorMessage(`Only ${product.stockQuantity} items in stock for "${product.name}".`);
      playBeep('warning');
      return;
    }

    setErrorMessage(null);
    setCart(prev => prev.map(item => item.product.id === productId ? { ...item, quantity: qty } : item));
  };

  // Open Checkout Modal
  const handleStartCheckout = () => {
    if (cart.length === 0) return;
    setPaymentMethod('cash');
    setCashTenderedInput(cartGrandTotal.toFixed(2));
    setPosStatus('checkout');
  };

  const [isProcessingSale, setIsProcessingSale] = useState(false);

  // Finalize Sale
  const handleFinalizeSale = async () => {
    if (cart.length === 0 || isProcessingSale) return;

    const receiptNo = `RCP-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    
    // Resolve current product data for receipt to avoid stale prices/names
    const receiptData: ReceiptData = {
      receiptNo,
      items: cart.map(i => {
        const currentProduct = products.find(p => p.id === i.product.id);
        return {
          id: i.product.id,
          name: currentProduct?.name ?? i.product.name,
          price: currentProduct?.sellingPrice ?? i.product.sellingPrice,
          qty: i.quantity,
          unit: currentProduct?.unit ?? i.product.unit
        };
      }),
      subtotal: cartSubtotal,
      vat: cartVat,
      grandTotal: cartGrandTotal,
      paymentMethod,
      cashTendered: paymentMethod === 'cash' ? parsedCashTendered : undefined,
      change: paymentMethod === 'cash' ? Math.max(0, cashChange) : undefined,
      date: now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }),
      time: now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // Update recent products state (useEffect handles localStorage persistence)
    const cartProductIds = cart.map(item => item.product.id);
    setRecentProductIds(prev => {
      const merged = [...cartProductIds, ...prev];
      const unique = Array.from(new Set(merged)).slice(0, 8);
      return unique;
    });

    setIsProcessingSale(true);
    setErrorMessage(null);

    try {
      // Save to App State / Database via atomic transaction
      await onCompleteSale(
        cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        { paymentMethod, receiptNo }
      );

      playBeep('success');
      setLastReceipt(receiptData);
      setCart([]);
      setErrorMessage(null);
      setPosStatus('receipt');
    } catch (error: unknown) {
      console.error('Sale completion failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to complete transaction. Storage or database issue.';
      setErrorMessage(message);
      setPosStatus('selling');
      playBeep('warning');
    } finally {
      setIsProcessingSale(false);
    }
  };

  // Reset to new sale
  const handleResetNewSale = () => {
    setPosStatus('selling');
    setPaymentMethod('cash');
    setCashTenderedInput('');
  };

  // Print Receipt — only print the receipt card, not the entire POS screen
  const handlePrintReceipt = () => {
    const style = document.createElement('style');
    style.id = 'pos-print-style';
    style.innerHTML = `
      @media print {
        body * { visibility: hidden !important; }
        #printable-receipt, #printable-receipt * { visibility: visible !important; }
        #printable-receipt { position: absolute; left: 0; top: 0; width: 100%; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => {
      const existing = document.getElementById('pos-print-style');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    }, 100);
  };

  // WhatsApp Digital Receipt Sharing
  const handleShareWhatsAppReceipt = () => {
    if (!lastReceipt) return;
    const lines = [
      `🧾 *${shopName.toUpperCase()}*`,
      `*Receipt:* ${lastReceipt.receiptNo}`,
      `*Date:* ${lastReceipt.date} • ${lastReceipt.time}`,
      `--------------------------------`,
      ...lastReceipt.items.map(it => `• ${it.qty}x ${it.name} - R${(it.price * it.qty).toFixed(2)}`),
      `--------------------------------`,
      `*Subtotal:* R${lastReceipt.subtotal.toFixed(2)}`,
      `*VAT (15%):* R${lastReceipt.vat.toFixed(2)}`,
      `*TOTAL DUE:* R${lastReceipt.grandTotal.toFixed(2)}`,
      `*Payment:* ${lastReceipt.paymentMethod.toUpperCase()}`,
      ...(lastReceipt.paymentMethod === 'cash' ? [
        `*Cash Tendered:* R${(lastReceipt.cashTendered || 0).toFixed(2)}`,
        `*Change:* R${(lastReceipt.change || 0).toFixed(2)}`
      ] : []),
      `--------------------------------`,
      `Thank you for your business! 🙏`,
      `_Powered by BlizFlow POS_`
    ];
    const receiptText = lines.join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: `Receipt from ${shopName}`,
        text: receiptText,
      }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(receiptText)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(receiptText)}`, '_blank');
    }
  };

  if (isExpired) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 min-h-[70vh] font-sans">
        <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-200">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Free Trial Has Ended</h2>
            <p className="text-xs text-slate-500 leading-relaxed mt-2">
              Your free trial has ended. To continue recording sales and checking out customers, please activate a premium plan.
            </p>
          </div>
          
          <div className="space-y-2 pt-2">
            <button 
              onClick={onSubscribe}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md shadow-indigo-600/10"
            >
              View Subscription Plans
            </button>
            <button 
              onClick={onBackToDashboard}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen py-8 px-4 sm:px-6 font-sans">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        
        {/* Navigation & Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToDashboard}
              className="p-2.5 bg-white border border-slate-100 hover:bg-slate-50 rounded-xl transition shadow-xs text-slate-500 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-950 tracking-tight">Point of Sale (POS)</h1>
              <p className="text-xs text-slate-500 mt-0.5">Search items or tap Quick Favourites to complete checkout</p>
            </div>
          </div>
        </div>

        {/* Messaging Area */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-100 text-red-800 p-4 rounded-xl flex items-center gap-3.5 shadow-xs relative">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="pr-6">
              <p className="text-xs font-black uppercase tracking-wider">Transaction Warning</p>
              <p className="text-[11px] mt-0.5 text-red-700 font-medium">{errorMessage}</p>
            </div>
            <button 
              onClick={() => setErrorMessage(null)} 
              className="absolute top-2 right-2.5 text-red-400 hover:text-red-700 text-xs font-bold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 2-Column Split */}
        <div className="grid lg:grid-cols-12 gap-6">
          
          {/* Left: Product Selector & Barcode Panel (7 Cols) */}
          <div className="lg:col-span-7 space-y-5">
            
            {/* Search Input Panel */}
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Product Instant Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5" />
                  <input
                    type="text"
                    placeholder="Search name, category, or barcode..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      if (val.trim() !== '') {
                        setSelectedCategory('All'); // Reset category selection to 'All' so search is global
                      }
                      if (activeTab !== 'catalog') {
                        setActiveTab('catalog'); // Swap tabs automatically for immediate search feedback
                      }
                    }}
                    className="w-full pl-9.5 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-xs text-slate-900"
                  />
                </div>
                <span className="text-[9px] text-slate-400 block mt-2 font-medium">
                  Type here to instantly search the catalog by name, category, or barcode (e.g. kota, vetkoek, bread).
                </span>
              </div>
            </div>

            {/* Product Selector Interface with Navigation Tabs */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              
              {/* Tab selectors */}
              <div className="border-b border-slate-100 flex items-center justify-between pb-1">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('quick')}
                    className={`pb-2.5 font-black text-xs uppercase tracking-wider relative transition-all cursor-pointer ${
                      activeTab === 'quick' 
                        ? 'text-indigo-600 border-b-2 border-indigo-600' 
                        : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'
                    }`}
                  >
                    ⚡ Quick Items / Favourites
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalog')}
                    className={`pb-2.5 font-black text-xs uppercase tracking-wider relative transition-all cursor-pointer ${
                      activeTab === 'catalog' 
                        ? 'text-indigo-600 border-b-2 border-indigo-600' 
                        : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'
                    }`}
                  >
                    🗂️ Full Catalog & Search
                  </button>
                </div>
                <span className="text-[10px] bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                  {activeTab === 'quick' ? 'Fast Tap List' : `${filteredProducts.length} Products`}
                </span>
              </div>

              {/* TAB 1 CONTENT: QUICK SALE / FAVORITES */}
              {activeTab === 'quick' && (
                <div className="space-y-4.5">
                  
                  {/* Section A: Starred Favourites */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Starred Favourites
                      </h3>
                      <p className="text-[10px] text-slate-400">Tap to add instantly</p>
                    </div>

                    {starredProducts.length === 0 ? (
                      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4.5 text-center">
                        <p className="text-xs font-semibold text-slate-600">No custom favourites saved yet</p>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto">
                          Star products in the <strong>Full Catalog & Search</strong> tab to pin items here.
                        </p>
                        
                        {/* Show suggested defaults if any */}
                        {suggestedFavorites.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-left mb-2">Suggested Favourites:</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {suggestedFavorites.map(p => (
                                <div
                                  key={p.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => addToCart(p)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') addToCart(p); }}
                                  className="p-2.5 bg-white border border-slate-200/80 rounded-lg hover:border-indigo-400 hover:shadow-2xs transition text-left cursor-pointer flex flex-col justify-between h-20"
                                >
                                  <span className="text-xs font-bold text-slate-800 line-clamp-1">{p.name}</span>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-[10px] font-black text-slate-900">R {p.sellingPrice.toFixed(2)}</span>
                                    <button 
                                      type="button"
                                      onClick={(e) => toggleStarProduct(p.id, e)}
                                      className="p-1 hover:bg-slate-50 rounded"
                                      title="Pin as Favourite"
                                    >
                                      <Star className="w-3 h-3 text-slate-300 hover:text-amber-400" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                        {starredProducts.map((prod) => {
                          const isOutOfStock = prod.stockQuantity <= 0;
                          const isLowStock = prod.stockQuantity > 0 && prod.stockQuantity <= (prod.lowStockLevel || 5);
                          return (
                            <div
                              key={prod.id}
                              role="button"
                              tabIndex={isOutOfStock ? -1 : 0}
                              onClick={() => !isOutOfStock && addToCart(prod)}
                              onKeyDown={(e) => { if (!isOutOfStock && (e.key === 'Enter' || e.key === ' ')) addToCart(prod); }}
                              className={`text-left p-3 rounded-xl border transition flex flex-col justify-between h-28 relative select-none ${
                                isOutOfStock 
                                  ? 'bg-slate-50 border-slate-200/50 opacity-60 cursor-not-allowed'
                                  : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-2xs cursor-pointer'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider capitalize truncate max-w-[70px]">
                                  {prod.category}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => toggleStarProduct(prod.id, e)}
                                  className="p-1 bg-amber-50 hover:bg-amber-100 rounded-lg transition"
                                  title="Unstar product"
                                >
                                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                </button>
                              </div>

                              <div>
                                <p className="text-xs font-black text-slate-900 line-clamp-1 pr-1">{prod.name}</p>
                                <span className="text-[10px] font-black text-indigo-600 block mt-0.5">R {prod.sellingPrice.toFixed(2)}</span>
                              </div>

                              <div className="flex items-center justify-between pt-1 border-t border-slate-50 text-[9px] text-slate-400">
                                <span>Stock: <strong>{prod.stockQuantity}</strong></span>
                                {isOutOfStock && <span className="text-red-500 font-bold uppercase">OUT</span>}
                                {isLowStock && <span className="text-amber-500 font-bold uppercase">LOW</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section B: Recent Sales Selections */}
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                      <History className="w-3.5 h-3.5 text-indigo-500" /> Recently Sold Products
                    </h3>

                    {recentProducts.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic bg-slate-50/50 border border-slate-100 rounded-xl p-3 text-center">
                        Your recently completed checkout items will show up here for fast 1-tap re-selling.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {recentProducts.map(prod => {
                          const isOutOfStock = prod.stockQuantity <= 0;
                          return (
                            <button
                              key={prod.id}
                              disabled={isOutOfStock}
                              onClick={() => addToCart(prod)}
                              className="p-2.5 bg-slate-50 hover:bg-white hover:shadow-3xs border border-slate-100 hover:border-indigo-100 rounded-xl transition text-left cursor-pointer flex flex-col justify-between h-20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span className="text-[11px] font-bold text-slate-800 line-clamp-2 leading-tight">{prod.name}</span>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-extrabold text-slate-900">R {prod.sellingPrice.toFixed(2)}</span>
                                <span className="text-slate-400">({prod.stockQuantity} {prod.unit})</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB 2 CONTENT: FULL CATALOG & SEARCH */}
              {activeTab === 'catalog' && (
                <div className="space-y-4">
                  
                  {/* Category Pill Filters */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider border whitespace-nowrap transition cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs shadow-indigo-600/10'
                            : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-8 text-center flex flex-col items-center">
                      <p className="text-xs text-slate-500 max-w-xs">
                        No products found matching your active filter. Try searching for other keywords.
                      </p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[42vh] overflow-y-auto pr-1">
                      {filteredProducts.map((prod) => {
                        const isOutOfStock = prod.stockQuantity <= 0;
                        const isLowStock = prod.stockQuantity > 0 && prod.stockQuantity <= (prod.lowStockLevel || 5);
                        const isStarred = starredProductIds.includes(prod.id);
                        return (
                          <div
                            key={prod.id}
                            onClick={() => !isOutOfStock && addToCart(prod)}
                            className={`text-left p-3 rounded-xl border transition flex flex-col justify-between h-32 relative select-none cursor-pointer ${
                              isOutOfStock 
                                ? 'bg-slate-50 border-slate-200/50 opacity-60 cursor-not-allowed'
                                : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-xs'
                            }`}
                          >
                            {/* Star Toggle on Top Right */}
                            <button
                              type="button"
                              onClick={(e) => toggleStarProduct(prod.id, e)}
                              className="absolute top-2.5 right-2.5 p-1 hover:bg-slate-100 rounded-lg transition z-10"
                              title={isStarred ? "Remove from Favourites" : "Mark as Favourite"}
                            >
                              <Star className={`w-4.5 h-4.5 transition-transform hover:scale-110 ${isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                            </button>

                            <div>
                              <p className="text-xs font-black text-slate-900 leading-tight line-clamp-2 pr-6">{prod.name}</p>
                              <span className="text-[9px] text-slate-400 capitalize mt-0.5 block">{prod.category}</span>
                            </div>

                            {/* Tags for Stock Status */}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {isOutOfStock ? (
                                <span className="bg-red-100 text-red-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                  Out of Stock
                                </span>
                              ) : isLowStock ? (
                                <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                  Low Stock Alert
                                </span>
                              ) : null}
                              {prod.barcode && (
                                <span className="bg-slate-100 text-slate-500 text-[8px] font-mono font-bold px-1 rounded">
                                  [|| {prod.barcode}]
                                </span>
                              )}
                            </div>

                            <div className="flex items-end justify-between mt-2 pt-2 border-t border-slate-50">
                              <div>
                                <span className="text-[10px] text-slate-400 block font-medium">Price</span>
                                <span className="text-xs font-black text-slate-900">R {prod.sellingPrice.toFixed(2)}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block font-medium">Available</span>
                                <span className={`text-[10px] font-bold ${isOutOfStock ? 'text-red-600' : isLowStock ? 'text-amber-600' : 'text-slate-600'}`}>
                                  {prod.stockQuantity} {prod.unit}s
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>

          </div>

          {/* Right: Cart & Active Ticket (5 Cols) */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col h-[70vh] justify-between overflow-hidden">
              
              {/* Cart Header */}
              <div className="border-b border-slate-100 p-4 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4.5 h-4.5 text-indigo-600" />
                  <h2 className="font-black text-sm text-slate-950 uppercase tracking-tight">Active Ticket</h2>
                </div>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-[10px] text-slate-400 hover:text-red-600 font-bold transition cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                  <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    {totalItemCount} Items
                  </span>
                </div>
              </div>

              {/* Cart Items List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                    <ShoppingCart className="w-10 h-10 text-slate-200 stroke-[1.5px]" />
                    <div>
                      <p className="text-xs font-bold text-slate-500">Checkout cart is empty</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 max-w-[200px] mx-auto">
                        Search or tap Quick Favourites to add products to the active ticket.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {cart.map((item) => {
                      const currentProduct = products.find(p => p.id === item.product.id);
                      const displayProduct = currentProduct || item.product;
                      return (
                        <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-xs text-slate-900 truncate leading-snug">{displayProduct.name}</p>
                            <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                              {displayProduct.unit} @ R {displayProduct.sellingPrice.toFixed(2)}
                            </span>
                          </div>
                          
                          {/* Qty controls */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                              className="w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center text-xs cursor-pointer select-none font-bold transition"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black text-slate-950 min-w-[22px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                              disabled={item.quantity >= displayProduct.stockQuantity}
                              className="w-6 h-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center text-xs cursor-pointer select-none font-bold transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="text-right min-w-[70px] flex items-center justify-end gap-2">
                            <span className="font-black text-xs text-slate-950">
                              R {(displayProduct.sellingPrice * item.quantity).toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, 0)}
                              className="text-slate-300 hover:text-red-500 transition cursor-pointer"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Running Totals & Checkout Trigger */}
              <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-slate-500 font-medium">
                    <span>Subtotal (Excl. VAT)</span>
                    <span>R {cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500 font-medium">
                    <span>VAT ({(VAT_RATE * 100).toFixed(0)}%)</span>
                    <span>R {cartVat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                    <span className="font-black text-sm text-slate-950 uppercase tracking-tight">Grand Total</span>
                    <span className="font-black text-base text-indigo-600">R {cartGrandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStartCheckout}
                  disabled={cart.length === 0}
                  className={`w-full font-extrabold text-sm px-4 py-3.5 rounded-xl transition flex items-center justify-center gap-2 shadow-sm ${
                    cart.length === 0
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/15 cursor-pointer'
                  }`}
                >
                  <Coins className="w-4.5 h-4.5" />
                  <span>
                    {cart.length === 0 
                      ? 'Add Items to Checkout' 
                      : `Checkout — R ${cartGrandTotal.toFixed(2)}`}
                  </span>
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* MODAL 1: CHECKOUT PAYMENT METHOD SELECTOR */}
      {posStatus === 'checkout' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 relative">
            <button
              onClick={() => setPosStatus('selling')}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-extrabold px-3 py-1 rounded-full mb-1">
                <Coins className="w-3.5 h-3.5" />
                <span>Step 1 of 2: Payment</span>
              </div>
              <h2 className="text-xl font-black text-slate-950">Select Payment Method</h2>
              <p className="text-xs text-slate-500 mt-0.5">Total due: <strong className="text-indigo-600 text-sm">R {cartGrandTotal.toFixed(2)}</strong> ({totalItemCount} items)</p>
            </div>

            {/* Payment Options Grid */}
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('cash');
                  if (!cashTenderedInput) setCashTenderedInput(cartGrandTotal.toFixed(2));
                }}
                className={`p-3.5 rounded-2xl border text-center transition flex flex-col items-center gap-2 cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Banknote className={`w-6 h-6 ${paymentMethod === 'cash' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="text-xs font-black">💵 Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3.5 rounded-2xl border text-center transition flex flex-col items-center gap-2 cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm shadow-blue-500/10'
                    : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CreditCard className={`w-6 h-6 ${paymentMethod === 'card' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="text-xs font-black">💳 Card</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('other')}
                className={`p-3.5 rounded-2xl border text-center transition flex flex-col items-center gap-2 cursor-pointer ${
                  paymentMethod === 'other'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm shadow-amber-500/10'
                    : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Smartphone className={`w-6 h-6 ${paymentMethod === 'other' ? 'text-amber-600' : 'text-slate-400'}`} />
                <span className="text-xs font-black">📱 Mobile</span>
              </button>
            </div>

            {/* CASH CALCULATOR (If Cash selected) */}
            {paymentMethod === 'cash' && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Cash Tendered by Customer:</label>
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput(cartGrandTotal.toFixed(2))}
                    className="text-[10px] text-indigo-600 font-extrabold hover:underline cursor-pointer"
                  >
                    Exact Amount (R {cartGrandTotal.toFixed(2)})
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">R</span>
                  <input
                    type="number"
                    step="0.50"
                    placeholder="0.00"
                    value={cashTenderedInput}
                    onChange={(e) => setCashTenderedInput(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl outline-none focus:border-indigo-600 font-mono text-base font-black text-slate-900"
                  />
                </div>

                {/* Quick cash denomination buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {[20, 50, 100, 200, 500].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setCashTenderedInput(amt.toFixed(2))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer"
                    >
                      +R{amt}
                    </button>
                  ))}
                </div>

                {/* Change Calculation Box */}
                <div className={`p-3 rounded-xl border flex justify-between items-center ${
                  cashChange < 0 
                    ? 'bg-red-50 border-red-200 text-red-800' 
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider block">
                      {cashChange < 0 ? 'Insufficient Cash' : 'Change Due to Customer'}
                    </span>
                    <span className="text-xs font-medium">
                      {cashChange < 0 
                        ? `Short by R ${Math.abs(cashChange).toFixed(2)}` 
                        : `Hand back change`}
                    </span>
                  </div>
                  <span className="text-lg font-black font-mono">
                    R {Math.max(0, cashChange).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPosStatus('selling')}
                className="w-1/3 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPosStatus('confirm')}
                disabled={paymentMethod === 'cash' && cashChange < 0}
                className="w-2/3 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs rounded-xl transition shadow-sm cursor-pointer"
              >
                Continue to Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM SALE */}
      {posStatus === 'confirm' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5 relative">
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 text-xs font-extrabold px-3 py-1 rounded-full mb-1">
                <span>Step 2 of 2: Confirmation</span>
              </div>
              <h2 className="text-xl font-black text-slate-950">⚠️ Confirm Sale</h2>
              <p className="text-xs text-slate-500 mt-0.5">Please verify transaction details before completing.</p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Items:</span>
                <strong className="text-slate-900">{totalItemCount} items</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-bold uppercase text-slate-900">
                  {paymentMethod === 'cash' ? '💵 Cash' : paymentMethod === 'card' ? '💳 Card' : '📱 Mobile/Other'}
                </span>
              </div>
              {paymentMethod === 'cash' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cash Tendered:</span>
                    <strong className="text-slate-900 font-mono">R {parsedCashTendered.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Change Due:</span>
                    <strong className="font-mono text-sm">R {Math.max(0, cashChange).toFixed(2)}</strong>
                  </div>
                </>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between text-sm">
                <span className="font-black text-slate-950">Grand Total:</span>
                <strong className="font-black text-indigo-600">R {cartGrandTotal.toFixed(2)}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPosStatus('checkout')}
                className="w-1/3 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinalizeSale}
                disabled={isProcessingSale}
                className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isProcessingSale ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Sale...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Complete Sale</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ITEMIZED RETAIL RECEIPT */}
      {posStatus === 'receipt' && lastReceipt && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-5 relative max-h-[90vh] overflow-y-auto">
            
            {/* Printable Receipt Area */}
            <div id="printable-receipt" className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 font-mono text-slate-800 text-xs shadow-inner">
              
              <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
                <h3 className="font-black text-base text-slate-950 uppercase tracking-tight">{shopName}</h3>
                <p className="text-[10px] text-slate-500">Official Retail Receipt</p>
                <p className="text-[10px] font-bold text-slate-700">{lastReceipt.receiptNo}</p>
                <p className="text-[9px] text-slate-400">{lastReceipt.date} • {lastReceipt.time}</p>
              </div>

              {/* Items List */}
              <div className="space-y-2 border-b border-dashed border-slate-300 pb-3">
                {lastReceipt.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-start text-[11px]">
                    <div className="flex-1 pr-2">
                      <span className="font-bold text-slate-900">{item.qty}x {item.name}</span>
                      <span className="block text-[9px] text-slate-400">@ R {item.price.toFixed(2)}</span>
                    </div>
                    <span className="font-bold text-slate-900 font-mono">
                      R {(item.price * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3 text-[11px]">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal (Excl. VAT)</span>
                  <span>R {lastReceipt.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>VAT (15%)</span>
                  <span>R {lastReceipt.vat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-950 font-black text-sm pt-1">
                  <span>TOTAL DUE</span>
                  <span>R {lastReceipt.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-1 text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <span className="font-bold uppercase">
                    {lastReceipt.paymentMethod === 'cash' ? 'Cash' : lastReceipt.paymentMethod === 'card' ? 'Card' : 'Mobile'}
                  </span>
                </div>
                {lastReceipt.paymentMethod === 'cash' && (
                  <>
                    <div className="flex justify-between">
                      <span>Cash Tendered:</span>
                      <span>R {(lastReceipt.cashTendered || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Change Given:</span>
                      <span>R {(lastReceipt.change || 0).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-center pt-2 text-[9px] text-slate-400 font-sans">
                <p className="font-bold text-slate-600">Thank you for your business!</p>
                <p>Powered by Blizflow POS</p>
              </div>

            </div>

            {/* Receipt Modal Actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleShareWhatsAppReceipt}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>Share Receipt on WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleResetNewSale}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition shadow-md shadow-indigo-600/15 cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Start New Sale</span>
              </button>

              <button
                type="button"
                onClick={handlePrintReceipt}
                className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span>Print Receipt</span>
              </button>
            </div>

          </div>
        </div>
      )}


    </div>
  );
}