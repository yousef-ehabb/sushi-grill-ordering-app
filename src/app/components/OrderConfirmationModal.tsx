import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Truck, Store, MapPin, Phone, User, Copy, Check, ArrowLeft, AlertTriangle, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { restaurantConfig } from '../../config/restaurant';
import { resolveAllOptionNames } from '../utils/optionNames';

export interface OrderReceiptData {
  orderId: string;
  orderNumber?: number;
  customerName: string;
  customerPhone: string;
  address?: string;
  type: string;
  branch: string;
  items: any[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
}

interface OrderConfirmationModalProps {
  isOpen: boolean;
  receiptData: OrderReceiptData | null;
  onClose: () => void;
  onOpenTracking: (orderId: string, phone: string) => void;
}

export const OrderConfirmationModal: React.FC<OrderConfirmationModalProps> = ({
  isOpen,
  receiptData,
  onClose,
  onOpenTracking,
}) => {
  const [copied, setCopied] = useState(false);
  const [optionNames, setOptionNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!receiptData?.items) return;
    const allOptionIds = receiptData.items.map((item: any) =>
      item.selectedOptionIds || item.selected_option_ids || []
    );
    if (allOptionIds.some((ids: string[]) => ids && ids.length > 0)) {
      resolveAllOptionNames(allOptionIds).then(setOptionNames);
    }
  }, [receiptData]);

  if (!isOpen || !receiptData) return null;

  const displayOrderNum = receiptData.orderNumber
    ? `#${receiptData.orderNumber}`
    : `#${receiptData.orderId.slice(0, 8).toUpperCase()}`;

  const rawOrderNum = receiptData.orderNumber
    ? String(receiptData.orderNumber)
    : receiptData.orderId;

  const handleCopy = () => {
    navigator.clipboard?.writeText(displayOrderNum);
    setCopied(true);
    toast.success('تم نسخ رقم الطلب بنجاح');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTrackOrder = () => {
    onClose();
    onOpenTracking(rawOrderNum, receiptData.customerPhone);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" dir="rtl">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 30 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl relative z-10 max-h-[90vh] max-h-[90dvh] flex flex-col overflow-hidden my-auto"
        >
          {/* Top Header Strip */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                تأكيد الطلب والفاتورة الرقمية
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Receipt Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 bg-slate-50/50">
            {/* 1. Success Icon & Greeting */}
            <div className="text-center space-y-1.5 pt-1">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, delay: 0.1 }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner"
              >
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" />
              </motion.div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                تم استلام طلبك بنجاح! 🎉
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                شكراً لطلبك من بوشنكي برجر
              </p>
            </div>

            {/* 2. Prominent Order ID Box (Hero Highlight) */}
            <div className="bg-red-50 border-2 border-dashed border-red-300 rounded-2xl p-4 sm:p-5 text-center shadow-xs space-y-3">
              <span className="text-xs font-bold text-slate-500 block">
                رقم طلبك المميز للمتابعة
              </span>

              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <span className="text-3xl sm:text-4xl font-mono font-black text-primary tracking-wider drop-shadow-xs">
                  {displayOrderNum}
                </span>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-100 border border-red-200 text-slate-700 hover:text-primary transition-all font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 shrink-0"
                  title="نسخ رقم الطلب"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">تم النسخ ✓</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>نسخ الرقم</span>
                    </>
                  )}
                </button>
              </div>

              {/* Critical Warning Note */}
              <div className="bg-amber-100/70 border border-amber-300/80 rounded-xl p-2.5 text-right">
                <p className="text-xs sm:text-[13px] text-amber-950 font-bold leading-relaxed">
                  ⚠️ <strong>هام جداً:</strong> احتفظ برقم الطلب هذا (<span className="font-mono">{displayOrderNum}</span>) أو خذ لقطة شاشة (Screenshot) لأنك ستحتاجه لمتابعة حالة طلبك.
                </p>
              </div>
            </div>

            {/* 3. Digital Invoice Details */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3 shadow-xs text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-black text-slate-800 text-sm">تفاصيل الفاتورة الرقمية</span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {new Date(receiptData.createdAt).toLocaleDateString('ar-EG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  -{' '}
                  {new Date(receiptData.createdAt).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="text-slate-400 font-bold block mb-0.5">الفرع</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 text-primary" />
                    {receiptData.branch}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-bold block mb-0.5">نوع الاستلام</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    {receiptData.type === 'delivery' ? (
                      <>
                        <Truck className="w-3.5 h-3.5 text-primary" />
                        <span>توصيل للمنزل</span>
                      </>
                    ) : (
                      <>
                        <Store className="w-3.5 h-3.5 text-primary" />
                        <span>استلام من الفرع</span>
                      </>
                    )}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-bold block mb-0.5">اسم العميل</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    {receiptData.customerName}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 font-bold block mb-0.5">رقم الهاتف</span>
                  <span className="font-bold text-slate-800 font-mono flex items-center gap-1" dir="ltr">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {receiptData.customerPhone}
                  </span>
                </div>

                {receiptData.type === 'delivery' && receiptData.address && (
                  <div className="col-span-2 pt-1.5 border-t border-slate-100">
                    <span className="text-slate-400 font-bold block mb-0.5">عنوان التوصيل</span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{receiptData.address}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Ordered Items Breakdown */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600 block">الأصناف المطلوبة</span>
              <div className="divide-y divide-slate-100 bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                {receiptData.items?.map((item: any, idx: number) => {
                  const itemPrice = (item.price ?? item.unit_price ?? 0) + (item.optionsPrice ?? 0);
                  const itemTotal = itemPrice * item.quantity;

                  return (
                    <div key={item.id || idx} className="p-3 flex items-start justify-between gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-slate-900 flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-red-50 text-primary flex items-center justify-center font-mono font-black text-[11px] shrink-0">
                            {item.quantity}×
                          </span>
                          <span className="truncate">{item.name_ar}</span>
                        </div>

                        {item.specialInstructions && (
                          <p className="text-[11px] text-slate-400 italic mr-7 mt-0.5">
                            — {item.specialInstructions}
                          </p>
                        )}

                        {/* Selected Sauces / Upgrades */}
                        {(() => {
                          const optionIds = item.selectedOptionIds || item.selected_option_ids || [];
                          const resolvedOptions = optionIds
                            .map((id: string) => optionNames.get(id))
                            .filter(Boolean);
                          if (resolvedOptions.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1 mt-1 mr-7">
                              {resolvedOptions.map((optName: string, i: number) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200/60"
                                >
                                  + {optName}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      <span className="font-black text-slate-900 font-mono shrink-0">
                        {itemTotal} ج.م
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. Financial Summary */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 space-y-2 text-xs shadow-xs">
              <div className="flex justify-between text-slate-500 font-semibold">
                <span>المجموع الفرعي</span>
                <span className="font-mono">{receiptData.subtotal} ج.م</span>
              </div>

              {receiptData.deliveryFee > 0 && (
                <div className="flex justify-between text-slate-500 font-semibold">
                  <span>خدمة التوصيل</span>
                  <span className="font-mono">{receiptData.deliveryFee} ج.م</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-sm font-black">
                <span className="text-slate-900">المبلغ الإجمالي المطلوب</span>
                <span className="text-primary font-mono text-base sm:text-lg">
                  {receiptData.total} ج.م
                </span>
              </div>

              <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg p-2 text-center font-bold border border-emerald-200/60">
                💵 طريقة الدفع: نقداً عند الاستلام (كاش)
              </div>
            </div>
          </div>

          {/* Modal Action Buttons Footer */}
          <div className="p-4 sm:p-5 bg-white border-t border-slate-100 space-y-2.5 shrink-0">
            {/* Primary Button: Track Order Immediately */}
            <button
              type="button"
              onClick={handleTrackOrder}
              className="w-full bg-primary hover:bg-red-700 text-white py-3.5 rounded-2xl font-black text-sm sm:text-base transition-all shadow-lg shadow-red-500/25 active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>متابعة حالة الطلب الآن ←</span>
            </button>

            {/* Secondary Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                <span>طباعة الفاتورة</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center cursor-pointer"
              >
                <span>إغلاق والعودة للمنيو</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
