import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore, type OrderItem } from '../../store/useStore';
import { useAuthStore } from '../../store/useAuthStore';
import { ArrowRight, Clock, Truck, Store, MapPin, Phone, User, RefreshCw, Loader2, CheckCircle2, ChefHat, Package, CircleDot } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { insforge } from '../../../lib/insforge';

interface OrderDetail {
    id: string;
    customer_name: string;
    customer_phone: string;
    address?: string;
    type: string;
    total: number;
    status: string;
    created_at: string;
    items: OrderItem[];
}

interface StatusStep {
    key: string;
    label: string;
    icon: React.FC<{ className?: string }>;
}

const deliverySteps: StatusStep[] = [
    { key: 'new', label: 'جديد', icon: CircleDot },
    { key: 'preparing', label: 'قيد التحضير', icon: ChefHat },
    { key: 'out_for_delivery', label: 'في التوصيل', icon: Truck },
    { key: 'completed', label: 'مكتمل', icon: CheckCircle2 },
];

const pickupSteps: StatusStep[] = [
    { key: 'new', label: 'جديد', icon: CircleDot },
    { key: 'preparing', label: 'قيد التحضير', icon: ChefHat },
    { key: 'ready', label: 'جاهز للاستلام', icon: Package },
    { key: 'completed', label: 'مكتمل', icon: CheckCircle2 },
];

function getStepsForType(type: string): StatusStep[] {
    return type === 'delivery' ? deliverySteps : pickupSteps;
}

function resolveStepIndex(steps: StatusStep[], status: string, type: string): number {
    const idx = steps.findIndex(s => s.key === status);
    if (idx !== -1) return idx;
    // Edge: delivery order in 'ready' → show as 'preparing'
    if (type === 'delivery' && status === 'ready') return 1;
    // Edge: pickup order in 'out_for_delivery' → show as last active step
    if (type === 'pickup' && status === 'out_for_delivery') return 2;
    // Cancelled → show nothing active
    if (status === 'cancelled') return -1;
    return -1;
}

export const OrderDetailPage: React.FC = () => {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { reorderFromHistory, products, fetchProducts } = useStore();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [reordering, setReordering] = useState(false);

    useEffect(() => {
        if (orderId && user) {
            fetchOrderDetail();
        }
        if (products.length === 0) {
            fetchProducts();
        }
    }, [orderId, user]);

    const fetchOrderDetail = async () => {
        if (!orderId || !user) return;
        setLoading(true);
        try {
            const { data: orderData, error: orderError } = await insforge.database
                .from('orders')
                .select('*')
                .eq('id', orderId)
                .eq('user_id', user.id);

            if (orderError || !orderData || orderData.length === 0) {
                navigate('/account', { replace: true });
                return;
            }

            const { data: items } = await insforge.database
                .from('order_items')
                .select('*')
                .eq('order_id', orderId);

            setOrder({ ...orderData[0], items: items || [] });
        } catch {
            toast.error('فشل تحميل تفاصيل الطلب');
            navigate('/account', { replace: true });
        } finally {
            setLoading(false);
        }
    };

    const handleReorder = () => {
        if (!order?.items || order.items.length === 0) return;
        setReordering(true);

        const result = reorderFromHistory(order.items);

        if (result.added > 0) {
            toast.success(`تمت إضافة ${result.added} أصناف إلى السلة`);
            if (result.skipped.length > 0) {
                toast.warning(`${result.skipped.length} أصناف غير متوفرة حالياً: ${result.skipped.join('، ')}`, { duration: 5000 });
            }
            setTimeout(() => navigate('/'), 600);
        } else {
            toast.error('جميع الأصناف غير متوفرة حالياً');
            setReordering(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    if (!order) return null;

    const steps = getStepsForType(order.type);
    const activeStep = resolveStepIndex(steps, order.status, order.type);

    return (
        <div className="min-h-screen bg-slate-50 pb-32" dir="rtl">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
                <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
                    <button
                        onClick={() => navigate('/account', { state: { tab: 'orders' } })}
                        className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                    >
                        <ArrowRight className="w-5 h-5 text-slate-700" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black text-slate-900">
                            تفاصيل الطلب
                        </h1>
                        <p className="text-xs font-mono text-slate-400">
                            #{order.id.slice(0, 8).toUpperCase()}
                        </p>
                    </div>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
                {/* Status Timeline */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5"
                >
                    <h2 className="text-sm font-bold text-slate-900 mb-5">حالة الطلب</h2>
                    <div className="flex items-center justify-between relative">
                        {/* Progress line */}
                        <div className="absolute top-5 right-5 left-5 h-0.5 bg-slate-100 z-0" />
                        <div
                            className="absolute top-5 right-5 h-0.5 bg-primary z-0 transition-all duration-700"
                            style={{ width: `${activeStep >= 0 ? (activeStep / (steps.length - 1)) * (100 - 10) : 0}%` }}
                        />

                        {steps.map((step, i) => {
                            const Icon = step.icon;
                            const isActive = i <= activeStep;
                            const isCurrent = i === activeStep;
                            return (
                                <div key={step.key} className="flex flex-col items-center gap-2 z-10">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${isCurrent
                                            ? 'bg-primary text-white shadow-lg shadow-red-500/30 scale-110'
                                            : isActive
                                                ? 'bg-primary/10 text-primary'
                                                : 'bg-slate-100 text-slate-300'
                                            }`}
                                    >
                                        <Icon className="w-4.5 h-4.5" />
                                    </div>
                                    <span className={`text-[11px] font-bold ${isCurrent ? 'text-primary' : isActive ? 'text-slate-600' : 'text-slate-300'
                                        }`}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-5 pt-4 border-t border-slate-50">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(order.created_at).toLocaleDateString('ar-EG', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </div>
                </motion.div>

                {/* Items Section */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5"
                >
                    <h2 className="text-sm font-bold text-slate-900 mb-4">الأصناف ({order.items.length})</h2>
                    <div className="space-y-3">
                        {order.items.map((item, i) => (
                            <div key={item.id || i} className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-lg bg-primary/5 text-primary text-xs font-black flex items-center justify-center shrink-0">
                                            {item.quantity}×
                                        </span>
                                        <span className="text-sm font-bold text-slate-800 truncate">
                                            {item.name_ar}
                                        </span>
                                    </div>
                                    {item.special_instructions && (
                                        <p className="text-xs text-slate-400 mt-1 mr-8 line-clamp-2">
                                            📝 {item.special_instructions}
                                        </p>
                                    )}
                                </div>
                                <span className="text-sm font-bold text-slate-600 shrink-0">
                                    {(item.unit_price * item.quantity).toFixed(0)} ج.م
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Subtotal */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                        <span className="text-sm font-bold text-slate-500">الإجمالي</span>
                        <span className="text-lg font-black text-slate-900">
                            {order.total} <span className="text-sm font-bold text-slate-400">ج.م</span>
                        </span>
                    </div>
                </motion.div>

                {/* Order Info */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5"
                >
                    <h2 className="text-sm font-bold text-slate-900 mb-4">معلومات الطلب</h2>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                                <User className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">الاسم</p>
                                <p className="text-sm font-bold text-slate-700">{order.customer_name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                                <Phone className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">الهاتف</p>
                                <p className="text-sm font-bold text-slate-700 font-mono" dir="ltr">{order.customer_phone}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                                {order.type === 'delivery' ? (
                                    <Truck className="w-4 h-4 text-slate-400" />
                                ) : (
                                    <Store className="w-4 h-4 text-slate-400" />
                                )}
                            </div>
                            <div>
                                <p className="text-xs text-slate-400">نوع الطلب</p>
                                <p className="text-sm font-bold text-slate-700">
                                    {order.type === 'delivery' ? 'توصيل' : 'استلام من المطعم'}
                                </p>
                            </div>
                        </div>

                        {order.address && (
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
                                    <MapPin className="w-4 h-4 text-slate-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400">عنوان التوصيل</p>
                                    <p className="text-sm font-bold text-slate-700">{order.address}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Fixed Bottom: Reorder CTA */}
            <div className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 p-4 z-20">
                <div className="max-w-lg mx-auto">
                    <button
                        onClick={handleReorder}
                        disabled={reordering || order.items.length === 0}
                        className="w-full py-4 rounded-2xl font-black text-white bg-primary hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center gap-2.5 shadow-xl shadow-red-500/20"
                    >
                        {reordering ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <RefreshCw className="w-5 h-5" />
                        )}
                        {reordering ? 'جاري الإضافة...' : 'اطلب مجددًا'}
                    </button>
                </div>
            </div>
        </div>
    );
};
