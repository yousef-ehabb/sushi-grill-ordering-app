import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, OrderStatus, Product } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { ProductEditModal } from './ProductEditModal';
import {
  Package,
  Clock,
  CheckCircle,
  ChevronRight,
  LayoutDashboard,
  Utensils,
  Phone,
  MapPin,
  CreditCard,
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
  Hash
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'motion/react';
import { Toaster, toast } from 'sonner';

export const AdminView: React.FC = () => {
  const {
    orders, products, categories, globalSettings, businessRules,
    updateOrderStatus, fetchOrders, fetchProducts, fetchCategories,
    fetchGlobalSettings, fetchBusinessRules,
    updateProduct, updateGlobalSettings, toggleCategoryActive, updateBusinessRule
  } = useStore();
  const { signOut } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'controls'>('orders');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Local state for controls form
  const [localClosedMessage, setLocalClosedMessage] = useState('');
  const [localMinQty, setLocalMinQty] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

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
  }, []);

  // Sync local state when global data loads
  useEffect(() => {
    if (globalSettings) {
      setLocalClosedMessage(globalSettings.closed_message);
    }
  }, [globalSettings]);

  useEffect(() => {
    const map: Record<string, number> = {};
    for (const rule of businessRules) {
      map[rule.category_id] = rule.min_quantity;
    }
    setLocalMinQty(map);
  }, [businessRules]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchOrders(), fetchProducts(), fetchCategories(),
      fetchGlobalSettings(), fetchBusinessRules()
    ]);
    setIsRefreshing(false);
  };

  const handleToggleWebsite = async () => {
    if (!globalSettings) return;
    await updateGlobalSettings({ is_website_open: !globalSettings.is_website_open });
    toast.success(globalSettings.is_website_open ? 'تم إغلاق الموقع' : 'تم فتح الموقع');
  };

  const handleSaveControls = async () => {
    setIsSaving(true);
    try {
      // Save closed message
      if (globalSettings && localClosedMessage !== globalSettings.closed_message) {
        await updateGlobalSettings({ closed_message: localClosedMessage });
      }
      // Save all min quantity rules
      for (const [catId, qty] of Object.entries(localMinQty)) {
        const existing = businessRules.find(r => r.category_id === catId);
        if (!existing || existing.min_quantity !== qty) {
          await updateBusinessRule(catId, qty);
        }
      }
      toast.success('تم حفظ جميع الإعدادات بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء الحفظ');
    }
    setIsSaving(false);
  };

  const statusColors: Record<OrderStatus, string> = {
    new: 'bg-blue-100 text-blue-700',
    preparing: 'bg-orange-100 text-orange-700',
    ready: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-green-100 text-green-700',
  };

  const statusLabels: Record<OrderStatus, string> = {
    new: 'جديد',
    preparing: 'قيد التحضير',
    ready: 'جاهز للاستلام',
    completed: 'تم التسليم',
  };

  const isWebsiteOpen = globalSettings?.is_website_open ?? true;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <Toaster position="top-center" expand={true} richColors />
      {/* Admin TopNav */}
      <div className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          <div className="flex items-center gap-4 lg:gap-6 overflow-x-auto">
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2 shrink-0">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              لوحة الإدارة
            </h1>
            <nav className="flex gap-2 lg:gap-4">
              <button
                onClick={() => setActiveTab('orders')}
                className={clsx(
                  "px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap",
                  activeTab === 'orders' ? "bg-red-50 text-primary" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                الطلبات ({orders.length})
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
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900">الطلبات الواردة</h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {orders.length === 0 ? (
                <div className="bg-white rounded-2xl p-20 text-center border-2 border-dashed border-slate-200">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">لا يوجد طلبات حالياً</p>
                </div>
              ) : (
                orders.map((order) => (
                  <motion.div
                    layout
                    key={order.id}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-black text-slate-900">#{order.id.slice(0, 8).toUpperCase()}</span>
                          <span className={clsx("px-3 py-1 rounded-full text-xs font-bold", statusColors[order.status])}>
                            {statusLabels[order.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {new Date(order.created_at).toLocaleTimeString('ar-EG')}
                          </span>
                          <span className="flex items-center gap-1">
                            <CreditCard className="w-4 h-4" />
                            كاش (عند الاستلام)
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {order.status === 'new' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                            className="bg-primary text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                          >
                            بدء التحضير
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'ready')}
                            className="bg-orange-500 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-100"
                          >
                            جاهز للاستلام
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'completed')}
                            className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-green-700 transition-all shadow-lg shadow-green-100"
                          >
                            تم التسليم
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-6">
                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">تفاصيل العميل</h4>
                        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                          <p className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-100">
                              👤
                            </span>
                            {order.customer_name}
                          </p>
                          <p className="text-slate-600 flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            {order.customer_phone}
                          </p>
                          {order.address && (
                            <p className="text-slate-600 flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              {order.address}
                            </p>
                          )}
                          <div className="inline-flex items-center gap-2 bg-red-50 text-primary px-3 py-1 rounded-lg text-xs font-bold">
                            {order.type === 'delivery' ? 'توصيل للمنزل' : 'استلام من المطعم'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider">الأصناف المطلوبة</h4>
                        <div className="space-y-3">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-slate-800">
                              <div className="flex items-center gap-3">
                                <span className="bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold">
                                  {item.quantity}
                                </span>
                                <span className="font-medium">{item.name_ar}</span>
                              </div>
                              <span className="font-bold">{item.price * item.quantity} ج.م</span>
                            </div>
                          ))}
                          <div className="border-t pt-3 mt-3 flex justify-between items-center text-lg font-black text-slate-900">
                            <span>الإجمالي</span>
                            <span>{order.total} ج.م</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'menu' ? (
          /* ── MENU TAB ───────────────────────────────────── */
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
              {products.map((product) => (
                <div key={product.id} className="group relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:border-red-100 transition-all duration-300 flex flex-col h-full">
                  {/* Image Container */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                    <img
                      src={product.image_url}
                      alt={product.name_ar}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                    {!product.is_available && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <span className="bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg transform -rotate-6">
                          غير متوفر حالياً
                        </span>
                      </div>
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
                    <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 mb-6 flex-grow">
                      {product.description_ar}
                    </p>
                    <button
                      onClick={() => updateProduct(product.id, { is_available: !product.is_available })}
                      className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] border
                        ${product.is_available
                          ? 'bg-white text-green-600 border-green-200 hover:bg-green-50'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                    >
                      <div className={`w-2 h-2 rounded-full ${product.is_available ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                      <span>{product.is_available ? 'متاح للطلب' : 'غير متاح'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── OPERATIONAL CONTROLS TAB ─────────────────── */
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <Settings2 className="w-6 h-6 text-primary" />
                  التحكم التشغيلي
                </h2>
                <p className="text-slate-500 text-sm mt-1">إدارة حالة الموقع والأقسام وقواعد الحد الأدنى للطلب</p>
              </div>
            </div>

            {/* ── Section 1: Global Status ─────────────── */}
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Power className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold text-slate-900">حالة الموقع</h3>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">
                    {isWebsiteOpen ? 'الموقع مفتوح للطلبات' : 'الموقع مغلق حالياً'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {isWebsiteOpen ? 'العملاء يمكنهم تقديم طلبات جديدة' : 'لا يمكن تقديم طلبات حالياً'}
                  </p>
                </div>
                <button
                  onClick={handleToggleWebsite}
                  className={clsx(
                    "flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-sm active:scale-95",
                    isWebsiteOpen
                      ? "bg-green-100 text-green-700 hover:bg-green-200 border border-green-200"
                      : "bg-red-100 text-red-700 hover:bg-red-200 border border-red-200"
                  )}
                >
                  {isWebsiteOpen ? (
                    <><ToggleRight className="w-5 h-5" /> مفتوح</>
                  ) : (
                    <><ToggleLeft className="w-5 h-5" /> مغلق</>
                  )}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  رسالة الإغلاق (تظهر للعملاء عند إغلاق الموقع)
                </label>
                <textarea
                  rows={2}
                  value={localClosedMessage}
                  onChange={(e) => setLocalClosedMessage(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none"
                  placeholder="مثال: المطعم مغلق حالياً ❤️ نلتقي الساعة 11 صباحًا"
                />
              </div>
            </div>

            {/* ── Section 2: Category Controls ─────────── */}
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <Utensils className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold text-slate-900">الأقسام</h3>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full font-bold">{categories.length} قسم</span>
              </div>

              <div className="space-y-3">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={clsx(
                      "flex items-center justify-between p-4 rounded-xl border transition-all",
                      cat.is_active
                        ? "bg-white border-slate-100 hover:border-green-200"
                        : "bg-slate-50 border-slate-200 opacity-70"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        "w-3 h-3 rounded-full",
                        cat.is_active ? "bg-green-500 animate-pulse" : "bg-slate-400"
                      )} />
                      <div>
                        <span className="font-bold text-slate-900">{cat.name_ar}</span>
                        <span className="text-xs text-slate-400 mr-2">({cat.name_en})</span>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await toggleCategoryActive(cat.id);
                        toast.success(cat.is_active ? `تم إيقاف "${cat.name_ar}"` : `تم تفعيل "${cat.name_ar}"`);
                      }}
                      className={clsx(
                        "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all active:scale-95",
                        cat.is_active
                          ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200"
                      )}
                    >
                      {cat.is_active ? (
                        <><ToggleRight className="w-4 h-4" /> مفعّل</>
                      ) : (
                        <><ToggleLeft className="w-4 h-4" /> متوقف</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 3: Minimum Quantity Rules ────── */}
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

            {/* ── Save Button ──────────────────────────── */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveControls}
                disabled={isSaving}
                className="flex items-center gap-2 bg-primary text-white px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                حفـظ الإعدادات
              </button>
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
    </div>
  );
};
