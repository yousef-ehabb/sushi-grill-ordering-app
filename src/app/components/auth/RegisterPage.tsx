import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { PhoneInput } from '../ui/PhoneInput';
import { validateEmail } from '../../../lib/phoneUtils';
import { ArrowLeft, Eye, EyeOff, Loader2, User, Mail, Lock, MapPin, UtensilsCrossed, ShieldCheck, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

type Step = 'register' | 'verify';

export const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { signUp, verifyEmail, resendVerification, isAuthenticated, isLoading, error, clearError } = useAuthStore();

    const [step, setStep] = useState<Step>('register');
    const [registeredEmail, setRegisteredEmail] = useState('');

    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        address: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // OTP state
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [resendCooldown, setResendCooldown] = useState(0);

    useEffect(() => {
        if (isAuthenticated) navigate('/');
    }, [isAuthenticated]);

    useEffect(() => {
        clearError();
    }, []);

    // Auto-focus first OTP input
    useEffect(() => {
        if (step === 'verify') {
            setTimeout(() => otpRefs.current[0]?.focus(), 150);
        }
    }, [step]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    const validate = (): boolean => {
        const e: Record<string, string> = {};
        if (!form.name.trim()) e.name = 'الاسم مطلوب';
        if (!form.email.trim()) e.email = 'البريد الإلكتروني مطلوب';
        else if (!validateEmail(form.email)) e.email = 'بريد إلكتروني غير صالح';
        if (!form.phone) e.phone = 'رقم الهاتف مطلوب';
        if (!form.password) e.password = 'كلمة المرور مطلوبة';
        else if (form.password.length < 6) e.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
        if (form.password !== form.confirmPassword) e.confirmPassword = 'كلمة المرور غير متطابقة';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        const result = await signUp({
            name: form.name,
            email: form.email,
            phone: form.phone,
            password: form.password,
            address: form.address,
        });

        if (result.verificationRequired && result.email) {
            setRegisteredEmail(result.email);
            setStep('verify');
            setResendCooldown(60);
            toast.success('تم إرسال رمز التحقق إلى بريدك الإلكتروني 📧');
        } else if (result.success) {
            toast.success('تم إنشاء حسابك بنجاح! 🎉');
            navigate('/');
        } else {
            toast.error(result.error || 'فشل إنشاء الحساب');
        }
    };

    // ── OTP Handlers ──
    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newOtp = ['', '', '', '', '', ''];
        paste.split('').forEach((char, i) => { newOtp[i] = char; });
        setOtp(newOtp);
        otpRefs.current[Math.min(paste.length, 5)]?.focus();
    };

    const handleVerify = async () => {
        const code = otp.join('');
        if (code.length !== 6) {
            toast.error('أدخل رمز التحقق المكون من 6 أرقام');
            return;
        }

        clearError();
        const result = await verifyEmail(registeredEmail, code);

        if (result.success) {
            toast.success('تم تأكيد حسابك بنجاح! مرحباً بك 🎉');
            navigate('/');
        } else {
            toast.error(result.error || 'رمز التحقق غير صحيح');
            setOtp(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        const result = await resendVerification(registeredEmail);
        if (result.success) {
            toast.success('تم إعادة إرسال رمز التحقق 📧');
            setResendCooldown(60);
        } else {
            toast.error(result.error || 'فشل إعادة الإرسال');
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
                    <h1 className="text-2xl font-black text-slate-900 mb-2">
                        {step === 'register' ? 'إنشاء حساب جديد' : 'تأكيد البريد الإلكتروني'}
                    </h1>
                    <p className="text-slate-500 text-sm">
                        {step === 'register'
                            ? 'سجّل حسابك لتجربة طلب أسرع ومتابعة طلباتك'
                            : `تم إرسال رمز مكون من 6 أرقام إلى`}
                    </p>
                    {step === 'verify' && (
                        <p className="text-primary font-bold text-sm mt-1" dir="ltr">{registeredEmail}</p>
                    )}
                </div>

                <AnimatePresence mode="wait">
                    {step === 'register' ? (
                        <motion.div
                            key="register-step"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.25 }}
                        >
                            {/* Registration Form Card */}
                            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-8">
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    {/* Name */}
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <User className="w-4 h-4 text-slate-400" />
                                            الاسم الكامل
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="أحمد محمد"
                                            className={inputClass('name')}
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        />
                                        {errors.name && <p className="text-xs text-red-500 font-medium">{errors.name}</p>}
                                    </div>

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

                                    {/* Phone */}
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                            رقم الهاتف
                                        </label>
                                        <PhoneInput
                                            value={form.phone}
                                            onChange={(val: string) => setForm({ ...form, phone: val })}
                                            error={errors.phone}
                                            required
                                        />
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
                                                placeholder="6 أحرف على الأقل"
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

                                    {/* Confirm Password */}
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <Lock className="w-4 h-4 text-slate-400" />
                                            تأكيد كلمة المرور
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showConfirm ? 'text' : 'password'}
                                                placeholder="أعد كتابة كلمة المرور"
                                                className={`${inputClass('confirmPassword')} pl-12`}
                                                dir="ltr"
                                                value={form.confirmPassword}
                                                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirm(!showConfirm)}
                                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        {errors.confirmPassword && <p className="text-xs text-red-500 font-medium">{errors.confirmPassword}</p>}
                                    </div>

                                    {/* Address (Optional) */}
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-slate-400" />
                                            العنوان
                                            <span className="text-slate-400 font-normal text-xs">(اختياري)</span>
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="المنطقة، الشارع، رقم العمارة"
                                            className={inputClass('address')}
                                            value={form.address}
                                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                                        />
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
                                                جاري التسجيل...
                                            </>
                                        ) : (
                                            <>
                                                إنشاء الحساب
                                                <ArrowLeft className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="verify-step"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                        >
                            {/* OTP Verification Card */}
                            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 md:p-8">
                                <div className="text-center mb-6">
                                    <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <ShieldCheck className="w-8 h-8 text-green-600" />
                                    </div>
                                    <p className="text-slate-600 text-sm font-medium">أدخل الرمز المكون من 6 أرقام المُرسل إلى بريدك</p>
                                </div>

                                {/* OTP Input */}
                                <div className="flex justify-center gap-2.5 mb-6" dir="ltr">
                                    {otp.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={(el) => { otpRefs.current[i] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                            onPaste={i === 0 ? handleOtpPaste : undefined}
                                            className={`w-12 h-14 text-center text-xl font-black border-2 rounded-xl outline-none transition-all
                                                ${digit ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200'}
                                                focus:ring-2 focus:ring-primary/20 focus:border-primary`}
                                        />
                                    ))}
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium mb-4 text-center">
                                        {error}
                                    </div>
                                )}

                                {/* Verify Button */}
                                <button
                                    onClick={handleVerify}
                                    disabled={isLoading || otp.join('').length !== 6}
                                    className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-xl shadow-red-500/20 disabled:shadow-none flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            جاري التحقق...
                                        </>
                                    ) : (
                                        <>
                                            تأكيد الحساب
                                            <ShieldCheck className="w-5 h-5" />
                                        </>
                                    )}
                                </button>

                                {/* Resend */}
                                <div className="text-center mt-5">
                                    {resendCooldown > 0 ? (
                                        <p className="text-slate-400 text-sm">
                                            إعادة الإرسال بعد{' '}
                                            <span className="font-bold text-primary tabular-nums">{resendCooldown}</span>{' '}
                                            ثانية
                                        </p>
                                    ) : (
                                        <button
                                            onClick={handleResend}
                                            className="text-primary font-bold text-sm hover:underline inline-flex items-center gap-1.5 transition-colors"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            إعادة إرسال الرمز
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer Links */}
                <div className="text-center mt-6 space-y-3">
                    {step === 'register' ? (
                        <>
                            <p className="text-slate-500 text-sm">
                                لديك حساب بالفعل؟{' '}
                                <Link to="/login" className="text-primary font-bold hover:underline">
                                    تسجيل الدخول
                                </Link>
                            </p>
                            <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">
                                <UtensilsCrossed className="w-4 h-4" />
                                العودة للمنيو
                            </Link>
                        </>
                    ) : (
                        <button
                            onClick={() => { setStep('register'); setOtp(['', '', '', '', '', '']); clearError(); }}
                            className="text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors inline-flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4 rotate-180" />
                            العودة للتسجيل
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
