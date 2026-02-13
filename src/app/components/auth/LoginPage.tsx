import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { validateEmail } from '../../../lib/phoneUtils';
import { ArrowLeft, Eye, EyeOff, Loader2, Mail, Lock, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { signIn, isAuthenticated, isLoading, error, clearError } = useAuthStore();

    const [form, setForm] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isAuthenticated) navigate('/');
    }, [isAuthenticated]);

    useEffect(() => {
        clearError();
    }, []);

    const validate = (): boolean => {
        const e: Record<string, string> = {};
        if (!form.email.trim()) e.email = 'البريد الإلكتروني مطلوب';
        else if (!validateEmail(form.email)) e.email = 'بريد إلكتروني غير صالح';
        if (!form.password) e.password = 'كلمة المرور مطلوبة';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        const result = await signIn(form.email, form.password);

        if (result.success) {
            toast.success('تم تسجيل الدخول بنجاح! 🎉');
            navigate('/');
        } else {
            toast.error(result.error || 'فشل تسجيل الدخول');
        }
    };

    const inputClass = (field: string) =>
        `w-full px-4 py-3.5 bg-white border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium ${errors[field] ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'
        }`;

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md"
            >
                {/* Logo Header */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-white rounded-2xl shadow-lg p-1">
                            <img src="/logo.jpg" alt="Sushi & Grill" className="w-full h-full object-contain rounded-xl" />
                        </div>
                        <span className="font-black text-2xl text-slate-900">سوشي أند جريل</span>
                    </Link>
                    <h1 className="text-2xl font-black text-slate-900 mb-2">تسجيل الدخول</h1>
                    <p className="text-slate-500 text-sm">أدخل بياناتك للوصول لحسابك ومتابعة طلباتك</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Mail className="w-4 h-4 text-slate-400" />
                                البريد الإلكتروني
                            </label>
                            <input
                                type="email"
                                placeholder="example@mail.com"
                                className={`${inputClass('email')} text-left`}
                                dir="ltr"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                            {errors.email && <p className="text-xs text-red-500 font-medium">{errors.email}</p>}
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-slate-400" />
                                كلمة المرور
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="أدخل كلمة المرور"
                                    className={`${inputClass('password')} pl-12`}
                                    dir="ltr"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                            {errors.password && <p className="text-xs text-red-500 font-medium">{errors.password}</p>}
                        </div>

                        {/* Server Error */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-xl shadow-red-500/20 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    جاري تسجيل الدخول...
                                </>
                            ) : (
                                <>
                                    تسجيل الدخول
                                    <ArrowLeft className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer Links */}
                <div className="text-center mt-6 space-y-3">
                    <p className="text-slate-500 text-sm">
                        ليس لديك حساب؟{' '}
                        <Link to="/register" className="text-primary font-bold hover:underline">
                            إنشاء حساب جديد
                        </Link>
                    </p>
                    <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">
                        <UtensilsCrossed className="w-4 h-4" />
                        العودة للمنيو
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};
