import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useStore } from '../../store/useStore';
import { PhoneInput } from '../ui/PhoneInput';
import { User, Mail, MapPin, Package, LogOut, Save, Loader2, ArrowLeft, CheckCircle2, Clock, Truck, Store, UtensilsCrossed, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { insforge } from '../../../lib/insforge';
import { formatPhoneDisplay } from '../../../lib/phoneUtils';

interface OrderItemLocal {
    id: string;
    product_id: string | null;
    name_ar: string;
    quantity: number;
    unit_price: number;
    special_instructions?: string;
}

interface Order {
    id: string;
    customer_name: string;
    type: string;
    total: number;
    status: string;
    created_at: string;
    items: OrderItemLocal[];
}

export const AccountPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, signOut, updateProfile, isLoading: authLoading } = useAuthStore();
    const [activeTab, setActiveTab] = useState<'profile' | 'orders'>('profile');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [orders, setOrders] = useState<Order[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);

    const [form, setForm] = useState({
        name: user?.name || '',
        phone: user?.phone?.replace('+20', '') || '',
        address: user?.address || '',
    });

    useEffect(() => {
        if (user) {
            setForm({
                name: user.name || '',
                phone: user.phone?.replace('+20', '') || '',
                address: user.address || '',
            });
        }
    }, [user]);

    useEffect(() => {
        if (activeTab === 'orders' && user) {
            fetchOrders();
        }
    }, [activeTab, user]);

    const fetchOrders = async () => {
        if (!user) return;
        setOrdersLoading(true);
        try {
            const { data, error } = await insforge.database
                .from('orders')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (!error && data) {
                const ordersWithItems: Order[] = await Promise.all(
                    data.map(async (order: any) => {
                        const { data: items } = await insforge.database
                            .from('order_items')
                            .select('*')
                            .eq('order_id', order.id);
                        return { ...order, items: items || [] };
                    })
                );
                setOrders(ordersWithItems);
            }
        } catch {
            // silent fail
        } finally {
            setOrdersLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        const result = await updateProfile({
            name: form.name,
            phone: form.phone,
            address: form.address,
        });
        setSaving(false);

        if (result.success) {
            toast.success('تم حفظ التعديلات بنجاح');
            setIsEditing(false);
        } else {
            toast.error(result.error || 'فشل حفظ التعديلات');
        }
    };

    const handleLogout = async () => {
        await signOut();
        toast.success('تم تسجيل الخروج');
        navigate('/');
    };

    const statusLabels: Record<string, { label: string; color: string }> = {
        new: { label: 'جديد', color: 'bg-blue-100 text-blue-700' },
        preparing: { label: 'قيد التحضير', color: 'bg-amber-100 text-amber-700' },
        ready: { label: 'جاهز', color: 'bg-green-100 text-green-700' },
        out_for_delivery: { label: 'في التوصيل', color: 'bg-purple-100 text-purple-700' },
        completed: { label: 'مكتمل', color: 'bg-slate-100 text-slate-600' },
        cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-700' },
    };

    const inputClass = 'w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium';

    return (
        <div className="min-h-screen bg-slate-50" dir="rtl">
            {/* Top Bar */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link to="/" className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                            <ArrowLeft className="w-5 h-5 rotate-180" />
                        </Link>
                        <h1 className="text-xl font-black text-slate-900">حسابي</h1>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl font-bold text-sm transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        خروج
                    </button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                {/* User Card */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6 flex items-center gap-4"
                >
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
                        <User className="w-8 h-8 text-primary" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-900 truncate">{user?.name || 'مستخدم'}</h2>
                        <p className="text-sm text-slate-500 truncate">{user?.email}</p>
                        {user?.phone && (
                            <p className="text-sm text-slate-400 font-medium" dir="ltr">{formatPhoneDisplay(user.phone)}</p>
                        )}
                    </div>
                </motion.div>

                {/* Tabs */}
                <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-slate-200 shadow-sm">
                    <button
                        onClick={() => setActiveTab('profile')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'profile'
                            ? 'bg-primary text-white shadow-lg shadow-red-500/20'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <User className="w-4 h-4" />
                        الملف الشخصي
                    </button>
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'orders'
                            ? 'bg-primary text-white shadow-lg shadow-red-500/20'
                            : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <Package className="w-4 h-4" />
                        طلباتي
                    </button>
                </div>

                {/* Profile Tab */}
                {activeTab === 'profile' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-8 space-y-5"
                    >
                        {/* Name */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <User className="w-4 h-4 text-slate-400" />
                                الاسم الكامل
                            </label>
                            <input
                                type="text"
                                className={inputClass}
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                disabled={!isEditing}
                            />
                        </div>

                        {/* Email (Read Only) */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Mail className="w-4 h-4 text-slate-400" />
                                البريد الإلكتروني
                            </label>
                            <input
                                type="email"
                                className={`${inputClass} bg-slate-50 text-slate-500 text-left`}
                                dir="ltr"
                                value={user?.email || ''}
                                disabled
                            />
                        </div>

                        {/* Phone */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                رقم الهاتف
                            </label>
                            {isEditing ? (
                                <PhoneInput
                                    value={form.phone}
                                    onChange={(val: string) => setForm({ ...form, phone: val })}
                                />
                            ) : (
                                <input
                                    type="text"
                                    className={`${inputClass} bg-slate-50 text-slate-500 text-left`}
                                    dir="ltr"
                                    value={user?.phone ? formatPhoneDisplay(user.phone) : 'غير محدد'}
                                    disabled
                                />
                            )}
                        </div>

                        {/* Address */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-400" />
                                العنوان
                            </label>
                            <input
                                type="text"
                                className={inputClass}
                                placeholder="أدخل عنوانك"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                disabled={!isEditing}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-2">
                            {isEditing ? (
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="flex-1 bg-primary text-white py-3.5 rounded-xl font-bold hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                                    >
                                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                        {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            setForm({
                                                name: user?.name || '',
                                                phone: user?.phone?.replace('+20', '') || '',
                                                address: user?.address || '',
                                            });
                                        }}
                                        className="px-6 py-3.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="w-full py-3.5 rounded-xl font-bold text-primary border-2 border-primary/20 hover:bg-primary/5 transition-all"
                                >
                                    تعديل البيانات
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* Orders Tab */}
                {activeTab === 'orders' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-4"
                    >
                        {ordersLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                <p className="text-slate-500 font-medium">جاري تحميل الطلبات...</p>
                            </div>
                        ) : orders.length === 0 ? (
                            <div className="bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 p-12 text-center">
                                <div className="w-20 h-20 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                    <Package className="w-10 h-10 text-slate-400" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">لا توجد طلبات بعد</h3>
                                <p className="text-slate-500 mb-6">ابدأ بتصفح المنيو واطلب وجبتك المفضلة!</p>
                                <Link
                                    to="/"
                                    className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
                                >
                                    <UtensilsCrossed className="w-5 h-5" />
                                    تصفح المنيو
                                </Link>
                            </div>
                        ) : (
                            orders.map((order, index) => {
                                const status = statusLabels[order.status] || { label: order.status, color: 'bg-slate-100 text-slate-500' };
                                const itemPreview = order.items?.slice(0, 3).map(i => i.name_ar).join('، ') || '';
                                const extraCount = (order.items?.length || 0) - 3;
                                const isArchived = order.status === 'completed' || order.status === 'cancelled';
                                return (
                                    <motion.div
                                        key={order.id}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.06 }}
                                        onClick={() => navigate(`/account/orders/${order.id}`)}
                                        className={`rounded-2xl shadow-sm border p-5 transition-all cursor-pointer active:scale-[0.98] group ${isArchived
                                            ? 'bg-slate-50 border-slate-100 opacity-60'
                                            : 'bg-white border-slate-100 hover:shadow-lg hover:border-primary/20'
                                            }`}
                                    >
                                        {/* Header: ID + Status */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono text-sm font-bold ${isArchived ? 'text-slate-400' : 'text-slate-900'}`}>
                                                    #{order.id.slice(0, 8).toUpperCase()}
                                                </span>
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </div>
                                            <ChevronLeft className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                                        </div>

                                        {/* Item Preview */}
                                        {order.items && order.items.length > 0 && (
                                            <p className="text-sm text-slate-500 mb-3 line-clamp-1">
                                                {itemPreview}
                                                {extraCount > 0 && (
                                                    <span className="text-slate-400"> و {extraCount} أصناف أخرى</span>
                                                )}
                                            </p>
                                        )}

                                        {/* Footer: Type + Date + Total */}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                                                    {order.type === 'delivery' ? (
                                                        <><Truck className="w-3.5 h-3.5" /> توصيل</>
                                                    ) : (
                                                        <><Store className="w-3.5 h-3.5" /> استلام</>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-slate-400 text-xs">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(order.created_at).toLocaleDateString('ar-EG', {
                                                        day: 'numeric',
                                                        month: 'short',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </div>
                                            </div>
                                            <span className="font-black text-slate-900">
                                                {order.total} <span className="text-sm font-bold text-slate-400">ج.م</span>
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
};
