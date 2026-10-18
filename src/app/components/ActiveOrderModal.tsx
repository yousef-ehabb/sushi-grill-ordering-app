import React, { useEffect, useState } from 'react';
import { X, Clock, Truck, Store, ChefHat, Package, CircleDot, Loader2, UtensilsCrossed, Search, AlertCircle, RefreshCw, Copy, Check, XCircle, Ban, CheckCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { ordersService } from '../../services/firestore';
import { useStore, type OrderItem, type OrderStatus } from '../store/useStore';
import { resolveAllOptionNames } from '../utils/optionNames';
import { getDisplayOrderId, isCancellable } from '../utils/orderUtils';
import { broadcastSyncEvent, subscribeToSyncEvents } from '../utils/realtimeSync';

interface ActiveOrderData {
    id: string;
    order_number?: number | null;
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
    { key: 'completed', label: 'تم التسليم', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-500' },
];

const pickupSteps: StatusStep[] = [
    { key: 'new', label: 'جديد', icon: CircleDot, color: 'text-blue-600', bgColor: 'bg-blue-500' },
    { key: 'preparing', label: 'قيد التحضير', icon: ChefHat, color: 'text-amber-600', bgColor: 'bg-amber-500' },
    { key: 'ready', label: 'جاهز للاستلام', icon: Package, color: 'text-teal-600', bgColor: 'bg-teal-500' },
    { key: 'completed', label: 'تم التسليم', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-500' },
];

function getSteps(type: string): StatusStep[] {
    return type === 'delivery' ? deliverySteps : pickupSteps;
}

function resolveStepIndex(steps: StatusStep[], status: string, type: string): number {
    const idx = steps.findIndex(s => s.key === status);
    if (idx !== -1) return idx;

    if (status === 'completed') return 3;
    if (type === 'delivery' && status === 'ready') return 2;
    if (type === 'pickup' && status === 'out_for_delivery') return 2;
    if (status === 'preparing') return 1;
    if (status === 'new') return 0;

    return -1;
}

interface LastSavedOrder {
    orderId: string;
    orderNumber?: number;
    phone: string;
    name?: string;
    timestamp?: number;
}

interface Props {
    orderId: string | null;
    guestPhone?: string | null;
    isOpen: boolean;
    onClose: () => void;
    onBrowseMenu?: () => void;
    onSwitchOrder?: (orderId: string, phone?: string) => void;
}

export const ActiveOrderModal: React.FC<Props> = ({ orderId, guestPhone, isOpen, onClose, onBrowseMenu, onSwitchOrder }) => {
    const { user } = useAuthStore();
    const { activeOrder } = useStore();
    const [order, setOrder] = useState<ActiveOrderData | null>(null);
    const [isManualSearchMode, setIsManualSearchMode] = useState(false);
    const [optionNames, setOptionNames] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Guest manual tracking form state
    const [manualOrderId, setManualOrderId] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [isSearchingGuest, setIsSearchingGuest] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [lastSavedOrder, setLastSavedOrder] = useState<LastSavedOrder | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setIsManualSearchMode(false);
            return;
        }

        if (isManualSearchMode) return;

        setFetchError(null);
        if (orderId) setManualOrderId(orderId);
        if (guestPhone) setManualPhone(guestPhone);

        // Check for last saved order in localStorage for guest convenience
        let savedGuestOrder: LastSavedOrder | null = null;
        try {
            const saved = localStorage.getItem('pochinki_last_order');
            if (saved) {
                const parsed: LastSavedOrder = JSON.parse(saved);
                if (parsed && (parsed.orderId || parsed.orderNumber) && parsed.phone) {
                    savedGuestOrder = parsed;
                    setLastSavedOrder(parsed);
                    if (!orderId) {
                        setManualOrderId((prev) => prev || (parsed.orderNumber ? String(parsed.orderNumber) : parsed.orderId));
                    }
                    if (!guestPhone) {
                        setManualPhone((prev) => prev || parsed.phone);
                    }
                }
            }
        } catch {
            // Ignore localStorage parse errors
        }

        // Scenario 1: Authenticated user tracking an active order
        if (user && orderId) {
            fetchAuthenticatedOrder(orderId);
        }
        // Scenario 2: Guest with passed initial orderId and phone (e.g. right after checkout)
        else if (orderId && (guestPhone || savedGuestOrder?.phone)) {
            fetchGuestOrder(orderId, guestPhone || savedGuestOrder?.phone || '');
        }
        // Scenario 3: Saved guest order in localStorage when opened from tracking button
        else if (savedGuestOrder && (savedGuestOrder.orderId || savedGuestOrder.orderNumber) && savedGuestOrder.phone) {
            const idToTrack = savedGuestOrder.orderId || String(savedGuestOrder.orderNumber);
            fetchGuestOrder(idToTrack, savedGuestOrder.phone);
        }
        // Scenario 4: Manual search modal
        else {
            setOrder(null);
            setLoading(false);
        }
    }, [isOpen, orderId, guestPhone, user, isManualSearchMode]);

    // ── Live Real-Time Subscriptions (Firestore onSnapshot + Server Polling + BroadcastChannel fallback) ──
    useEffect(() => {
        if (!isOpen || isManualSearchMode) return;

        const targetId = isManualSearchMode ? null : (order?.id || orderId);
        if (!targetId) return;

        // Normalize order ID for matching: strip '#', trim whitespace, compare as string
        const normalizeId = (id: string | number | null | undefined): string =>
            String(id ?? '').replace(/^#/, '').trim();

        const normalizedTargetId = normalizeId(targetId);
        const normalizedOrderNumber = order?.order_number ? normalizeId(order.order_number) : null;

        // Helper: check if an incoming orderId matches the current tracked order
        const matchesOrder = (incomingId: string | number | null | undefined): boolean => {
            const normalized = normalizeId(incomingId);
            if (!normalized) return false;
            return (
                normalized === normalizedTargetId ||
                normalized === normalizeId(order?.id) ||
                (normalizedOrderNumber !== null && normalized === normalizedOrderNumber)
            );
        };

        // ─── 1. Firebase Firestore live onSnapshot subscription (PRIMARY cross-device channel) ───
        let unsubscribeFirestore = ordersService.subscribeToOrder(targetId, (freshOrder) => {
            if (freshOrder) {
                setOrder((prev) => {
                    if (!prev) {
                        return {
                            id: freshOrder.id,
                            order_number: freshOrder.order_number || null,
                            status: freshOrder.status,
                            type: freshOrder.type,
                            branch: freshOrder.branch,
                            subtotal: freshOrder.subtotal,
                            delivery_fee: freshOrder.delivery_fee,
                            total: freshOrder.total,
                            created_at: freshOrder.created_at,
                            items: freshOrder.items || [],
                        };
                    }
                    if (prev.status === freshOrder.status && prev.total === freshOrder.total) {
                        return prev;
                    }
                    return {
                        ...prev,
                        status: freshOrder.status,
                        total: freshOrder.total ?? prev.total,
                        subtotal: freshOrder.subtotal ?? prev.subtotal,
                        delivery_fee: freshOrder.delivery_fee ?? prev.delivery_fee,
                        items: freshOrder.items ?? prev.items,
                    };
                });
            }
        });

        // ─── 2. BroadcastChannel & LocalStorage sync (same-browser bonus, NOT cross-device) ───
        const unsubscribeSync = subscribeToSyncEvents((event) => {
            if (event.type === 'ORDER_STATUS_CHANGED') {
                setOrder((prev) => {
                    if (!prev) return null;
                    if (matchesOrder(event.orderId) && prev.status !== event.status) {
                        return { ...prev, status: event.status };
                    }
                    return prev;
                });
            } else if (event.type === 'ORDER_EVENT_NOTIFICATION') {
                if (matchesOrder(event.orderId)) {
                    ordersService.getOrderByIdFromServer(targetId).then((fresh) => {
                        if (fresh) setOrder((prev) => (prev ? { ...prev, ...fresh } : null));
                    });
                }
            }
        });

        // ─── 3. Storage event listener (same-browser bonus) ───
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'pochinki_orders_cache' && e.newValue) {
                try {
                    const cachedList = JSON.parse(e.newValue);
                    if (Array.isArray(cachedList)) {
                        setOrder((prev) => {
                            if (!prev) return null;
                            const found = cachedList.find(
                                (o: any) => matchesOrder(o.id) || matchesOrder(o.order_number)
                            );
                            if (found && found.status && found.status !== prev.status) {
                                return { ...prev, status: found.status };
                            }
                            return prev;
                        });
                    }
                } catch {
                    // Ignore JSON parse errors
                }
            }
        };
        window.addEventListener('storage', handleStorage);

        // ─── 4. Cross-Device Server Polling (2.5s interval, bypasses Firestore local cache) ───
        const pollFromServer = async () => {
            try {
                const currentId = order?.id || orderId;
                if (!currentId) return;

                // Use getOrderByIdFromServer which calls getDocFromServer/getDocsFromServer
                // This bypasses persistentLocalCache and fetches fresh data from the server
                const fresh = await ordersService.getOrderByIdFromServer(currentId);
                if (fresh) {
                    setOrder((prev) => {
                        if (!prev) return null;
                        if (prev.status !== fresh.status) {
                            return {
                                ...prev,
                                status: fresh.status,
                                total: fresh.total ?? prev.total,
                                subtotal: (fresh as any).subtotal ?? prev.subtotal,
                                delivery_fee: (fresh as any).delivery_fee ?? prev.delivery_fee,
                                items: fresh.items ?? prev.items,
                            };
                        }
                        return prev;
                    });
                }
            } catch {
                // Background server polling error — silently ignore, onSnapshot is primary
            }
        };

        const pollTimer = setInterval(pollFromServer, 2500);

        // ─── 5. Visibility Change Handler (mobile browsers kill WebSocket when backgrounded) ───
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // When user returns to the tab/app, re-subscribe onSnapshot and do an immediate server poll
                unsubscribeFirestore();
                unsubscribeFirestore = ordersService.subscribeToOrder(targetId, (freshOrder) => {
                    if (freshOrder) {
                        setOrder((prev) => {
                            if (!prev) {
                                return {
                                    id: freshOrder.id,
                                    order_number: freshOrder.order_number || null,
                                    status: freshOrder.status,
                                    type: freshOrder.type,
                                    branch: freshOrder.branch,
                                    subtotal: freshOrder.subtotal,
                                    delivery_fee: freshOrder.delivery_fee,
                                    total: freshOrder.total,
                                    created_at: freshOrder.created_at,
                                    items: freshOrder.items || [],
                                };
                            }
                            if (prev.status === freshOrder.status && prev.total === freshOrder.total) {
                                return prev;
                            }
                            return {
                                ...prev,
                                status: freshOrder.status,
                                total: freshOrder.total ?? prev.total,
                                subtotal: freshOrder.subtotal ?? prev.subtotal,
                                delivery_fee: freshOrder.delivery_fee ?? prev.delivery_fee,
                                items: freshOrder.items ?? prev.items,
                            };
                        });
                    }
                });
                // Immediate server poll on visibility restore
                pollFromServer();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            unsubscribeFirestore();
            unsubscribeSync();
            window.removeEventListener('storage', handleStorage);
            clearInterval(pollTimer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isOpen, order?.id, order?.order_number, order?.status, orderId, isManualSearchMode]);

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
                try {
                    localStorage.removeItem('pochinki_last_order');
                    setLastSavedOrder(null);
                } catch {
                    // ignore
                }
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
                order_number: orderData.order_number || null,
                status: orderData.status,
                type: orderData.type,
                branch: orderData.branch,
                subtotal: orderData.subtotal,
                delivery_fee: orderData.delivery_fee,
                total: orderData.total,
                created_at: orderData.created_at,
                items,
            });
            setIsManualSearchMode(false);
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
                try {
                    localStorage.removeItem('pochinki_last_order');
                    setLastSavedOrder(null);
                    useStore.setState({ activeOrder: null });
                } catch {
                    // ignore
                }
                return;
            }

            const items = (guestOrder as any).items || [];
            if (items.length > 0) {
                const namesMap = await resolveAllOptionNames(items.map((i: any) => i.selected_option_ids || []));
                setOptionNames(namesMap);
            }

            setOrder({
                id: guestOrder.id,
                order_number: (guestOrder as any).order_number || null,
                status: guestOrder.status,
                type: guestOrder.type,
                branch: guestOrder.branch,
                subtotal: (guestOrder as any).subtotal,
                delivery_fee: (guestOrder as any).delivery_fee,
                total: guestOrder.total,
                created_at: guestOrder.created_at,
                items,
            });

            setIsManualSearchMode(false);

            // Save to localStorage for convenience
            try {
                const savedOrder: LastSavedOrder = {
                    orderId: guestOrder.id,
                    orderNumber: (guestOrder as any).order_number || undefined,
                    phone: phone.trim(),
                    timestamp: Date.now(),
                };
                localStorage.setItem('pochinki_last_order', JSON.stringify(savedOrder));
                setLastSavedOrder(savedOrder);
            } catch {
                // ignore
            }

            useStore.setState({
                activeOrder: {
                    id: guestOrder.id,
                    status: guestOrder.status,
                },
            });

            onSwitchOrder?.(guestOrder.id, phone.trim());
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

    const handleCancelOrder = async () => {
        if (!order || !isCancellable(order.status)) return;
        if (!window.confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) return;

        setIsCancelling(true);
        try {
            await ordersService.updateOrderStatus(order.id, 'cancelled');
            setOrder({ ...order, status: 'cancelled' });
            broadcastSyncEvent({
                type: 'ORDER_STATUS_CHANGED',
                orderId: order.id,
                status: 'cancelled',
            });
            toast.success('تم إلغاء الطلب بنجاح');
        } catch {
            toast.error('تعذر إلغاء الطلب. يرجى المحاولة مرة أخرى.');
        } finally {
            setIsCancelling(false);
        }
    };

    const steps = order ? getSteps(order.type) : [];
    const activeStepIndex = order ? resolveStepIndex(steps, order.status, order.type) : -1;
    const hasOrder = Boolean(order) && !isManualSearchMode;
    const canReturnToCurrent = isManualSearchMode && Boolean(orderId || activeOrder?.id || lastSavedOrder);

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
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-sm font-black text-primary font-mono bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                                            رقم الطلب: {getDisplayOrderId(order as any)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const textToCopy = order.order_number ? String(order.order_number) : order.id;
                                                navigator.clipboard?.writeText(textToCopy);
                                                setCopied(true);
                                                toast.success('تم نسخ رقم الطلب');
                                                setTimeout(() => setCopied(false), 2000);
                                            }}
                                            className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex items-center justify-center"
                                            title="نسخ رقم الطلب"
                                        >
                                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {hasOrder && (
                                    <button
                                        onClick={() => {
                                            setIsManualSearchMode(true);
                                            setOrder(null);
                                            setFetchError(null);
                                            setManualOrderId('');
                                            setManualPhone('');
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
                                    {/* Cancelled State Banner */}
                                    {order.status === 'cancelled' && (
                                        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center space-y-2">
                                            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
                                                <Ban className="w-6 h-6" />
                                            </div>
                                            <h3 className="text-base font-black text-red-700">تم إلغاء الطلب</h3>
                                            <p className="text-xs text-red-500">تم إلغاء هذا الطلب ولن تتم معالجته</p>
                                        </div>
                                    )}

                                    {/* Status Timeline (visible for all non-cancelled orders) */}
                                    {order.status !== 'cancelled' && (
                                        <div className="space-y-4">
                                            <div className="relative py-2">
                                                {/* Connecting track line */}
                                                <div className="absolute top-5 right-6 left-6 h-1 bg-slate-100 -z-0">
                                                    <div
                                                        className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, (activeStepIndex / (steps.length - 1)) * 100))}%`
                                                        }}
                                                    />
                                                </div>

                                                {/* 4 Steps Icons (RTL) */}
                                                <div className="relative z-10 flex items-start justify-between">
                                                    {steps.map((step, i) => {
                                                        const Icon = step.icon;
                                                        const isActive = i <= activeStepIndex;
                                                        const isCurrent = i === activeStepIndex;
                                                        const isCompletedStep = step.key === 'completed' && isCurrent;

                                                        return (
                                                            <div key={step.key} className="flex flex-col items-center gap-1.5 flex-1">
                                                                <div
                                                                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                                                                        isCompletedStep
                                                                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 ring-4 ring-emerald-100'
                                                                            : isCurrent
                                                                                ? `${step.bgColor} text-white shadow-lg ring-4 ring-slate-100`
                                                                                : isActive
                                                                                    ? 'bg-slate-700 text-white'
                                                                                    : 'bg-slate-100 text-slate-300'
                                                                    }`}
                                                                >
                                                                    <Icon className="w-4 h-4" />
                                                                </div>
                                                                <span
                                                                    className={`text-[10px] font-bold text-center leading-tight ${
                                                                        isCurrent
                                                                            ? isCompletedStep ? 'text-emerald-700 font-black' : 'text-slate-900 font-black'
                                                                            : isActive
                                                                                ? 'text-slate-600 font-semibold'
                                                                                : 'text-slate-300'
                                                                    }`}
                                                                >
                                                                    {step.label}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Completed Message Banner */}
                                            {order.status === 'completed' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1.5 shadow-sm"
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-md shadow-emerald-200">
                                                        <CheckCircle className="w-5 h-5" />
                                                    </div>
                                                    <h3 className="text-sm font-black text-emerald-800">
                                                        تم تسليم طلبك بنجاح! بالهنا والشفا من بوشنكي برجر ❤️
                                                    </h3>
                                                    <p className="text-[11px] text-emerald-600 font-medium">
                                                        نسعد دائماً بخدمتكم وتجهيز أشهى الوجبات لكم
                                                    </p>
                                                </motion.div>
                                            )}
                                        </div>
                                    )}

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

                                    {/* Cancel Button (only for new orders) */}
                                    {isCancellable(order.status) && (
                                        <div className="pt-3 border-t border-slate-100">
                                            <button
                                                onClick={handleCancelOrder}
                                                disabled={isCancelling}
                                                className="w-full py-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                                            >
                                                {isCancelling ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإلغاء...</>
                                                ) : (
                                                    <><XCircle className="w-4 h-4" /> إلغاء الطلب</>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {/* Helper note when cancellation is no longer possible */}
                                    {(order.status === 'preparing' || order.status === 'ready' || order.status === 'out_for_delivery') && (
                                        <p className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
                                            لا يمكن إلغاء الطلب لأنه قيد التحضير حالياً
                                        </p>
                                    )}
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

                                    {/* Quick Chip for Last Saved Order on this Device */}
                                    {lastSavedOrder && (
                                        <div className="bg-gradient-to-r from-red-50 to-amber-50/70 border border-red-200/90 rounded-2xl p-3.5 space-y-2.5 text-right shadow-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                                    آخر طلب مسجل على هذا الجهاز
                                                </span>
                                                <span className="text-xs font-mono font-black text-primary bg-white px-2.5 py-0.5 rounded-lg border border-red-200 shadow-2xs">
                                                    {lastSavedOrder.orderNumber ? `#${lastSavedOrder.orderNumber}` : `#${lastSavedOrder.orderId.slice(0, 8)}`}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-red-100/60">
                                                <span className="text-xs text-slate-600 font-medium">
                                                    هاتف: <span className="font-mono font-bold" dir="ltr">{lastSavedOrder.phone}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const id = lastSavedOrder.orderNumber ? String(lastSavedOrder.orderNumber) : lastSavedOrder.orderId;
                                                        setManualOrderId(id);
                                                        setManualPhone(lastSavedOrder.phone);
                                                        fetchGuestOrder(id, lastSavedOrder.phone);
                                                    }}
                                                    className="px-3 py-1.5 bg-primary hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                                                >
                                                    <span>متابعة هذا الطلب</span>
                                                    <ArrowLeft className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <form onSubmit={handleManualSearch} className="space-y-3.5">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-700 block">رقم الطلب (مثال: 1001 أو معرّف الطلب)</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="مثال: 1001 أو معرّف الطلب"
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

                                    {canReturnToCurrent && (
                                        <div className="pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsManualSearchMode(false);
                                                    setFetchError(null);
                                                }}
                                                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 border border-slate-200"
                                            >
                                                <span>العودة للطلب الحالي</span>
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}

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
