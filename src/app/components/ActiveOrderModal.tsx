import React, { useEffect, useState } from 'react';
import { X, Clock, Truck, Store, ChefHat, Package, CircleDot, Loader2, UtensilsCrossed, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { ordersService } from '../../services/firestore';
import type { OrderItem, OrderStatus } from '../store/useStore';
import { resolveAllOptionNames } from '../utils/optionNames';

interface ActiveOrderData {
    id: string;
    status: OrderStatus;
    type: string;
    branch?: string;
    subtotal?: number;
    delivery_fee?: number;
    total: number;
    created_at: string;
    items: OrderItem[];
}

interface StatusStep {
    key: string;
    label: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    bgColor: string;
}

const deliverySteps: StatusStep[] = [
    { key: 'new', label: 'جديد', icon: CircleDot, color: 'text-blue-600', bgColor: 'bg-blue-500' },
    { key: 'preparing', label: 'قيد التحضير', icon: ChefHat, color: 'text-amber-600', bgColor: 'bg-amber-500' },
    { key: 'out_for_delivery', label: 'في التوصيل', icon: Truck, color: 'text-teal-600', bgColor: 'bg-teal-500' },
];

const pickupSteps: StatusStep[] = [
    { key: 'new', label: 'جديد', icon: CircleDot, color: 'text-blue-600', bgColor: 'bg-blue-500' },
    { key: 'preparing', label: 'قيد التحضير', icon: ChefHat, color: 'text-amber-600', bgColor: 'bg-amber-500' },
    { key: 'ready', label: 'جاهز للاستلام', icon: Package, color: 'text-emerald-600', bgColor: 'bg-emerald-500' },
];

function getSteps(type: string): StatusStep[] {
    return type === 'delivery' ? deliverySteps : pickupSteps;
}

function resolveStepIndex(steps: StatusStep[], status: string, type: string): number {
    const idx = steps.findIndex(s => s.key === status);
    if (idx !== -1) return idx;

    if (type === 'delivery' && status === 'ready') return 1;
    if (type === 'pickup' && status === 'out_for_delivery') return 2;

    return -1;
}

interface Props {
    orderId: string | null;
    guestPhone?: string | null;
    isOpen: boolean;
    onClose: () => void;
    onBrowseMenu?: () => void;
}

export const ActiveOrderModal: React.FC<Props> = ({ orderId, guestPhone, isOpen, onClose, onBrowseMenu }) => {
    const { user } = useAuthStore();
    const [order, setOrder] = useState<ActiveOrderData | null>(null);
    const [optionNames, setOptionNames] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Guest manual tracking form state
    const [manualOrderId, setManualOrderId] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [isSearchingGuest, setIsSearchingGuest] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        setFetchError(null);

        // Scenario 1: Authenticated user tracking an active order
        if (user && orderId) {
            fetchAuthenticatedOrder(orderId);
        }
        // Scenario 2: Guest with passed initial orderId and phone (e.g. right after checkout)
        else if (orderId && guestPhone) {
            fetchGuestOrder(orderId, guestPhone);
        }
        // Scenario 3: Manual search modal
        else {
            setOrder(null);
            setLoading(false);
        }
    }, [isOpen, orderId, guestPhone, user]);

    const fetchAuthenticatedOrder = async (id: string) => {
        if (!id || !user || !isFirebaseConfigured() || !db) {
            setOrder(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setFetchError(null);
        try {
            const orderSnap = await getDoc(doc(db, 'orders', id));

            if (!orderSnap.exists()) {
                setOrder(null);
                setFetchError('لم يتم العثور على الطلب');
                return;
            }

            const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;

            // Security check: verify order belongs to current user
            if (orderData.user_id !== user.id) {
                setOrder(null);
                setFetchError('ليس لديك صلاحية لمشاهدة هذا الطلب');
                return;
            }

            const items = orderData.items || [];
            if (items.length > 0) {
                const namesMap = await resolveAllOptionNames(items.map((i: any) => i.selected_option_ids || []));
                setOptionNames(namesMap);
            }

            setOrder({
                id: orderData.id,
                status: orderData.status,
                type: orderData.type,
                branch: orderData.branch,
                subtotal: orderData.subtotal,
                delivery_fee: orderData.delivery_fee,
                total: orderData.total,
                created_at: orderData.created_at,
                items,
            });
        } catch {
            setFetchError('تعذر تحميل بيانات الطلب');
            setOrder(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchGuestOrder = async (id: string, phone: string) => {
        setLoading(true);
        setIsSearchingGuest(true);
        setFetchError(null);

        try {
            const guestOrder = await ordersService.trackGuestOrder(id.trim(), phone.trim());
            if (!guestOrder) {
                setOrder(null);
                setFetchError('لم يتم العثور على الطلب. يرجى التأكد من رقم الطلب ورقم الهاتف.');
                return;
            }

            const items = (guestOrder as any).items || [];
            if (items.length > 0) {
                const namesMap = await resolveAllOptionNames(items.map((i: any) => i.selected_option_ids || []));
                setOptionNames(namesMap);
            }

            setOrder({
                id: guestOrder.id,
                status: guestOrder.status,
                type: guestOrder.type,
                branch: guestOrder.branch,
                subtotal: (guestOrder as any).subtotal,
                delivery_fee: (guestOrder as any).delivery_fee,
                total: guestOrder.total,
                created_at: guestOrder.created_at,
                items,
            });
        } catch {
            setFetchError('حدث خطأ أثناء الاستعلام عن الطلب. يرجى المحاولة مرة أخرى.');
            setOrder(null);
        } finally {
            setLoading(false);
            setIsSearchingGuest(false);
        }
    };

    const handleManualSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualOrderId.trim() || !manualPhone.trim()) {
            setFetchError('يرجى إدخال رقم الطلب ورقم الهاتف');
            return;
        }
        fetchGuestOrder(manualOrderId.trim(), manualPhone.trim());
    };

    const steps = order ? getSteps(order.type) : [];
    const activeStepIndex = order ? resolveStepIndex(steps, order.status, order.type) : -1;
    const hasOrder = !!order;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
                    onClick={onClose}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md mx-4 bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
                        dir="rtl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">
                                    {hasOrder ? 'متابعة الطلب' : 'تتبع حالة طلبك'}
                                </h2>
                                {order && (
                                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                                        #{order.id.slice(0, 10).toUpperCase()}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {hasOrder && (
                                    <button
                                        onClick={() => {
                                            setOrder(null);
                                            setFetchError(null);
                                        }}
                                        className="p-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 font-bold"
                                        title="بحث عن طلب آخر"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                        <span>طلب آخر</span>
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                                    aria-label="إغلاق"
                                >
                                    <X className="w-4 h-4 text-slate-500" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                    <p className="text-xs text-slate-400 font-bold">جاري تحميل بيانات الطلب...</p>
                                </div>
                            ) : hasOrder ? (
                                <>
                                    {/* Status Timeline */}
                                    <div className="flex items-center justify-between">
                                        {steps.map((step, i) => {
                                            const Icon = step.icon;
                                            const isActive = i <= activeStepIndex;
                                            const isCurrent = i === activeStepIndex;
                                            return (
                                                <div key={step.key} className="flex flex-col items-center gap-1.5 flex-1">
                                                    <div
                                                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isCurrent
                                                            ? `${step.bgColor} text-white shadow-lg`
                                                            : isActive
                                                                ? 'bg-slate-200 text-slate-600'
                                                                : 'bg-slate-100 text-slate-300'
                                                            }`}
                                                    >
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <span className={`text-[10px] font-bold text-center leading-tight ${isCurrent ? 'text-slate-900 font-black' : isActive ? 'text-slate-500' : 'text-slate-300'}`}>
                                                        {step.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Order Type + Branch + Time */}
                                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            {order.type === 'delivery' ? (
                                                <><Truck className="w-3.5 h-3.5 text-primary" /> توصيل للمنزل</>
                                            ) : (
                                                <><Store className="w-3.5 h-3.5 text-primary" /> استلام من الفرع</>
                                            )}
                                        </div>
                                        {order.branch && (
                                            <span className="font-semibold text-slate-600">
                                                {order.branch}
                                            </span>
                                        )}
                                        <div className="flex items-center gap-1 text-slate-400 mr-auto font-mono">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(order.created_at).toLocaleTimeString('ar-EG', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div className="space-y-2.5">
                                        <h3 className="text-sm font-bold text-slate-700">تفاصيل الوجبات</h3>
                                        {order.items.map((item, i) => (
                                            <div key={item.id || i} className="flex items-start justify-between gap-3 p-2.5 bg-white border border-slate-100 rounded-xl">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-lg bg-red-50 text-primary text-xs font-black flex items-center justify-center shrink-0">
                                                            {item.quantity}×
                                                        </span>
                                                        <span className="text-sm text-slate-800 truncate font-bold">{item.name_ar}</span>
                                                    </div>
                                                    <div className="mr-8 space-y-0.5 mt-1">
                                                        {item.selected_option_ids && item.selected_option_ids.length > 0 && (
                                                            <p className="text-[11px] text-slate-400 font-medium">
                                                                إضافات: {item.selected_option_ids.map((id: string) => optionNames.get(id)).filter(Boolean).join('، ')}
                                                            </p>
                                                        )}
                                                        {item.special_instructions && (
                                                            <p className="text-[11px] text-slate-400 font-medium italic">
                                                                — {item.special_instructions}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="text-sm font-black text-slate-800 shrink-0 mt-0.5">
                                                    {(item.unit_price * item.quantity).toFixed(0)} ج.م
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Price Breakdown */}
                                    <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                                        {typeof order.subtotal === 'number' && (
                                            <div className="flex justify-between text-slate-500 font-medium">
                                                <span>المجموع الفرعي</span>
                                                <span>{order.subtotal} ج.م</span>
                                            </div>
                                        )}
                                        {typeof order.delivery_fee === 'number' && order.delivery_fee > 0 && (
                                            <div className="flex justify-between text-slate-500 font-medium">
                                                <span>رسوم التوصيل</span>
                                                <span>{order.delivery_fee} ج.م</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                                            <span className="text-sm font-bold text-slate-700">الإجمالي النهائي</span>
                                            <span className="text-xl font-black text-primary">
                                                {order.total} <span className="text-xs font-bold text-slate-400">ج.م</span>
                                            </span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* Guest Search Form / Empty State */
                                <div className="space-y-5">
                                    <div className="text-center space-y-1.5 pt-2">
                                        <div className="w-12 h-12 rounded-2xl bg-red-50 text-primary mx-auto flex items-center justify-center">
                                            <Search className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-base font-black text-slate-900">متابعة طلب سابق أو كزائر</h3>
                                        <p className="text-xs text-slate-400 max-w-[280px] mx-auto">
                                            أدخل رقم الطلب المسجل ورقم الهاتف الذي استخدمته عند إتمام الطلب
                                        </p>
                                    </div>

                                    {fetchError && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                                            <span>{fetchError}</span>
                                        </div>
                                    )}

                                    <form onSubmit={handleManualSearch} className="space-y-3.5">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-700 block">رقم الطلب</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="مثال: ord_abc123 أو معرف الطلب"
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                                value={manualOrderId}
                                                onChange={(e) => setManualOrderId(e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-700 block">رقم الهاتف</label>
                                            <input
                                                type="tel"
                                                required
                                                maxLength={11}
                                                placeholder="01xxxxxxxxx"
                                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-left"
                                                dir="ltr"
                                                value={manualPhone}
                                                onChange={(e) => setManualPhone(e.target.value)}
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isSearchingGuest || !manualOrderId.trim() || !manualPhone.trim()}
                                            className="w-full py-3 bg-primary hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl text-sm shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                                        >
                                            {isSearchingGuest ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span>جاري الاستعلام...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Search className="w-4 h-4" />
                                                    <span>متابعة الطلب</span>
                                                </>
                                            )}
                                        </button>
                                    </form>

                                    <div className="pt-3 border-t border-slate-100 text-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onClose();
                                                onBrowseMenu?.();
                                            }}
                                            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5 mx-auto"
                                        >
                                            <UtensilsCrossed className="w-3.5 h-3.5" />
                                            <span>العودة لتصفح المنيو</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
