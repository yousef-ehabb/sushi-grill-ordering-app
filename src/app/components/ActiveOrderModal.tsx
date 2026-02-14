import React, { useEffect, useState } from 'react';
import { X, Clock, Truck, Store, ChefHat, Package, CheckCircle2, CircleDot, Loader2, UtensilsCrossed } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { insforge } from '../../lib/insforge';
import { useAuthStore } from '../store/useAuthStore';
import type { OrderStatus } from '../store/useStore';

interface OrderItem {
    id: string;
    name_ar: string;
    quantity: number;
    unit_price: number;
    special_instructions?: string;
}

interface ActiveOrderData {
    id: string;
    status: OrderStatus;
    type: string;
    total: number;
    created_at: string;
    customer_name: string;
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
    { key: 'out_for_delivery', label: 'في التوصيل', icon: Truck, color: 'text-purple-600', bgColor: 'bg-purple-500' },
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

    // Handle edge cases: delivery order in 'ready' → show as 'preparing'
    if (type === 'delivery' && status === 'ready') return 1;
    // Pickup order in 'out_for_delivery' → show as last step
    if (type === 'pickup' && status === 'out_for_delivery') return 2;

    return -1;
}

interface Props {
    orderId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onBrowseMenu?: () => void;
}

export const ActiveOrderModal: React.FC<Props> = ({ orderId, isOpen, onClose, onBrowseMenu }) => {
    const { user } = useAuthStore();
    const [order, setOrder] = useState<ActiveOrderData | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);

    useEffect(() => {
        if (isOpen && orderId && user) {
            fetchOrder();
        } else if (isOpen && !orderId) {
            setOrder(null);
            setLoading(false);
            setFetchError(false);
        }
    }, [isOpen, orderId]);

    const fetchOrder = async () => {
        setLoading(true);
        setFetchError(false);
        try {
            const { data: orderData } = await insforge.database
                .from('orders')
                .select('*')
                .eq('id', orderId!)
                .eq('user_id', user!.id);

            if (!orderData || orderData.length === 0) {
                setOrder(null);
                setLoading(false);
                return;
            }

            const { data: items } = await insforge.database
                .from('order_items')
                .select('*')
                .eq('order_id', orderId!);

            setOrder({ ...orderData[0], items: items || [] });
        } catch {
            setFetchError(true);
            setOrder(null);
        } finally {
            setLoading(false);
        }
    };

    const steps = order ? getSteps(order.type) : [];
    const activeStepIndex = order ? resolveStepIndex(steps, order.status, order.type) : -1;

    const hasActiveOrder = !!orderId && !!order;

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
                                    {hasActiveOrder ? 'الطلب الحالي' : 'طلباتي'}
                                </h2>
                                {order && (
                                    <p className="text-xs font-mono text-slate-400 mt-0.5">
                                        #{order.id.slice(0, 8).toUpperCase()}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                            >
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-7 h-7 text-primary animate-spin" />
                                </div>
                            ) : hasActiveOrder ? (
                                <>
                                    {/* Status Timeline — type-aware */}
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
                                                    <span className={`text-[10px] font-bold text-center leading-tight ${isCurrent ? 'text-slate-900' : isActive ? 'text-slate-500' : 'text-slate-300'
                                                        }`}>
                                                        {step.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Order Type + Time */}
                                    <div className="flex items-center gap-4 text-xs text-slate-400">
                                        <div className="flex items-center gap-1.5">
                                            {order!.type === 'delivery' ? (
                                                <><Truck className="w-3.5 h-3.5" /> توصيل</>
                                            ) : (
                                                <><Store className="w-3.5 h-3.5" /> استلام</>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(order!.created_at).toLocaleDateString('ar-EG', {
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </div>
                                    </div>

                                    {/* Items */}
                                    <div className="space-y-2.5">
                                        <h3 className="text-sm font-bold text-slate-700">الأصناف</h3>
                                        {order!.items.map((item, i) => (
                                            <div key={item.id || i} className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <span className="w-6 h-6 rounded-lg bg-primary/5 text-primary text-xs font-black flex items-center justify-center shrink-0">
                                                        {item.quantity}×
                                                    </span>
                                                    <span className="text-sm text-slate-700 truncate">{item.name_ar}</span>
                                                </div>
                                                <span className="text-sm font-bold text-slate-500 shrink-0">
                                                    {(item.unit_price * item.quantity).toFixed(0)} ج.م
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Total */}
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                        <span className="text-sm font-bold text-slate-500">الإجمالي</span>
                                        <span className="text-xl font-black text-slate-900">
                                            {order!.total} <span className="text-sm font-bold text-slate-400">ج.م</span>
                                        </span>
                                    </div>
                                </>
                            ) : (
                                /* Empty State — no active order */
                                <div className="flex flex-col items-center justify-center py-10 text-center">
                                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                                        <Package className="w-7 h-7 text-slate-300" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-700 mb-1">لا يوجد طلب حالي</h3>
                                    <p className="text-sm text-slate-400 mb-6">يمكنك طلب وجبتك الآن.</p>
                                    <button
                                        onClick={() => {
                                            onClose();
                                            onBrowseMenu?.();
                                        }}
                                        className="flex items-center gap-2 bg-primary hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-red-500/20 transition-all active:scale-95"
                                    >
                                        <UtensilsCrossed className="w-4 h-4" />
                                        تصفح المنيو
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
