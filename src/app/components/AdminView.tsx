import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, OrderStatus, Product } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { ordersService, productsService, settingsService } from '../../services/firestore';
import { ProductEditModal } from './ProductEditModal';
import {
  Package,
  Clock,
  CheckCircle,
  LayoutDashboard,
  Utensils,
  Phone,
  MapPin,
  Loader2,
  RefreshCw,
  LogOut,
  Pencil,
  Power,
  Settings2,
  AlertTriangle,
  Save,
  ToggleLeft,
  ToggleRight,
  Hash,
  Plus,
  Trash2,
  X,
  User,
  UtensilsCrossed,
  BarChart3,
  TrendingUp,
  Flame,
  ShoppingBag,
  Layers,
  Droplets,
  ChevronDown,
  ChevronUp,
  Truck,
  Store,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { resolveAllOptionNames } from '../utils/optionNames';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';
import { isProductAvailableInBranch, isBranchOpen } from '../utils/branchAvailability';

export const AdminView: React.FC = () => {
  const {
    orders, products, categories, globalSettings, businessRules,
    allOptionGroups,
    updateOrderStatus, fetchOrders, fetchProducts, fetchCategories,
    fetchGlobalSettings, fetchBusinessRules, fetchAllOptionGroups,
    updateProduct, updateGlobalSettings, updateBusinessRule,
    toggleOptionActive, createOption, updateOption, deleteOption,
    toggleProductBranchAvailability, updateBranchStatus
  } = useStore();
  const { signOut, adminRole, adminBranchScope, adminTitle } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'controls' | 'analytics'>('orders');
  const [optionNames, setOptionNames] = useState<Map<string, string>>(new Map());
  const optionNamesRef = useRef<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Orders section filter & collapsible state
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<'all' | 'فرع الاستاد' | 'فرع الكرفان'>('all');
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Set<string>>(new Set());

  // Branch-Scoped Orders based on logged-in admin
  const branchScopedOrders = useMemo(() => {
    if (adminBranchScope === 'all') return orders;
    return orders.filter(o => o.branch === adminBranchScope);
  }, [orders, adminBranchScope]);

  const toggleOrderCollapse = (orderId: string) => {
    setCollapsedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const collapseAllCompleted = () => {
    const completedIds = branchScopedOrders.filter(o => o.status === 'completed').map(o => o.id);
    setCollapsedOrderIds(prev => new Set([...prev, ...completedIds]));
  };

  const expandAllOrders = () => {
    setCollapsedOrderIds(new Set());
  };

  const orderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: branchScopedOrders.length,
      new: 0,
      preparing: 0,
      ready: 0,
      out_for_delivery: 0,
      completed: 0,
      cancelled: 0,
    };
    branchScopedOrders.forEach(o => {
      if (counts[o.status] !== undefined) {
        counts[o.status]++;
      }
    });
    return counts;
  }, [branchScopedOrders]);

  const branchCounts = useMemo(() => {
    return {
      all: orders.length,
      stadium: orders.filter(o => o.branch === 'فرع الاستاد').length,
      caravan: orders.filter(o => o.branch === 'فرع الكرفان').length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return branchScopedOrders.filter(o => {
      const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
      const matchesBranch = adminBranchScope !== 'all'
        ? true
        : (selectedBranchFilter === 'all' || o.branch === selectedBranchFilter);
      return matchesStatus && matchesBranch;
    });
  }, [branchScopedOrders, orderStatusFilter, selectedBranchFilter, adminBranchScope]);

  // Local state for controls form
  const [localClosedMessage, setLocalClosedMessage] = useState('');
  const [localStadiumClosedMessage, setLocalStadiumClosedMessage] = useState('');
  const [localCaravanClosedMessage, setLocalCaravanClosedMessage] = useState('');
  const [localMinQty, setLocalMinQty] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Sauce management panel state
  const [showSaucePanel, setShowSaucePanel] = useState(false);
  const [isLoadingOptionGroups, setIsLoadingOptionGroups] = useState(false);
  const [newSauceInputs, setNewSauceInputs] = useState<Record<string, { name: string; price: number }>>({});
  const [editingSauceId, setEditingSauceId] = useState<string | null>(null);
  const [editSauceName, setEditSauceName] = useState('');
  const [editSaucePrice, setEditSaucePrice] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchOrders(), fetchProducts(), fetchCategories(),
        fetchGlobalSettings(), fetchBusinessRules()
      ]);
      setIsLoading(false);
    };
    loadData();

    // Subscribe to real-time updates (orders, products, settings)
    const unsubscribeOrders = ordersService.subscribeToAllOrders((liveOrders) => {
      useStore.setState({ orders: liveOrders });
    });
    const unsubscribeProducts = productsService.subscribeToProducts((liveProducts) => {
      useStore.getState().setProducts(liveProducts);
    });
    const unsubscribeSettings = settingsService.subscribeToGlobalSettings((liveSettings) => {
      useStore.getState().setGlobalSettings(liveSettings);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeProducts();
      unsubscribeSettings();
    };
  }, []);

  // Sync local state when global data loads
  useEffect(() => {
    if (globalSettings) {
      setLocalClosedMessage(globalSettings.closed_message || '');
      setLocalStadiumClosedMessage(
        globalSettings.branches?.['فرع الاستاد']?.closed_message ||
        'فرع الاستاد مغلق حالياً، نسعد باستقبال طلباتكم في أوقات العمل القادمة.'
      );
      setLocalCaravanClosedMessage(
        globalSettings.branches?.['فرع الكرفان']?.closed_message ||
        'فرع الكرفان مغلق حالياً، نسعد باستقبال طلباتكم في أوقات العمل القادمة.'
      );
    }
  }, [globalSettings]);

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const rule of businessRules) {
      map[rule.category_id] = rule.min_quantity;
    }
    setLocalMinQty(map);
  }, [businessRules]);

  // Analytics computations (Strictly scoped to branch when in branch admin)
  const validOrders = useMemo(() => {
    return branchScopedOrders.filter(order => order.status !== 'cancelled');
  }, [branchScopedOrders]);

  const todayStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    let revenue = 0;
    let count = 0;

    for (const order of validOrders) {
      const orderDate = new Date(order.created_at).getTime();
      if (!isNaN(orderDate) && orderDate >= startOfToday) {
        revenue += (order.total || 0);
        count += 1;
      }
    }

    return { revenue, count };
  }, [validOrders]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let revenue = 0;
    let count = 0;

    for (const order of validOrders) {
      const orderDate = new Date(order.created_at).getTime();
      if (!isNaN(orderDate) && orderDate >= startOfMonth) {
        revenue += (order.total || 0);
        count += 1;
      }
    }

    return { revenue, count };
  }, [validOrders]);

  const branchAnalytics = useMemo(() => {
    let stadiumRev = 0;
    let stadiumCount = 0;
    let caravanRev = 0;
    let caravanCount = 0;

    for (const order of validOrders) {
      if (order.branch === 'فرع الاستاد') {
        stadiumRev += (order.total || 0);
        stadiumCount += 1;
      } else if (order.branch === 'فرع الكرفان') {
        caravanRev += (order.total || 0);
        caravanCount += 1;
      }
    }

    return { stadiumRev, stadiumCount, caravanRev, caravanCount };
  }, [validOrders]);

  const productSales = useMemo(() => {
    const statsMap = new Map<string, {
      id: string;
      name_ar: string;
      name_en?: string;
      image_url?: string;
      price: number;
      unitsSold: number;
      revenue: number;
    }>();

    // Initialize with all products in menu
    products.forEach(p => {
      statsMap.set(p.id, {
        id: p.id,
        name_ar: p.name_ar,
        name_en: p.name_en,
        image_url: p.image_url,
        price: p.price,
        unitsSold: 0,
        revenue: 0,
      });
    });

    // Aggregate from non-cancelled orders
    validOrders.forEach(order => {
      order.items?.forEach(item => {
        const qty = item.quantity || 1;
        const itemRev = (item.unit_price || 0) * qty;

        let stat = item.product_id ? statsMap.get(item.product_id) : undefined;
        if (!stat) {
          stat = Array.from(statsMap.values()).find(p => p.name_ar === item.name_ar);
        }

        if (stat) {
          stat.unitsSold += qty;
          stat.revenue += itemRev;
        } else {
          const fallbackKey = item.product_id || item.name_ar;
          statsMap.set(fallbackKey, {
            id: fallbackKey,
            name_ar: item.name_ar,
            unitsSold: qty,
            revenue: itemRev,
            price: item.unit_price || 0,
          });
        }
      });
    });

    const allStats = Array.from(statsMap.values());
    allStats.sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue);
    return allStats;
  }, [products, validOrders]);

  const hasSales = validOrders.length > 0 && productSales.some(p => p.unitsSold > 0);
  const bestSeller = hasSales ? productSales[0] : null;
  const leastSeller = hasSales ? productSales[productSales.length - 1] : null;

  // Sauce analytics — deduplicated by normalized Arabic name across all products
  const sauceSales = useMemo(() => {
    type SauceStat = {
      name_ar: string;
      priceDelta: number;
      orderCount: number;
      revenue: number;
    };

    /**
     * Normalize a sauce name:
     * - Trim whitespace
     * - Handle generic fries upgrade combos vs specific sauces
     * - Strip leading combo prefixes like "إضافة بطاطس + " or "إكسترا بطاطس + " so that
     *   "إضافة بطاطس + صوص تكساس" merges with "صوص تكساس"
     * - Strip generic "إضافة " prefix
     */
    const normalize = (raw: string): string => {
      if (!raw) return '';
      let name = raw.trim();

      // If generic combo fries option (e.g. "إكسترا بطاطس + صوص" or "إضافة بطاطس + صوص")
      // preserve as clean upgrade label instead of reducing to just "صوص"
      if (/^(?:إ?ضافة|إ?كسترا)?\s*بطاطس\s*\+\s*صوص$/u.test(name)) {
        return 'إكسترا بطاطس + صوص';
      }

      // Strip combo prefixes like:
      // "إضافة بطاطس + صوص تكساس" -> "صوص تكساس"
      // "إكسترا بطاطس + صوص تكساس" -> "صوص تكساس"
      // "بطاطس + صوص حار" -> "صوص حار"
      name = name.replace(/^(?:إ?ضافة|إ?كسترا)?\s*بطاطس\s*\+\s*/u, '');

      // Strip generic "إضافة " or "اضافة " prefix (e.g. "إضافة صوص تكساس" -> "صوص تكساس")
      name = name.replace(/^إ?ضافة\s+/u, '');

      return name.trim();
    };

    // Build catalog map keyed by NORMALIZED NAME (not option id)
    // This merges e.g. opt-hot-prod-akm + opt-hot-prod-ump → "صوص حار"
    const catalogMap = new Map<string, SauceStat>();

    // Also build id→normalizedName lookup for order aggregation
    const idToName = new Map<string, string>();

    allOptionGroups.forEach(group => {
      group.options?.forEach(opt => {
        const key = normalize(opt.name_ar);
        idToName.set(opt.id, key);
        if (!catalogMap.has(key)) {
          catalogMap.set(key, {
            name_ar: key,
            priceDelta: opt.price_delta ?? 0,
            orderCount: 0,
            revenue: 0,
          });
        }
        // If this duplicate has a non-zero price and the existing entry is 0, update price
        const existing = catalogMap.get(key)!;
        if (existing.priceDelta === 0 && (opt.price_delta ?? 0) > 0) {
          existing.priceDelta = opt.price_delta ?? 0;
        }
      });
    });

    // Aggregate order counts from valid (non-cancelled) orders
    // Each selected option on an order item counts once per item quantity
    validOrders.forEach(order => {
      order.items?.forEach(item => {
        const qty = item.quantity || 1;
        (item.selected_option_ids || []).forEach(optId => {
          // Resolve the normalized name for this option ID
          let key = idToName.get(optId);
          if (!key) {
            // Fall back to cached optionNames then normalize
            const raw = optionNames.get(optId) || optionNamesRef.current.get(optId);
            key = raw ? normalize(raw) : normalize(optId);
          }

          let stat = catalogMap.get(key);
          if (!stat) {
            // Sauce appears in orders but not in catalog (e.g. deleted option)
            stat = { name_ar: key, priceDelta: 0, orderCount: 0, revenue: 0 };
            catalogMap.set(key, stat);
          }
          stat.orderCount += qty;
          stat.revenue += stat.priceDelta * qty;
        });
      });
    });

    const stats = Array.from(catalogMap.values());
    stats.sort((a, b) => b.orderCount - a.orderCount || b.revenue - a.revenue);
    return stats;
  }, [allOptionGroups, validOrders, optionNames]);

  const topSauce = sauceSales.length > 0 && sauceSales[0].orderCount > 0 ? sauceSales[0] : null;

  // Keep ref in sync with state so effect can read without depending on optionNames
  useEffect(() => {
    optionNamesRef.current = optionNames;
  }, [optionNames]);

  // Resolve sauce names for all orders (only fetch IDs not already cached)
  useEffect(() => {
    const fetchSauceNames = async () => {
      const allIds = Array.from(new Set(
        orders.flatMap(order =>
          (order.items || []).flatMap(item => item.selected_option_ids || [])
        )
      ));
      if (allIds.length === 0) return;
      const missingIds = allIds.filter(id => !optionNamesRef.current.has(id));
      if (missingIds.length === 0) return;
      const newMap = await resolveAllOptionNames([missingIds]);
      setOptionNames(prev => new Map([...prev, ...newMap]));
    };
    if (orders.length > 0) {
      fetchSauceNames();
    }
  }, [orders]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchOrders(), fetchProducts(), fetchCategories(),
      fetchGlobalSettings(), fetchBusinessRules()
    ]);
    setIsRefreshing(false);
  };

  // Load option groups when switching to analytics tab (needed for sauce catalog)
  useEffect(() => {
    if (activeTab === 'analytics' && allOptionGroups.length === 0) {
      fetchAllOptionGroups();
    }
  }, [activeTab]);

  const openSaucePanel = async () => {
    setShowSaucePanel(true);
    setIsLoadingOptionGroups(true);
    try {
      await fetchAllOptionGroups();
    } catch (error) {
      console.error('Failed to fetch all option groups:', error);
    } finally {
      setIsLoadingOptionGroups(false);
    }
  };

  const handleToggleWebsite = async () => {
    if (!globalSettings) return;
    await updateGlobalSettings({ is_website_open: !globalSettings.is_website_open });
    toast.success(globalSettings.is_website_open ? 'تم إغلاق الموقع' : 'تم فتح الموقع');
  };

  const handleToggleBranch = async (branchName: 'فرع الاستاد' | 'فرع الكرفان') => {
    if (!globalSettings) return;
    const branchData = globalSettings.branches?.[branchName] || { is_open: true, closed_message: '' };
    const nextIsOpen = !branchData.is_open;
    await updateBranchStatus(branchName, { is_open: nextIsOpen });
    toast.success(nextIsOpen ? `تم فتح ${branchName}` : `تم إغلاق ${branchName}`);
  };

  const handleSaveControls = async () => {
    setIsSaving(true);
    try {
      if (adminBranchScope === 'فرع الاستاد') {
        await updateBranchStatus('فرع الاستاد', { closed_message: localStadiumClosedMessage });
        toast.success('تم حفظ إعدادات فرع الاستاد بنجاح');
      } else if (adminBranchScope === 'فرع الكرفان') {
        await updateBranchStatus('فرع الكرفان', { closed_message: localCaravanClosedMessage });
        toast.success('تم حفظ إعدادات فرع الكرفان بنجاح');
      } else {
        // Super Admin saves global + both branches + min quantity rules
        if (globalSettings && localClosedMessage !== globalSettings.closed_message) {
          await updateGlobalSettings({ closed_message: localClosedMessage });
        }
        await updateBranchStatus('فرع الاستاد', { closed_message: localStadiumClosedMessage });
        await updateBranchStatus('فرع الكرفان', { closed_message: localCaravanClosedMessage });

        for (const [catId, qty] of Object.entries(localMinQty)) {
          const existing = businessRules.find(r => r.category_id === catId);
          if (!existing || existing.min_quantity !== qty) {
            await updateBusinessRule(catId, qty);
          }
        }
        toast.success('تم حفظ جميع الإعدادات بنجاح');
      }
    } catch {
      toast.error('حدث خطأ أثناء الحفظ');
    }
    setIsSaving(false);
  };

  const statusColors: Record<OrderStatus, string> = {
    new: 'bg-blue-100 text-blue-700',
    preparing: 'bg-orange-100 text-orange-700',
    ready: 'bg-indigo-100 text-indigo-700',
    out_for_delivery: 'bg-teal-100 text-teal-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const statusLabels: Record<OrderStatus, string> = {
    new: 'جديد',
    preparing: 'قيد التحضير',
    ready: 'جاهز للاستلام',
    out_for_delivery: 'في التوصيل',
    completed: 'تم التسليم',
    cancelled: 'ملغي',
  };

  const isWebsiteOpen = globalSettings?.is_website_open ?? true;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Toaster position="top-center" expand={true} richColors />
      {/* Admin TopNav */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-4 lg:gap-6 overflow-x-auto">
            <div className="flex items-center gap-2.5 shrink-0">
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-primary" />
                لوحة الإدارة
              </h1>
              <span className={clsx(
                "px-2.5 py-1 rounded-full text-xs font-bold border transition-all whitespace-nowrap",
                adminBranchScope === 'فرع الاستاد'
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : adminBranchScope === 'فرع الكرفان'
                  ? "bg-teal-50 text-teal-800 border-teal-200"
                  : "bg-red-50 text-primary border-red-200"
              )}>
                {adminTitle || (adminBranchScope === 'all' ? 'الإدارة العامة' : adminBranchScope)}
              </span>
            </div>
            <nav className="flex gap-2 lg:gap-4">
              <button
                onClick={() => setActiveTab('orders')}
                className={clsx(
                  "px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap",
                  activeTab === 'orders' ? "bg-red-50 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                الطلبات ({branchScopedOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('menu')}
                className={clsx(
                  "px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap",
                  activeTab === 'menu' ? "bg-red-50 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                المنيو والتوفر
              </button>
              <button
                onClick={() => setActiveTab('controls')}
                className={clsx(
                  "px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2",
                  activeTab === 'controls' ? "bg-red-50 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <Settings2 className="w-4 h-4" />
                التحكم التشغيلي
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={clsx(
                  "px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap flex items-center gap-2",
                  activeTab === 'analytics' ? "bg-red-50 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                <BarChart3 className="w-4 h-4" />
                الإحصائيات والمبيعات
              </button>
            </nav>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all shrink-0"
              title="تحديث البيانات"
              aria-label="تحديث البيانات"
            >
              <RefreshCw className={clsx('w-5 h-5 text-slate-500', isRefreshing && 'animate-spin')} />
            </button>
          </div>
          <button
            onClick={async () => { await signOut(); navigate('/admin/login', { replace: true }); }}
            className="flex items-center gap-2 text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg transition-all font-bold text-sm shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">تسجيل الخروج</span>
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-slate-500 font-medium">جاري تحميل البيانات...</p>
          </div>
        ) : activeTab === 'orders' ? (
          /* ── ORDERS TAB ─────────────────────────────────── */
          <div className="space-y-4">
            {/* Header: Title + Sauce Management Button */}
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <span>الطلبات الواردة</span>
                  <span className="text-xs bg-red-50 text-primary border border-red-100 font-bold px-2.5 py-0.5 rounded-full">
                    {branchScopedOrders.length} {branchScopedOrders.length === 1 ? 'طلب' : 'طلبات'}
                  </span>
                </h2>
                <p className="text-slate-500 text-xs mt-0.5">
                  {adminBranchScope !== 'all' ? `متابعة وإدارة طلبات ${adminBranchScope} الحية لحظياً` : 'متابعة وإدارة حالات الطلبات الحية لحظياً لكافة الفروع'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={openSaucePanel}
                  className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3.5 py-2 rounded-xl font-bold text-xs hover:bg-amber-100 transition-all border border-amber-200"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  <span>إدارة الصصوصات</span>
                </button>
              </div>
            </div>

            {/* Quick Status & Branch Filter Bar */}
            <div className="flex flex-col gap-2.5 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-100 shadow-sm">
              {/* Branch Filter Row + Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>نطاق الفرع:</span>
                  </span>
                  {adminBranchScope === 'all' ? (
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                      <button
                        onClick={() => setSelectedBranchFilter('all')}
                        className={clsx(
                          "px-3 py-1 rounded-lg transition-all text-xs flex items-center gap-1.5 cursor-pointer",
                          selectedBranchFilter === 'all'
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        <span>كل الفروع</span>
                        <span className="text-[10px] bg-slate-200/70 text-slate-600 px-1.5 py-0.2 rounded-full font-black">
                          {branchCounts.all}
                        </span>
                      </button>
                      <button
                        onClick={() => setSelectedBranchFilter('فرع الاستاد')}
                        className={clsx(
                          "px-3 py-1 rounded-lg transition-all text-xs flex items-center gap-1.5 cursor-pointer",
                          selectedBranchFilter === 'فرع الاستاد'
                            ? "bg-white text-emerald-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        <Store className="w-3.5 h-3.5 text-emerald-600" />
                        <span>فرع الاستاد</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-black">
                          {branchCounts.stadium}
                        </span>
                      </button>
                      <button
                        onClick={() => setSelectedBranchFilter('فرع الكرفان')}
                        className={clsx(
                          "px-3 py-1 rounded-lg transition-all text-xs flex items-center gap-1.5 cursor-pointer",
                          selectedBranchFilter === 'فرع الكرفان'
                            ? "bg-white text-amber-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        <Truck className="w-3.5 h-3.5 text-amber-600" />
                        <span>فرع الكرفان</span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full font-black">
                          {branchCounts.caravan}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800">
                      {adminBranchScope === 'فرع الاستاد' ? (
                        <Store className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Truck className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      <span>{adminBranchScope}</span>
                      <span className="text-[10px] bg-white text-slate-700 px-2 py-0.5 rounded-full font-black shadow-2xs">
                        {branchScopedOrders.length} طلب
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick Actions (Collapse/Expand Completed) */}
                {orderCounts.completed > 0 && (
                  <button
                    onClick={collapsedOrderIds.size > 0 ? expandAllOrders : collapseAllCompleted}
                    className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-all font-semibold text-xs cursor-pointer"
                    title={collapsedOrderIds.size > 0 ? 'توسيع جميع الطلبات المطوية' : 'طي الطلبات المكتملة لتوفير المساحة'}
                  >
                    {collapsedOrderIds.size > 0 ? (
                      <>
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>توسيع الكل ({collapsedOrderIds.size})</span>
                      </>
                    ) : (
                      <>
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>طي الطلبات المكتملة</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 w-full scrollbar-none">
                {[
                  { key: 'all' as const, label: 'الكل' },
                  { key: 'new' as const, label: 'جديد' },
                  { key: 'preparing' as const, label: 'قيد التحضير' },
                  { key: 'ready' as const, label: 'جاهز للاستلام' },
                  { key: 'out_for_delivery' as const, label: 'في التوصيل' },
                  { key: 'completed' as const, label: 'تم التسليم' },
                  { key: 'cancelled' as const, label: 'ملغي' },
                ].map((tab) => {
                  const count = orderCounts[tab.key] || 0;
                  const isActive = orderStatusFilter === tab.key;
                  // Don't show out_for_delivery or cancelled if 0, unless selected
                  if ((tab.key === 'out_for_delivery' || tab.key === 'cancelled') && count === 0 && !isActive) {
                    return null;
                  }
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setOrderStatusFilter(tab.key)}
                      className={clsx(
                        "px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer",
                        isActive
                          ? "bg-red-50 text-primary border border-red-200 shadow-xs"
                          : "text-slate-600 hover:bg-slate-50 border border-transparent"
                      )}
                    >
                      <span>{tab.label}</span>
                      <span className={clsx(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-black",
                        isActive
                          ? "bg-primary text-white"
                          : "bg-slate-100 text-slate-500"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orders Responsive Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredOrders.length === 0 ? (
                <div className="col-span-full bg-white rounded-2xl p-16 text-center border-2 border-dashed border-slate-200">
                  <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 font-bold text-sm">لا توجد طلبات في هذا القسم</p>
                  <p className="text-slate-400 text-xs mt-1">جرّب اختيار فلتر آخر أو انتظار طلبات جديدة</p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const isCollapsed = collapsedOrderIds.has(order.id);
                  const totalItemsCount = (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

                  // ── Collapsed Order Card ──
                  if (isCollapsed) {
                    return (
                      <motion.div
                        layout
                        key={order.id}
                        className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 hover:border-slate-200 transition-all flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={() => toggleOrderCollapse(order.id)}
                              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all shrink-0"
                              title="توسيع تفاصيل الطلب"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-black text-slate-900 shrink-0">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0", statusColors[order.status])}>
                              {statusLabels[order.status]}
                            </span>
                            {order.branch && (
                              <span className={clsx(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 flex items-center gap-1",
                                order.branch === 'فرع الكرفان'
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              )}>
                                <span>{order.branch}</span>
                              </span>
                            )}
                            <span className="text-xs text-slate-700 font-bold truncate">
                              {order.customer_name}
                            </span>
                          </div>
                          <span className="text-xs font-black text-slate-900 shrink-0">
                            {order.total} ج.م
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100/70">
                          <span className="flex items-center gap-1 text-[11px]">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-slate-500 font-medium">
                            {totalItemsCount} {totalItemsCount === 1 ? 'صنف' : 'أصناف'}
                          </span>
                          <button
                            onClick={() => toggleOrderCollapse(order.id)}
                            className="text-primary hover:underline text-[11px] font-bold cursor-pointer"
                          >
                            عرض التفاصيل
                          </button>
                        </div>
                      </motion.div>
                    );
                  }

                  // ── Compact Expanded Order Card ──
                  return (
                    <motion.div
                      layout
                      key={order.id}
                      className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all flex flex-col justify-between h-full group"
                    >
                      {/* Top: Header + Customer Info + Ordered Items */}
                      <div className="space-y-3">
                        {/* 1. Compact Header */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-black text-slate-900 tracking-tight shrink-0">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </span>
                            <span className={clsx("px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap", statusColors[order.status])}>
                              {statusLabels[order.status]}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(order.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                              كاش
                            </span>
                            <button
                              onClick={() => toggleOrderCollapse(order.id)}
                              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
                              title="طي تفاصيل الطلب"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* 2. Compact Customer Info Strip */}
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100/80 text-xs space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-900 truncate">{order.customer_name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={`tel:${order.customer_phone}`}
                                className="text-slate-600 hover:text-primary flex items-center gap-1 text-[11px] font-medium"
                                dir="ltr"
                              >
                                <Phone className="w-3 h-3 text-slate-400" />
                                {order.customer_phone}
                              </a>
                              {order.branch && (
                                <span className={clsx(
                                  "px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1",
                                  order.branch === 'فرع الكرفان'
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                )}>
                                  <MapPin className="w-3 h-3" />
                                  <span>{order.branch}</span>
                                </span>
                              )}
                              <span className={clsx(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1",
                                order.type === 'delivery'
                                  ? "bg-blue-50 text-blue-700 border border-blue-100"
                                  : "bg-red-50 text-primary border border-red-100"
                              )}>
                                {order.type === 'delivery' ? (
                                  <>
                                    <Truck className="w-3 h-3" />
                                    <span>توصيل</span>
                                  </>
                                ) : (
                                  <>
                                    <ShoppingBag className="w-3 h-3" />
                                    <span>استلام</span>
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                          {order.address && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-200/50">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{order.address}</span>
                            </div>
                          )}
                        </div>

                        {/* 3. Compact Ordered Items List */}
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1">
                            <span>الأصناف المطلوبة</span>
                            <span>{totalItemsCount} قطع</span>
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5 scrollbar-thin">
                            {(order.items || []).map((item) => (
                              <div key={item.id} className="flex justify-between items-start text-xs py-1 border-b border-slate-50 last:border-0 gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                                      {item.quantity}×
                                    </span>
                                    <span className="font-semibold text-slate-900 text-xs truncate">{item.name_ar}</span>
                                  </div>
                                  <div className="mr-7 space-y-0.5 mt-0.5">
                                    {item.selected_option_ids && item.selected_option_ids.length > 0 && (
                                      <p className="text-[10px] text-slate-500 leading-tight">
                                        إضافات: {item.selected_option_ids.map((id: string) => optionNames.get(id)).filter(Boolean).join('، ')}
                                      </p>
                                    )}
                                    {item.special_instructions && (
                                      <p className="text-[10px] text-slate-400 font-medium italic">
                                        — {item.special_instructions}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className="font-bold text-xs text-slate-900 shrink-0">{item.unit_price * item.quantity} ج.م</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* 4. Card Footer: Total Price + Status Action Buttons pinned at bottom */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 font-bold">الإجمالي</span>
                          <span className="text-base font-black text-slate-900 leading-none">
                            {order.total} <span className="text-xs font-bold text-slate-400">ج.م</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {order.status === 'new' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'preparing')}
                              className="bg-primary text-white px-3.5 py-1.5 rounded-xl font-bold text-xs hover:bg-red-700 transition-all shadow-sm shadow-red-100 whitespace-nowrap"
                            >
                              بدء التحضير
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, order.type === 'delivery' ? 'out_for_delivery' : 'ready')}
                              className="bg-orange-500 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs hover:bg-orange-600 transition-all shadow-sm shadow-orange-100 whitespace-nowrap"
                            >
                              {order.type === 'delivery' ? 'خروج للتوصيل' : 'جاهز للاستلام'}
                            </button>
                          )}
                          {order.status === 'ready' && order.type === 'delivery' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'out_for_delivery')}
                              className="bg-teal-600 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs hover:bg-teal-700 transition-all shadow-sm shadow-teal-100 whitespace-nowrap"
                            >
                              خروج للتوصيل
                            </button>
                          )}
                          {(order.status === 'ready' || order.status === 'out_for_delivery') && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'completed')}
                              className="bg-green-600 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs hover:bg-green-700 transition-all shadow-sm shadow-green-100 whitespace-nowrap"
                            >
                              تم التسليم
                            </button>
                          )}
                          {order.status === 'completed' && (
                            <span className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              مكتمل
                            </span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                              ملغي
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        ) : activeTab === 'menu' ? (
          /* ── MENU TAB ─────────────────────────────────── */
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900">إدارة قائمة الطعام</h2>
              <div className="flex gap-2">
                <span className="text-slate-500 text-sm bg-white px-3 py-1 rounded-full border shadow-sm">
                  {products.length} صنف
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => {
                const isBranchAvailable = adminBranchScope !== 'all'
                  ? isProductAvailableInBranch(product, adminBranchScope)
                  : product.is_available;
                const isStadiumAvailable = isProductAvailableInBranch(product, 'فرع الاستاد');
                const isCaravanAvailable = isProductAvailableInBranch(product, 'فرع الكرفان');

                return (
                  <div key={product.id} className="group relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:border-red-100 transition-all duration-300 flex flex-col h-full">
                    {/* Image Container */}
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                      <img
                        src={product.image_url}
                        alt={product.name_ar}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                      {adminBranchScope !== 'all' ? (
                        !isBranchAvailable && (
                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                            <span className="bg-slate-900 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-lg transform -rotate-3">
                              غير متاح في {adminBranchScope}
                            </span>
                          </div>
                        )
                      ) : (
                        !product.is_available ? (
                          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                            <span className="bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg transform -rotate-6">
                              غير متوفر عام
                            </span>
                          </div>
                        ) : (!isStadiumAvailable || !isCaravanAvailable) ? (
                          <div className="absolute top-2 right-2 z-10">
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] px-2 py-0.5 rounded-full shadow-xs">
                              {!isStadiumAvailable && !isCaravanAvailable ? 'معطل بالفروع' : !isStadiumAvailable ? 'معطل بالاستاد' : 'معطل بالكرفان'}
                            </span>
                          </div>
                        ) : null
                      )}
                      <div className="absolute top-2 left-2 z-20 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="bg-white text-slate-700 p-2 rounded-xl shadow-lg hover:bg-primary hover:text-white transition-colors"
                          title="تعديل"
                          aria-label="تعديل المنتج"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="p-5 flex flex-col flex-grow">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <h3 className="font-bold text-lg text-slate-900 line-clamp-1 group-hover:text-primary transition-colors">
                          {product.name_ar}
                        </h3>
                        <span className="shrink-0 font-bold text-lg text-primary bg-red-50 px-2.5 py-1 rounded-lg">
                          {product.price} ج.م
                        </span>
                      </div>
                      <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 mb-4 flex-grow">
                        {product.description_ar}
                      </p>

                      {adminBranchScope !== 'all' ? (
                        <button
                          onClick={async () => {
                            await toggleProductBranchAvailability(product.id, adminBranchScope);
                            toast.success(!isBranchAvailable ? `تم إتاحة الصنف في ${adminBranchScope}` : `تم إيقاف الصنف في ${adminBranchScope}`);
                          }}
                          className={clsx(
                            "w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] border cursor-pointer",
                            isBranchAvailable
                              ? 'bg-white text-green-600 border-green-200 hover:bg-green-50'
                              : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                          )}
                        >
                          <div className={clsx("w-2 h-2 rounded-full", isBranchAvailable ? 'bg-green-500 animate-pulse' : 'bg-slate-400')} />
                          <span>{isBranchAvailable ? `متاح في ${adminBranchScope}` : `غير متاح في ${adminBranchScope}`}</span>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={() => updateProduct(product.id, { is_available: !product.is_available })}
                            className={clsx(
                              "w-full py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] border cursor-pointer",
                              product.is_available
                                ? 'bg-white text-green-600 border-green-200 hover:bg-green-50'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            )}
                          >
                            <div className={clsx("w-2 h-2 rounded-full", product.is_available ? 'bg-green-500 animate-pulse' : 'bg-slate-400')} />
                            <span>{product.is_available ? 'متاح عام (كافة الفروع)' : 'غير متاح عام'}</span>
                          </button>

                          <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => toggleProductBranchAvailability(product.id, 'فرع الاستاد')}
                              className={clsx(
                                "px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer",
                                isStadiumAvailable
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                  : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                              )}
                            >
                              <div className={clsx("w-1.5 h-1.5 rounded-full", isStadiumAvailable ? "bg-emerald-500" : "bg-slate-400")} />
                              <span>الاستاد: {isStadiumAvailable ? 'متاح' : 'معطل'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleProductBranchAvailability(product.id, 'فرع الكرفان')}
                              className={clsx(
                                "px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer",
                                isCaravanAvailable
                                  ? "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100"
                                  : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                              )}
                            >
                              <div className={clsx("w-1.5 h-1.5 rounded-full", isCaravanAvailable ? "bg-teal-500" : "bg-slate-400")} />
                              <span>الكرفان: {isCaravanAvailable ? 'متاح' : 'معطل'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'controls' ? (
          /* ── OPERATIONAL CONTROLS TAB ─────────────────── */
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <Settings2 className="w-6 h-6 text-primary" />
                  {adminBranchScope !== 'all' ? `التحكم التشغيلي — ${adminBranchScope}` : 'التحكم التشغيلي العام والفروع'}
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  {adminBranchScope !== 'all'
                    ? `إدارة حالة فتح وإغلاق ${adminBranchScope} وتحديث رسالة الإغلاق المستقلة له دون التأثير على الفروع الأخرى`
                    : 'إدارة حالة الموقع العام، وتشغيل الفروع المستقل، وقواعد الحد الأدنى للطلب'}
                </p>
              </div>
            </div>

            {adminBranchScope !== 'all' ? (
              /* ── Branch Admin Operational Control ────────────── */
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  {adminBranchScope === 'فرع الاستاد' ? <Store className="w-5 h-5 text-amber-600" /> : <Truck className="w-5 h-5 text-teal-600" />}
                  <h3 className="text-xl font-bold text-slate-900">حالة {adminBranchScope}</h3>
                </div>

                {(() => {
                  const isCurrentBranchOpen = isBranchOpen(globalSettings, adminBranchScope);
                  return (
                    <>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="space-y-1">
                          <p className="font-bold text-slate-900">
                            {isCurrentBranchOpen ? `${adminBranchScope} مفتوح للطلبات` : `${adminBranchScope} مغلق حالياً`}
                          </p>
                          <p className="text-sm text-slate-500">
                            {isCurrentBranchOpen
                              ? 'العملاء يمكنهم طلب الوجبات من هذا الفرع واستلامها'
                              : 'لن يتمكن العملاء من إتمام الطلبات على هذا الفرع حتى يتم إعادة فتحه'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleBranch(adminBranchScope as 'فرع الاستاد' | 'فرع الكرفان')}
                          className={clsx(
                            "flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap",
                            isCurrentBranchOpen
                              ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                              : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                          )}
                        >
                          {isCurrentBranchOpen ? (
                            <><ToggleRight className="w-5 h-5" /> الفرع مفتوح</>
                          ) : (
                            <><ToggleLeft className="w-5 h-5" /> الفرع مغلق</>
                          )}
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          رسالة إغلاق {adminBranchScope} (تظهر للعميل في صفحة الدفع عند اختيار الفرع وهو مغلق)
                        </label>
                        <textarea
                          rows={2}
                          value={adminBranchScope === 'فرع الاستاد' ? localStadiumClosedMessage : localCaravanClosedMessage}
                          onChange={(e) => {
                            if (adminBranchScope === 'فرع الاستاد') {
                              setLocalStadiumClosedMessage(e.target.value);
                            } else {
                              setLocalCaravanClosedMessage(e.target.value);
                            }
                          }}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none text-sm"
                          placeholder={`مثال: ${adminBranchScope} مغلق حالياً، نسعد باستقبالكم غداً`}
                        />
                      </div>
                    </>
                  );
                })()}

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    onClick={handleSaveControls}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    حفظ إعدادات {adminBranchScope}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Super Admin Operational Control (All Branches + Global) ── */
              <>
                {/* ── Section 1: Global Website Status ───────── */}
                <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <Power className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-bold text-slate-900">حالة الموقع العامة (كافة الفروع)</h3>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="space-y-1">
                      <p className="font-bold text-slate-900">
                        {isWebsiteOpen ? 'الموقع مفتوح بالكامل للطلبات' : 'الموقع مغلق بالكامل حالياً'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {isWebsiteOpen ? 'العملاء يمكنهم تقديم طلبات جديدة في أي فرع مفتوح' : 'الموقع مغلق كلياً ولا يمكن تقديم أي طلبات'}
                      </p>
                    </div>
                    <button
                      onClick={handleToggleWebsite}
                      className={clsx(
                        "flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap",
                        isWebsiteOpen
                          ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                          : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                      )}
                    >
                      {isWebsiteOpen ? (
                        <><ToggleRight className="w-5 h-5" /> الموقع مفتوح</>
                      ) : (
                        <><ToggleLeft className="w-5 h-5" /> الموقع مغلق</>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      رسالة إغلاق الموقع العامة (تظهر عند إغلاق المطعم كلياً)
                    </label>
                    <textarea
                      rows={2}
                      value={localClosedMessage}
                      onChange={(e) => setLocalClosedMessage(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none text-sm"
                      placeholder="مثال: المطعم مغلق حالياً، نلتقي الساعة 11 صباحاً"
                    />
                  </div>
                </div>

                {/* ── Section 2: Independent Branch Status Controls ── */}
                <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <Store className="w-5 h-5 text-emerald-600" />
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">تشغيل الفروع المستقل</h3>
                      <p className="text-xs text-slate-500 mt-0.5">يمكن فتح أو إغلاق أي فرع بشكل مستقل مع تخصيص رسالة إغلاق لكل فرع</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* فرع الاستاد */}
                    {(() => {
                      const isStadiumOpen = isBranchOpen(globalSettings, 'فرع الاستاد');
                      return (
                        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 flex items-center gap-2">
                              <Store className="w-4 h-4 text-amber-600" />
                              <span>فرع الاستاد</span>
                            </span>
                            <button
                              onClick={() => handleToggleBranch('فرع الاستاد')}
                              className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-xs active:scale-95 cursor-pointer",
                                isStadiumOpen
                                  ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                                  : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                              )}
                            >
                              {isStadiumOpen ? (
                                <><ToggleRight className="w-4 h-4" /> مفتوح</>
                              ) : (
                                <><ToggleLeft className="w-4 h-4" /> مغلق</>
                              )}
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600">رسالة إغلاق فرع الاستاد:</label>
                            <textarea
                              rows={2}
                              value={localStadiumClosedMessage}
                              onChange={(e) => setLocalStadiumClosedMessage(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none text-xs"
                              placeholder="رسالة تظهر للعملاء عند إغلاق فرع الاستاد"
                            />
                          </div>
                        </div>
                      );
                    })()}

                    {/* فرع الكرفان */}
                    {(() => {
                      const isCaravanOpen = isBranchOpen(globalSettings, 'فرع الكرفان');
                      return (
                        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 flex items-center gap-2">
                              <Truck className="w-4 h-4 text-teal-600" />
                              <span>فرع الكرفان</span>
                            </span>
                            <button
                              onClick={() => handleToggleBranch('فرع الكرفان')}
                              className={clsx(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all shadow-xs active:scale-95 cursor-pointer",
                                isCaravanOpen
                                  ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                                  : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                              )}
                            >
                              {isCaravanOpen ? (
                                <><ToggleRight className="w-4 h-4" /> مفتوح</>
                              ) : (
                                <><ToggleLeft className="w-4 h-4" /> مغلق</>
                              )}
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-600">رسالة إغلاق فرع الكرفان:</label>
                            <textarea
                              rows={2}
                              value={localCaravanClosedMessage}
                              onChange={(e) => setLocalCaravanClosedMessage(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none text-xs"
                              placeholder="رسالة تظهر للعملاء عند إغلاق فرع الكرفان"
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* ── Section 3: Minimum Quantity Rules ────────── */}
                <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                    <Hash className="w-5 h-5 text-primary" />
                    <h3 className="text-xl font-bold text-slate-900">الحد الأدنى للطلب</h3>
                  </div>

                  <p className="text-sm text-slate-500">
                    حدد الحد الأدنى لعدد القطع من كل قسم لإتمام الطلب. القيمة 1 تعني لا قيود.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {categories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50"
                      >
                        <span className="font-bold text-slate-900 text-sm">{cat.name_ar}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">الحد الأدنى:</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={localMinQty[cat.id] ?? 1}
                            onChange={(e) => setLocalMinQty(prev => ({
                              ...prev,
                              [cat.id]: Math.max(1, parseInt(e.target.value) || 1),
                            }))}
                            className="w-16 text-center bg-white border border-slate-200 rounded-lg py-2 font-bold text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Save Button ──────────────────────────────── */}
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveControls}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    حفظ جميع الإعدادات
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── ANALYTICS & SALES TAB ─────────────────────── */
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-primary" />
                  إحصائيات المبيعات
                </h2>
                <p className="text-slate-500 text-sm mt-1">متابعة أداء المبيعات اليومية والشهرية والأصناف الأكثر والأقل طلباً</p>
              </div>
            </div>

            {/* ── 5 Summary Cards Grid ──────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 md:gap-5">
              {/* Card 1: مبيعات النهاردة */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500">مبيعات النهاردة</span>
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-primary">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-2xl font-black text-slate-900 flex items-baseline gap-1">
                    {todayStats.revenue.toLocaleString('ar-EG')}
                    <span className="text-sm font-bold text-slate-400">ج.م</span>
                  </div>
                  <div className="flex items-center">
                    <span className={clsx(
                      "text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5",
                      todayStats.count > 0
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-slate-100 text-slate-500"
                    )}>
                      <div className={clsx("w-1.5 h-1.5 rounded-full", todayStats.count > 0 ? "bg-green-500" : "bg-slate-400")} />
                      {todayStats.count} {todayStats.count === 1 ? 'طلب اليوم' : 'طلبات اليوم'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: مبيعات الشهر ده */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500">مبيعات الشهر ده</span>
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-primary">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-2xl font-black text-slate-900 flex items-baseline gap-1">
                    {monthStats.revenue.toLocaleString('ar-EG')}
                    <span className="text-sm font-bold text-slate-400">ج.م</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">
                      {monthStats.count} {monthStats.count === 1 ? 'طلب هذا الشهر' : 'طلبات هذا الشهر'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 3: الأكثر مبيعاً في المنيو */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500">الأكثر مبيعاً في المنيو</span>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <Flame className="w-5 h-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-base text-slate-900 line-clamp-1">
                      {bestSeller ? bestSeller.name_ar : 'لا توجد مبيعات بعد'}
                    </h4>
                    {bestSeller?.name_en && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{bestSeller.name_en}</p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span className={clsx(
                      "text-xs px-2.5 py-1 rounded-full font-bold",
                      bestSeller && bestSeller.unitsSold > 0
                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                        : "bg-slate-100 text-slate-500"
                    )}>
                      {bestSeller && bestSeller.unitsSold > 0 ? `تم بيع ${bestSeller.unitsSold} قطعة` : '0 مبيعات'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 4: الأقل مبيعاً في المنيو */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500">الأقل مبيعاً في المنيو</span>
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-base text-slate-900 line-clamp-1">
                      {leastSeller ? leastSeller.name_ar : 'لا توجد مبيعات بعد'}
                    </h4>
                    {leastSeller?.name_en && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{leastSeller.name_en}</p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">
                      {leastSeller ? `تم بيع ${leastSeller.unitsSold} قطعة` : '0 مبيعات'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 5: الأكثر طلباً في الصوصات */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-slate-500">الأكثر طلباً في الصوصات</span>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                    <Droplets className="w-5 h-5" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-base text-slate-900 line-clamp-1">
                      {topSauce ? topSauce.name_ar : 'لا توجد بيانات'}
                    </h4>
                    {topSauce && topSauce.priceDelta > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">{topSauce.priceDelta}+ ج.م</p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <span className={clsx(
                      "text-xs px-2.5 py-1 rounded-full font-bold",
                      topSauce
                        ? "bg-blue-100 text-blue-800 border border-blue-200"
                        : "bg-slate-100 text-slate-500"
                    )}>
                      {topSauce ? `تم طلبه ${topSauce.orderCount} مرة` : '0 مرة'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 6: مبيعات الفروع / الفرع */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-slate-500">
                    {adminBranchScope === 'all' ? 'مبيعات الفروع' : `مبيعات ${adminBranchScope}`}
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <Store className="w-5 h-5" />
                  </div>
                </div>
                {adminBranchScope === 'all' ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-emerald-600" />
                        <span>فرع الاستاد ({branchAnalytics.stadiumCount})</span>
                      </span>
                      <span className="font-black text-emerald-700">{branchAnalytics.stadiumRev.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-amber-600" />
                        <span>فرع الكرفان ({branchAnalytics.caravanCount})</span>
                      </span>
                      <span className="font-black text-amber-700">{branchAnalytics.caravanRev.toLocaleString('ar-EG')} ج.م</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                        {adminBranchScope === 'فرع الاستاد' ? <Store className="w-3.5 h-3.5 text-amber-600" /> : <Truck className="w-3.5 h-3.5 text-teal-600" />}
                        <span>طلبات الفرع المستلمة</span>
                      </span>
                      <span className="font-black text-slate-900">{validOrders.length} طلب</span>
                    </div>
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700">إجمالي المبيعات النشطة</span>
                      <span className="font-black text-emerald-700">
                        {(adminBranchScope === 'فرع الاستاد' ? branchAnalytics.stadiumRev : branchAnalytics.caravanRev).toLocaleString('ar-EG')} ج.م
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Ranking cards: Menu items + Sauces side by side on lg ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Menu Items Sales Ranking ─────────────── */}
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-bold text-slate-900">ترتيب أصناف المنيو حسب المبيعات</h3>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold">
                    {productSales.length} صنف
                  </span>
                </div>

                {productSales.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-medium">
                    لا توجد أصناف في قائمة الطعام
                  </div>
                ) : (
                  <div className="space-y-3">
                    {productSales.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-all gap-4"
                      >
                        {/* Right side: Rank + Image + Name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={clsx(
                            "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                            idx === 0
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : idx === 1
                              ? "bg-slate-200 text-slate-700"
                              : idx === 2
                              ? "bg-amber-50 text-amber-900 border border-amber-200"
                              : "bg-white text-slate-500 border border-slate-200"
                          )}>
                            #{idx + 1}
                          </span>

                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name_ar}
                              className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                              <Utensils className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm truncate">{item.name_ar}</p>
                            {item.name_en && (
                              <p className="text-xs text-slate-400 truncate">{item.name_en}</p>
                            )}
                          </div>
                        </div>

                        {/* Left side: Badges */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-full font-bold whitespace-nowrap">
                            {item.unitsSold > 0 ? `تم بيع ${item.unitsSold} قطعة` : 'لم يتم البيع'}
                          </span>
                          <span className="text-sm font-bold text-primary bg-red-50 px-2.5 py-1 rounded-lg whitespace-nowrap">
                            {item.revenue.toLocaleString('ar-EG')} ج.م
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Sauces Ranking ──────────────────────────── */}
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <Droplets className="w-5 h-5 text-blue-500" />
                    <h3 className="text-lg font-bold text-slate-900">ترتيب الصوصات حسب الطلب</h3>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold">
                    {sauceSales.length} صوص
                  </span>
                </div>

                {sauceSales.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-medium">
                    لا توجد بيانات صوصات
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sauceSales.map((sauce, idx) => (
                      <div
                        key={sauce.name_ar}
                        className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-all gap-4"
                      >
                        {/* Right side: Rank + Icon + Name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={clsx(
                            "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0",
                            idx === 0
                              ? "bg-amber-100 text-amber-800 border border-amber-300"
                              : idx === 1
                              ? "bg-slate-200 text-slate-700"
                              : idx === 2
                              ? "bg-amber-50 text-amber-900 border border-amber-200"
                              : "bg-white text-slate-500 border border-slate-200"
                          )}>
                            #{idx + 1}
                          </span>

                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-400 shrink-0">
                            <Droplets className="w-5 h-5" />
                          </div>

                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm truncate">{sauce.name_ar}</p>
                            {sauce.priceDelta > 0 && (
                              <p className="text-xs text-slate-400">+{sauce.priceDelta} ج.م</p>
                            )}
                          </div>
                        </div>

                        {/* Left side: Badges */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={clsx(
                            "text-xs px-2.5 py-1.5 rounded-full font-bold whitespace-nowrap",
                            sauce.orderCount > 0
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-500"
                          )}>
                            {sauce.orderCount > 0 ? `تم طلبه ${sauce.orderCount} مرة` : 'لم يتم الطلب'}
                          </span>
                          {sauce.revenue > 0 && (
                            <span className="text-sm font-bold text-primary bg-red-50 px-2.5 py-1 rounded-lg whitespace-nowrap">
                              {sauce.revenue.toLocaleString('ar-EG')} ج.م
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>

      {/* Product Edit Modal */}
      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {/* Sauce Management Slide-Over Panel */}
      <AnimatePresence>
        {showSaucePanel && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sauce-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSaucePanel(false)}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
            />

            {/* Panel */}
            <motion.div
              key="sauce-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[70] flex flex-col"
              dir="rtl"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-5 border-b bg-gradient-to-l from-amber-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">إدارة الصوصات</h3>
                    <p className="text-xs text-slate-500">تشغيل / إيقاف / إضافة / تعديل</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSaucePanel(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {isLoadingOptionGroups ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
                    <p className="text-sm text-slate-500">جاري تحميل الصوصات...</p>
                  </div>
                ) : allOptionGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <p className="text-sm font-semibold text-slate-700">لا توجد مجموعات صوصات حتى الآن</p>
                    <p className="text-xs text-slate-500">أضف مجموعات خيارات من لوحة الإدارة أولاً.</p>
                  </div>
                ) : (
                  allOptionGroups.map((group) => (
                    <div key={group.id}>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-bold text-slate-700">{group.name_ar}</h4>
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          {group.options?.length || 0} صنف
                        </span>
                      </div>

                      <div className="space-y-2">
                        {group.options?.map((option) => (
                          <div
                            key={option.id}
                            className={clsx(
                              "bg-white border rounded-xl p-3 transition-all",
                              option.is_active ? "border-slate-200" : "border-red-200 bg-red-50/30"
                            )}
                          >
                            {editingSauceId === option.id ? (
                              /* ── Inline Edit Mode ── */
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editSauceName}
                                  onChange={(e) => setEditSauceName(e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-right focus:outline-none focus:ring-2 focus:ring-amber-300"
                                  placeholder="اسم الصوص"
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={editSaucePrice}
                                    onChange={(e) => setEditSaucePrice(Number(e.target.value))}
                                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-300"
                                    placeholder="السعر"
                                    min={0}
                                  />
                                  <button
                                    onClick={async () => {
                                      if (!editSauceName.trim()) { toast.error('اسم الصوص مطلوب'); return; }
                                      try {
                                        await updateOption(option.id, { name_ar: editSauceName.trim(), price_delta: editSaucePrice });
                                        setEditingSauceId(null);
                                        toast.success('تم التعديل');
                                      } catch {
                                        toast.error('حدث خطأ أثناء التعديل');
                                      }
                                    }}
                                    className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition-all"
                                  >
                                    <Save className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingSauceId(null)}
                                    className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-all"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ) : deletingId === option.id ? (
                              /* ── Delete Confirmation ── */
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-red-600 font-bold">حذف "{option.name_ar}"؟</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={async () => {
                                      try {
                                        await deleteOption(option.id);
                                        setDeletingId(null);
                                        toast.success('تم الحذف');
                                      } catch {
                                        toast.error('حدث خطأ أثناء الحذف');
                                      }
                                    }}
                                    className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-all"
                                  >
                                    نعم، احذف
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* ── Normal Display ── */
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {/* Toggle Switch */}
                                  {(() => {
                                    const isOptBranchAvailable = adminBranchScope !== 'all'
                                      ? (option.branch_availability?.[adminBranchScope] !== undefined
                                          ? option.branch_availability[adminBranchScope]
                                          : option.is_active)
                                      : option.is_active;

                                    return (
                                      <button
                                        onClick={async () => {
                                          if (adminBranchScope !== 'all') {
                                            const nextVal = !isOptBranchAvailable;
                                            await updateOption(option.id, {
                                              branch_availability: {
                                                ...(option.branch_availability || {}),
                                                [adminBranchScope]: nextVal,
                                              }
                                            });
                                            toast.success(nextVal ? `تم إتاحة "${option.name_ar}" في ${adminBranchScope}` : `تم إيقاف "${option.name_ar}" في ${adminBranchScope}`);
                                          } else {
                                            try {
                                              await toggleOptionActive(option.id);
                                              toast.success(option.is_active ? `تم إيقاف "${option.name_ar}"` : `تم تفعيل "${option.name_ar}"`);
                                            } catch {
                                              toast.error('حدث خطأ أثناء تغيير الحالة');
                                            }
                                          }
                                        }}
                                        className="transition-all cursor-pointer"
                                        title={adminBranchScope !== 'all' ? `تغيير توفر الصوص في ${adminBranchScope}` : 'تغيير توفر الصوص العام'}
                                      >
                                        {isOptBranchAvailable ? (
                                          <ToggleRight className="w-8 h-8 text-green-500" />
                                        ) : (
                                          <ToggleLeft className="w-8 h-8 text-slate-300" />
                                        )}
                                      </button>
                                    );
                                  })()}
                                  <div>
                                    <p className={clsx(
                                      "text-sm font-bold",
                                      (adminBranchScope !== 'all'
                                        ? (option.branch_availability?.[adminBranchScope] !== undefined ? option.branch_availability[adminBranchScope] : option.is_active)
                                        : option.is_active) ? "text-slate-800" : "text-slate-400 line-through"
                                    )}>
                                      {option.name_ar}
                                      {adminBranchScope !== 'all' && (
                                        <span className="text-[10px] font-normal text-slate-400 mr-1.5">({adminBranchScope})</span>
                                      )}
                                    </p>
                                    {option.price_delta > 0 && (
                                      <p className="text-xs text-slate-400">+{option.price_delta} ج.م</p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingSauceId(option.id);
                                      setEditSauceName(option.name_ar);
                                      setEditSaucePrice(option.price_delta);
                                    }}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                                    title="تعديل"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-slate-400" />
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(option.id)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-all"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add New Sauce Form */}
                      <div className="mt-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newSauceInputs[group.id]?.name || ''}
                            onChange={(e) => setNewSauceInputs((prev) => ({
                              ...prev,
                              [group.id]: { ...(prev[group.id] || { name: '', price: 0 }), name: e.target.value },
                            }))}
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                            placeholder="اسم الصوص الجديد..."
                          />
                          <input
                            type="number"
                            value={newSauceInputs[group.id]?.price ?? 0}
                            onChange={(e) => setNewSauceInputs((prev) => ({
                              ...prev,
                              [group.id]: { ...(prev[group.id] || { name: '', price: 0 }), price: Number(e.target.value) },
                            }))}
                            className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm text-right bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                            placeholder="السعر"
                            min={0}
                          />
                          <button
                            onClick={async () => {
                              const input = newSauceInputs[group.id] || { name: '', price: 0 };
                              if (!input.name.trim()) { toast.error('اسم الصوص مطلوب'); return; }
                              const result = await createOption(group.id, { name_ar: input.name.trim(), price_delta: input.price });
                              if (result) {
                                setNewSauceInputs((prev) => ({
                                  ...prev,
                                  [group.id]: { name: '', price: 0 },
                                }));
                                toast.success(`تم إضافة "${result.name_ar}"`);
                              } else {
                                toast.error('فشل في الإضافة');
                              }
                            }}
                            className="bg-amber-500 text-white p-2 rounded-lg hover:bg-amber-600 transition-all shadow-sm"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

