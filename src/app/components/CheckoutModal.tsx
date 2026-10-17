import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, CheckCircle2, Truck, Store, MapPin, Phone, User, Loader2, ArrowLeft, UserCheck, AlertTriangle, Printer, Copy, Check, Clock, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import { isProductAvailableInBranch, isOptionAvailableInBranch, isBranchOpen, getBranchClosedMessage, isBranchAutoCloseEnabled } from '../utils/branchAvailability';
import { isInOffHours } from '../utils/operatingHours';
import { restaurantConfig } from '../../config/restaurant';
import type { OrderReceiptData } from './OrderConfirmationModal';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess?: (receipt: OrderReceiptData) => void;
  onOpenTracking?: (orderId: string, phone: string) => void;
}

const EGYPTIAN_PHONE_REGEX = /^01[0125][0-9]{8}$/;

const sanitizeEgyptianPhone = (value: string): string => {
  // Convert Eastern Arabic numerals (٠-٩) to standard English digits (0-9)
  let cleaned = value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  // Remove spaces, dashes, parentheses, plus
  cleaned = cleaned.replace(/[\s\-\(\)\+]/g, '');
  // Normalize pasted Egyptian numbers with international prefix
  if (cleaned.startsWith('00201')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('201') && cleaned.length > 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  // Strip out any non-numeric characters
  cleaned = cleaned.replace(/\D/g, '');
  // Strictly enforce maximum 11 digits
  return cleaned.slice(0, 11);
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose, onOrderSuccess, onOpenTracking }) => {
  const {
    cart,
    products,
    allOptionGroups,
    globalSettings,
    orderType,
    setOrderType,
    clearCart,
    submitOrder,
    loading,
    removeUnavailableOptionsFromCart,
    selectedBranch: storeBranch,
    setSelectedBranch: setStoreBranch,
  } = useStore();
  const { user, isAuthenticated } = useAuthStore();
  const [step, setStep] = useState(1);
  const [selectedBranch, setSelectedBranch] = useState<'فرع الاستاد' | 'فرع الكرفان' | ''>(
    () => (storeBranch === 'فرع الاستاد' || storeBranch === 'فرع الكرفان' ? storeBranch : '')
  );

  const handleSelectBranch = (branch: 'فرع الاستاد' | 'فرع الكرفان') => {
    setSelectedBranch(branch);
    setStoreBranch(branch);
  };
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const lastSubmitTimeRef = useRef(0);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<number | null>(null);
  const [receiptData, setReceiptData] = useState<OrderReceiptData | null>(null);
  const [copiedReceiptNum, setCopiedReceiptNum] = useState(false);

  const isValidPhone = EGYPTIAN_PHONE_REGEX.test(formData.phone);
  const isPhoneTouchedOrFilled = formData.phone.length > 0;
  const isPhoneInvalid = isPhoneTouchedOrFilled && !isValidPhone;

  const inOffHours = isInOffHours();
  const isBranchValid = selectedBranch === 'فرع الاستاد' || selectedBranch === 'فرع الكرفان';
  const isNameValid = formData.name.trim().length > 0;
  const isAddressValid = orderType === 'delivery' ? formData.address.trim().length > 0 : true;
  const isFormValid = isNameValid && isValidPhone && isAddressValid && isBranchValid;

  const isWebsiteClosed = globalSettings && !globalSettings.is_website_open;

  // Branch status check (includes off-hours auto-close via isBranchOpen)
  const isSelectedBranchOpen = selectedBranch ? isBranchOpen(globalSettings, selectedBranch) : true;
  const branchClosedMessage = selectedBranch
    ? getBranchClosedMessage(globalSettings, selectedBranch) || `${selectedBranch} مغلق حالياً.`
    : '';

  // Branch items availability check
  const unavailableInSelectedBranch = useMemo(() => {
    if (!selectedBranch) return [];
    return cart.filter((item) => {
      const p = products.find((prod) => prod.id === item.id);
      if (!p) return !item.is_available;
      return !isProductAvailableInBranch(p, selectedBranch);
    });
  }, [cart, products, selectedBranch]);

  const hasBranchUnavailableItems = unavailableInSelectedBranch.length > 0;
  const unavailableItemNames = unavailableInSelectedBranch.map((i) => i.name_ar).join('، ');

  const unavailableCartItems = cart.filter(item => {
    const p = products.find(prod => prod.id === item.id);
    return (p && !p.is_available) || !item.is_available;
  });
  const hasUnavailableItems = unavailableCartItems.length > 0;

  // Options & sauces availability check in selected branch & globally
  const unavailableCartOptions = useMemo(() => {
    const allOptions = [
      ...(allOptionGroups || []).flatMap((g) => g.options || []),
      ...Object.values(useStore.getState().optionGroupsByProductId || {}).flatMap((groups) => groups.flatMap((g) => g.options || [])),
    ];
    const foundUnavailable: { itemName: string; optionName: string }[] = [];

    for (const item of cart) {
      if (item.selectedOptionIds && item.selectedOptionIds.length > 0) {
        for (const optId of item.selectedOptionIds) {
          const opt = allOptions.find((o) => o.id === optId);
          if (opt) {
            if (!isOptionAvailableInBranch(opt, selectedBranch)) {
              foundUnavailable.push({
                itemName: item.name_ar,
                optionName: opt.name_ar,
              });
            }
          }
        }
      }
    }
    return foundUnavailable;
  }, [cart, allOptionGroups, selectedBranch]);

  const hasUnavailableOptions = unavailableCartOptions.length > 0;

  // isSubmitDisabled includes off-hours via isSelectedBranchOpen (which calls isBranchOpen which checks isInOffHours)
  const isSubmitDisabled = loading || isSubmitting || !orderType || !isBranchValid || !isSelectedBranchOpen || hasBranchUnavailableItems || hasUnavailableOptions || !!isWebsiteClosed || hasUnavailableItems || cart.length === 0 || !isFormValid;

  // Auto-close if cart becomes empty in real-time (e.g. item removed)
  useEffect(() => {
    if (isOpen && cart.length === 0 && step === 1) {
      onClose();
    }
  }, [isOpen, cart.length, step, onClose]);

  // Auto-fill from user profile when modal opens
  useEffect(() => {
    if (isOpen && isAuthenticated && user) {
      setFormData((prev) => ({
        name: prev.name || user.name || '',
        phone: prev.phone ? sanitizeEgyptianPhone(prev.phone) : (user.phone ? sanitizeEgyptianPhone(user.phone) : ''),
        address: prev.address || user.address || '',
      }));
    }
  }, [isOpen, isAuthenticated, user]);

  // Reset form and manage idempotency session
  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(`idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
      isSubmittingRef.current = false;
      lastSubmitTimeRef.current = 0;
    } else {
      setStep(1);
      setFormData({ name: '', phone: '', address: '' });
      setSelectedBranch('');
      setIdempotencyKey('');
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      lastSubmitTimeRef.current = 0;
      setCreatedOrderId(null);
      setCreatedOrderNumber(null);
      setReceiptData(null);
      setCopiedReceiptNum(false);
    }
  }, [isOpen]);

  const subtotal = cart.reduce((sum, item) => {
    const itemTotal = (item.price + (item.optionsPrice || 0)) * item.quantity;
    return sum + itemTotal;
  }, 0);

  const deliveryFee = orderType === 'delivery'
    ? (restaurantConfig.ordering.defaultDeliveryFee ?? 25)
    : 0;

  const total = subtotal + deliveryFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 0ms Synchronous Double-Click / Concurrency Guard
    const now = Date.now();
    if (isSubmittingRef.current || isSubmitting || loading) {
      console.warn('[CheckoutModal] Double-click prevented by synchronous lock');
      return;
    }
    if (now - lastSubmitTimeRef.current < 4000) {
      console.warn('[CheckoutModal] Double-click prevented by 4s debounce lock');
      return;
    }

    if (isSubmitDisabled || !isValidPhone || !isBranchValid || !isSelectedBranchOpen || hasBranchUnavailableItems || hasUnavailableOptions) {
      if (!isBranchValid) {
        toast.error('يرجى اختيار الفرع (فرع الاستاد أو فرع الكرفان)');
        return;
      }
      if (!isSelectedBranchOpen) {
        const isAutoCloseActive = isBranchAutoCloseEnabled(globalSettings, selectedBranch);
        if (inOffHours && isAutoCloseActive) {
          toast.error('❌ المطعم خارج ساعات العمل — نستقبل طلباتكم اعتباراً من 12:00 ظهراً', { duration: 5000 });
        } else {
          toast.error(`${selectedBranch} مغلق حالياً — في انتظار الفتح اليدوي من الإدارة`);
        }
        return;
      }
      if (hasBranchUnavailableItems) {
        toast.error(`الصنف "${unavailableItemNames}" غير متاح حالياً في ${selectedBranch}`);
        return;
      }
      if (hasUnavailableOptions) {
        const sauceNames = Array.from(new Set(unavailableCartOptions.map(o => o.optionName))).join('، ');
        toast.error(`⚠️ عفواً، الإضافات التالية غير متوفرة في ${selectedBranch}: (${sauceNames})`);
        return;
      }
      if (!isValidPhone) {
        toast.error('يرجى إدخال رقم هاتف صحيح مكون من 11 رقم يبدأ بـ 01');
        return;
      }
      return;
    }

    // Immediately lock synchronously BEFORE any async action or state queue
    isSubmittingRef.current = true;
    lastSubmitTimeRef.current = now;
    setIsSubmitting(true);

    try {
      const activeKey = idempotencyKey || `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const cartSnapshot = [...cart];
      const result = await submitOrder({
        customer_name: formData.name,
        customer_phone: formData.phone,
        address: orderType === 'delivery' ? formData.address : undefined,
        user_id: isAuthenticated && user ? user.id : undefined,
        type: orderType || 'pickup',
        branch: selectedBranch,
        items: cartSnapshot,
        total,
        idempotency_key: activeKey,
      });

      if (result) {
        const receipt: OrderReceiptData = {
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          customerName: formData.name,
          customerPhone: formData.phone,
          address: orderType === 'delivery' ? formData.address : undefined,
          type: orderType || 'pickup',
          branch: selectedBranch,
          items: cartSnapshot,
          subtotal,
          deliveryFee,
          total,
          createdAt: new Date().toISOString(),
        };

        // Persist last order details for convenience and instant tracking
        try {
          localStorage.setItem('pochinki_last_order', JSON.stringify({
            orderId: result.orderId,
            orderNumber: result.orderNumber,
            phone: formData.phone,
            name: formData.name,
            timestamp: Date.now(),
          }));
        } catch (e) {
          console.warn('Failed to save last order in localStorage:', e);
        }

        clearCart();

        if (onOrderSuccess) {
          onClose();
          onOrderSuccess(receipt);
        } else {
          setCreatedOrderId(result.orderId);
          setCreatedOrderNumber(result.orderNumber);
          setReceiptData(receipt);
          setStep(2);
          toast.success('تم استلام طلبك بنجاح!', {
            description: `رقم طلبك: #${result.orderNumber}`,
          });
        }
      } else {
        // Show server-side validation error
        const errorMessage = useStore.getState().error;
        toast.error('لم يتم إرسال الطلب', {
          description: errorMessage || 'يرجى المحاولة مرة أخرى.',
          duration: 6000,
        });
        // If cart became empty because unavailable items were removed, close checkout modal
        if (useStore.getState().cart.length === 0) {
          onClose();
        }
      }
    } catch (err: any) {
      console.error('[CheckoutModal] Unexpected error in handleSubmit:', err);
      toast.error('حدث خطأ أثناء معالجة الطلب', {
        description: err?.message || 'يرجى المحاولة مرة أخرى.',
      });
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl relative z-10 max-h-[85vh] max-h-[85dvh] sm:max-h-[90vh] sm:max-h-[90dvh] flex flex-col"
          >
            {step === 1 ? (
              <div className="flex flex-col flex-1 min-h-0 bg-slate-50 overflow-hidden">
                {/* Header - Fixed & Compact */}
                <div className="bg-white px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 z-10">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900">إتمام الطلب</h2>
                    <span className="text-xs bg-red-50 text-primary font-bold px-2.5 py-0.5 rounded-full border border-red-100">
                      {cart.reduce((sum, item) => sum + item.quantity, 0)} أصناف
                    </span>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                    aria-label="إغلاق"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>

                {/* Body - Independently Scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 md:p-8 scrollbar-thin">
                  <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                    {/* Order Type Selection */}
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <button
                        type="button"
                        onClick={() => setOrderType('pickup')}
                        className={`relative overflow-hidden p-3 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 transition-all duration-200 cursor-pointer ${orderType === 'pickup'
                          ? 'bg-white ring-2 ring-primary shadow-md shadow-red-100'
                          : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <div className={`p-2.5 sm:p-3 rounded-full ${orderType === 'pickup' ? 'bg-red-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                          <Store className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <span className={`font-bold text-xs sm:text-sm ${orderType === 'pickup' ? 'text-primary' : 'text-slate-600'}`}>استلام من المطعم</span>
                        {orderType === 'pickup' && (
                          <motion.div layoutId="check-order-type" className="absolute top-2.5 right-2.5 text-primary">
                            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 fill-red-50" />
                          </motion.div>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderType('delivery')}
                        className={`relative overflow-hidden p-3 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 transition-all duration-200 cursor-pointer ${orderType === 'delivery'
                          ? 'bg-white ring-2 ring-primary shadow-md shadow-red-100'
                          : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <div className={`p-2.5 sm:p-3 rounded-full ${orderType === 'delivery' ? 'bg-red-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                          <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <span className={`font-bold text-xs sm:text-sm ${orderType === 'delivery' ? 'text-primary' : 'text-slate-600'}`}>توصيل للمنزل</span>
                        {orderType === 'delivery' && (
                          <motion.div layoutId="check-order-type" className="absolute top-2.5 right-2.5 text-primary">
                            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 fill-red-50" />
                          </motion.div>
                        )}
                      </button>
                    </div>

                    {/* Branch Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                          اختر الفرع
                        </label>
                        {!isBranchValid && (
                          <span className="text-[11px] text-red-500 font-medium">مطلوب</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <button
                          type="button"
                          onClick={() => handleSelectBranch('فرع الاستاد')}
                          className={`relative overflow-hidden p-3 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 transition-all duration-200 cursor-pointer ${selectedBranch === 'فرع الاستاد'
                            ? 'bg-white ring-2 ring-primary shadow-md shadow-red-100'
                            : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                          <div className={`p-2.5 sm:p-3 rounded-full ${selectedBranch === 'فرع الاستاد' ? 'bg-red-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                            <Store className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <span className={`font-bold text-xs sm:text-sm ${selectedBranch === 'فرع الاستاد' ? 'text-primary' : 'text-slate-600'}`}>فرع الاستاد</span>
                          {selectedBranch === 'فرع الاستاد' && (
                            <motion.div layoutId="check-branch" className="absolute top-2.5 right-2.5 text-primary">
                              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 fill-red-50" />
                            </motion.div>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSelectBranch('فرع الكرفان')}
                          className={`relative overflow-hidden p-3 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col items-center gap-2 sm:gap-3 transition-all duration-200 cursor-pointer ${selectedBranch === 'فرع الكرفان'
                            ? 'bg-white ring-2 ring-primary shadow-md shadow-red-100'
                            : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                          <div className={`p-2.5 sm:p-3 rounded-full ${selectedBranch === 'فرع الكرفان' ? 'bg-red-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                            <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <span className={`font-bold text-xs sm:text-sm ${selectedBranch === 'فرع الكرفان' ? 'text-primary' : 'text-slate-600'}`}>فرع الكرفان</span>
                          {selectedBranch === 'فرع الكرفان' && (
                            <motion.div layoutId="check-branch" className="absolute top-2.5 right-2.5 text-primary">
                              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 fill-red-50" />
                            </motion.div>
                          )}
                        </button>
                      </div>

                      {/* Branch Closed Warning */}
                      {selectedBranch && !isSelectedBranchOpen && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shadow-xs animate-in fade-in duration-200">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="font-bold text-amber-900">{selectedBranch} مغلق حالياً</p>
                            <p className="text-amber-700 leading-relaxed">{branchClosedMessage}</p>
                          </div>
                        </div>
                      )}

                      {/* Branch Unavailable Items Warning */}
                      {selectedBranch && isSelectedBranchOpen && hasBranchUnavailableItems && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs shadow-xs animate-in fade-in duration-200">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <p className="font-bold text-red-900">أصناف غير متوفرة في {selectedBranch}</p>
                            <p className="text-red-700 leading-relaxed">
                              عذراً، الصنف <span className="font-black text-red-900 underline underline-offset-2">{unavailableItemNames}</span> غير متاح حالياً في <span className="font-black text-red-900">{selectedBranch}</span>. يرجى اختيار الفرع الآخر أو تعديل السلة.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Branch Unavailable Sauces / Upgrades Interactive Resolution Prompt */}
                      {selectedBranch && isSelectedBranchOpen && hasUnavailableOptions && (
                        <div className="p-4 rounded-2xl bg-amber-50/95 border-2 border-amber-300 text-amber-950 shadow-md animate-in fade-in duration-200 space-y-3">
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="font-black text-xs sm:text-sm text-amber-950 leading-relaxed">
                                ⚠️ تنبيه: ({Array.from(new Set(unavailableCartOptions.map(o => o.optionName))).join('، ')}) المضاف على الساندوتش غير متاح حالياً في {selectedBranch}. كيف تود المتابعة؟
                              </p>
                            </div>
                          </div>

                          {/* 3 Interactive Action Buttons */}
                          <div className="space-y-2 pt-1">
                            {/* Option 1: Remove sauce & discount price */}
                            <button
                              type="button"
                              onClick={() => {
                                removeUnavailableOptionsFromCart(selectedBranch);
                                toast.success('تمت إزالة الصوص غير المتاح وخصم سعره بنجاح، يمكنك الآن تأكيد الطلب فوراً');
                              }}
                              className="w-full py-2.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-black transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>إكمال الطلب بدون الصوص (خصم سعر الصوص)</span>
                            </button>

                            {/* Option 2: Switch branch / Edit order */}
                            <button
                              type="button"
                              onClick={() => {
                                const otherBranch = selectedBranch === 'فرع الكرفان' ? 'فرع الاستاد' : 'فرع الكرفان';
                                if (isBranchOpen(globalSettings, otherBranch)) {
                                  handleSelectBranch(otherBranch);
                                  toast.success(`تم تغيير الفرع إلى ${otherBranch}`);
                                } else {
                                  onClose();
                                  toast.info('تم فتح السلة لتعديل الساندوتش والإضافات');
                                }
                              }}
                              className="w-full py-2.5 px-3.5 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs sm:text-sm font-black transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Store className="w-4 h-4 shrink-0" />
                              <span>
                                تعديل الطلب / تغيير الفرع {isBranchOpen(globalSettings, selectedBranch === 'فرع الكرفان' ? 'فرع الاستاد' : 'فرع الكرفان') ? `(التحويل إلى ${selectedBranch === 'فرع الكرفان' ? 'فرع الاستاد' : 'فرع الكرفان'})` : ''}
                              </span>
                            </button>

                            {/* Option 3: Cancel checkout */}
                            <button
                              type="button"
                              onClick={onClose}
                              className="w-full py-2 px-3.5 bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-700 rounded-xl text-xs sm:text-sm font-bold transition-all border border-slate-300 flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <X className="w-4 h-4 shrink-0" />
                              <span>إلغاء الطلب</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Customer Details */}
                    {isAuthenticated && user && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
                        <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium text-emerald-700">
                          مسجّل كـ <span className="font-bold">{user.name}</span> — تم ملء بياناتك تلقائياً
                        </span>
                      </div>
                    )}

                    <div className="space-y-3 sm:space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                          الاسم الكامل
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="الاسم ثلاثي"
                          className="w-full px-3.5 py-3 sm:px-4 sm:py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium text-sm"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                            رقم الهاتف
                          </label>
                          {formData.phone.length > 0 && (
                            <span className={clsx(
                              "text-[11px] font-mono",
                              isValidPhone ? "text-emerald-600 font-bold" : "text-slate-400"
                            )}>
                              {formData.phone.length}/11
                            </span>
                          )}
                        </div>
                        <input
                          required
                          type="tel"
                          inputMode="numeric"
                          maxLength={11}
                          placeholder="01xxxxxxxxx"
                          className={clsx(
                            "w-full px-3.5 py-3 sm:px-4 sm:py-3.5 bg-white border rounded-xl outline-none transition-all placeholder:text-slate-300 font-medium text-sm text-left tracking-wider font-mono",
                            isPhoneInvalid
                              ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                              : isValidPhone
                              ? "border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                              : "border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          )}
                          dir="ltr"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: sanitizeEgyptianPhone(e.target.value) })}
                        />
                        {isPhoneInvalid && (
                          <p className="text-xs text-red-500 font-medium pt-0.5">
                            يرجى إدخال رقم هاتف صحيح مكون من 11 رقم يبدأ بـ 01
                          </p>
                        )}
                      </div>

                      <AnimatePresence>
                        {orderType === 'delivery' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-1 overflow-hidden"
                          >
                            <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                              العنوان بالتفصيل
                            </label>
                            <textarea
                              required
                              rows={2}
                              placeholder="المنطقة، الشارع، رقم العمارة، الشقة..."
                              className="w-full px-3.5 py-3 sm:px-4 sm:py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium text-sm resize-none"
                              value={formData.address}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </form>
                </div>

                {/* Footer - Pinned with Safe Area Support */}
                <div
                  className="p-4 sm:p-5 md:p-6 bg-white border-t border-slate-100 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
                >
                  {/* Live Warnings */}
                  {hasUnavailableItems && (
                    <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span>عذراً، يوجد أصناف غير متاحة حالياً ({unavailableCartItems.map(i => i.name_ar).join('، ')}).</span>
                    </div>
                  )}

                  {hasUnavailableOptions && (
                    <div className="mb-3 p-3.5 bg-amber-50/95 border-2 border-amber-300 rounded-2xl text-amber-950 text-xs font-medium space-y-2.5 shadow-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="font-bold leading-relaxed">
                          ⚠️ تنبيه: ({Array.from(new Set(unavailableCartOptions.map(o => o.optionName))).join('، ')}) المضاف على الساندوتش غير متاح حالياً في {selectedBranch || 'الفرع المختار'}. كيف تود المتابعة؟
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 pt-0.5">
                        {selectedBranch && (
                          <button
                            type="button"
                            onClick={() => {
                              removeUnavailableOptionsFromCart(selectedBranch);
                              toast.success('تمت إزالة الصوص غير المتاح وخصم سعره بنجاح، يمكنك الآن تأكيد الطلب فوراً');
                            }}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>إكمال الطلب بدون الصوص (خصم سعر الصوص)</span>
                          </button>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const otherBranch = selectedBranch === 'فرع الكرفان' ? 'فرع الاستاد' : 'فرع الكرفان';
                              if (isBranchOpen(globalSettings, otherBranch)) {
                                handleSelectBranch(otherBranch);
                                toast.success(`تم تغيير الفرع إلى ${otherBranch}`);
                              } else {
                                onClose();
                                toast.info('تم فتح السلة لتعديل الساندوتش والإضافات');
                              }
                            }}
                            className="py-1.5 px-2 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Store className="w-3.5 h-3.5" />
                            <span>تعديل الطلب / تغيير الفرع</span>
                          </button>
                          <button
                            type="button"
                            onClick={onClose}
                            className="py-1.5 px-2 bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-700 border border-slate-300 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>إلغاء الطلب</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isWebsiteClosed && (
                    <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span>المطعم مغلق حالياً ولا يستقبل طلبات جديدة.</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center mb-3 sm:mb-4 text-xs sm:text-sm">
                    <span className="text-slate-500 font-medium">الإجمالي المطلوب</span>
                    <span className="text-xl sm:text-2xl font-black text-slate-900">
                      {total} <span className="text-xs sm:text-base font-bold text-slate-400">ج.م</span>
                    </span>
                  </div>
                  <button
                    form="checkout-form"
                    type="submit"
                    disabled={isSubmitDisabled}
                    onClick={(e) => {
                      if (isSubmittingRef.current || isSubmitting || loading) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className={clsx(
                      "w-full py-3.5 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                      isSubmitDisabled
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none pointer-events-none"
                        : "bg-primary text-white hover:bg-red-700 shadow-xl shadow-red-500/20 cursor-pointer"
                    )}
                  >
                    {loading || isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>جاري التحقق والإرسال...</span>
                      </>
                    ) : (
                      <>
                        <span>تأكيد الطلب</span>
                        <ArrowLeft className="w-5 h-5" />
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] sm:text-xs text-slate-400 mt-2 sm:mt-2.5 font-medium">
                    الدفع عند الاستلام (كاش)
                  </p>
                </div>
              </div>
            ) : (
              // Step 2: Digital Receipt View
              <div
                className="p-4 sm:p-6 flex flex-col flex-1 min-h-0 overflow-y-auto"
                style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 2rem))' }}
              >
                {/* Printable Digital Receipt Card */}
                <div id="digital-receipt-printable" className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-4 sm:p-6 space-y-4 sm:space-y-5 text-slate-800 shadow-sm print:bg-white print:border-none print:p-0">
                  
                  {/* Brand & Receipt Header */}
                  <div className="flex flex-col items-center text-center pb-3 sm:pb-4 border-b border-slate-200">
                    <img
                      src={restaurantConfig.brand.logoUrl}
                      alt={restaurantConfig.brand.nameAr}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-2xl mb-2 drop-shadow-sm"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                      {restaurantConfig.brand.nameAr}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                      {restaurantConfig.brand.taglineAr} — إيصال طلب إلكتروني
                    </p>
                  </div>

                  {/* Prominent Order Number Card */}
                  <div className="bg-white border-2 border-primary/20 rounded-2xl p-3.5 sm:p-4 text-center shadow-xs">
                    <span className="text-xs font-bold text-slate-400 block mb-1">
                      رقم طلبك
                    </span>
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <span className="text-2xl sm:text-4xl font-mono font-black text-primary tracking-wider">
                        #{receiptData?.orderNumber || (receiptData?.orderId ? receiptData.orderId.slice(0, 8).toUpperCase() : '1001')}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const num = receiptData?.orderNumber ? String(receiptData.orderNumber) : (receiptData?.orderId || '');
                          navigator.clipboard?.writeText(num);
                          setCopiedReceiptNum(true);
                          toast.success('تم نسخ رقم الطلب');
                          setTimeout(() => setCopiedReceiptNum(false), 2000);
                        }}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex items-center justify-center print:hidden cursor-pointer"
                        title="نسخ رقم الطلب"
                      >
                        {copiedReceiptNum ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تم استلام وتأكيد الطلب بنجاح</span>
                    </div>
                  </div>

                  {/* Order & Customer Metadata */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 font-bold block">تاريخ وتوقيت الطلب</span>
                      <span className="font-semibold text-slate-700">
                        {receiptData?.createdAt
                          ? new Date(receiptData.createdAt).toLocaleDateString('ar-EG', {
                              day: 'numeric',
                              month: 'short',
                            }) + ' ' + new Date(receiptData.createdAt).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'الآن'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block">نوع الاستلام</span>
                      <span className="font-semibold text-slate-700">
                        {receiptData?.type === 'delivery' ? 'توصيل للمنزل' : 'استلام من المطعم'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block">العميل</span>
                      <span className="font-semibold text-slate-700">
                        {receiptData?.customerName}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block">الهاتف</span>
                      <span className="font-semibold text-slate-700 font-mono">
                        {receiptData?.customerPhone}
                      </span>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-slate-400 font-bold">الفرع:</span>
                      <span className="font-semibold text-slate-700">{receiptData?.branch || 'فرع الاستاد'}</span>
                    </div>
                    {receiptData?.type === 'delivery' && receiptData?.address && (
                      <div className="col-span-2 pt-1 border-t border-slate-100">
                        <span className="text-slate-400 font-bold block">عنوان التوصيل:</span>
                        <span className="font-semibold text-slate-700">{receiptData.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-500 block">الأصناف المطلوبة</span>
                    <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-100 overflow-hidden">
                      {receiptData?.items?.map((item: any, idx: number) => {
                        const itemPrice = (item.price ?? item.unit_price ?? 0) + (item.optionsPrice ?? 0);
                        const itemTotal = itemPrice * item.quantity;
                        return (
                          <div key={item.id || idx} className="p-2.5 sm:p-3 flex items-start justify-between gap-3 text-xs">
                            <div className="flex-1">
                              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-md bg-red-50 text-primary flex items-center justify-center font-mono font-black text-[11px]">
                                  {item.quantity}×
                                </span>
                                <span>{item.name_ar}</span>
                              </div>
                              {item.specialInstructions && (
                                <p className="text-[11px] text-slate-400 italic mr-6 mt-0.5">
                                  — {item.specialInstructions}
                                </p>
                              )}
                            </div>
                            <span className="font-bold text-slate-900 font-mono shrink-0">
                              {itemTotal} ج.م
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-500 font-medium">
                      <span>المجموع الفرعي</span>
                      <span className="font-mono">{receiptData?.subtotal || 0} ج.م</span>
                    </div>
                    {typeof receiptData?.deliveryFee === 'number' && receiptData.deliveryFee > 0 && (
                      <div className="flex justify-between text-slate-500 font-medium">
                        <span>رسوم التوصيل</span>
                        <span className="font-mono">{receiptData.deliveryFee} ج.م</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-sm font-black">
                      <span className="text-slate-900">المبلغ الإجمالي</span>
                      <span className="text-primary font-mono text-base sm:text-lg">
                        {receiptData?.total || 0} ج.م
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 text-center font-medium pt-0.5">
                      طريقة الدفع: نقداً عند الاستلام (كاش)
                    </p>
                  </div>
                </div>

                {/* Receipt Actions (Hidden in Print) */}
                <div className="mt-4 sm:mt-5 space-y-2 print:hidden">
                  {onOpenTracking && (
                    <button
                      type="button"
                      onClick={() => {
                        const trackId = receiptData?.orderNumber ? String(receiptData.orderNumber) : (receiptData?.orderId || '');
                        const phone = receiptData?.customerPhone || formData.phone;
                        onClose();
                        onOpenTracking(trackId, phone);
                      }}
                      className="w-full bg-primary hover:bg-red-700 text-white py-3 sm:py-3.5 rounded-xl font-bold transition-all shadow-lg shadow-red-500/20 active:scale-98 cursor-pointer text-sm sm:text-base flex items-center justify-center gap-2"
                    >
                      <Truck className="w-5 h-5" />
                      <span>تتبّع حالة الطلب</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 sm:py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm shadow-xs"
                    >
                      <Printer className="w-4 h-4 text-slate-500" />
                      <span>طباعة الإيصال</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 sm:py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm"
                    >
                      <span>العودة للقائمة</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
