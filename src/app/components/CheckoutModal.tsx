import React, { useState } from 'react';
import { X, CheckCircle2, Truck, Store, MapPin, Phone, User, Loader2, ArrowLeft } from 'lucide-react';
import { useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose }) => {
  const { cart, orderType, setOrderType, clearCart, submitOrder, loading } = useStore();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
  });

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const orderId = await submitOrder({
      customer_name: formData.name,
      customer_phone: formData.phone,
      address: orderType === 'delivery' ? formData.address : undefined,
      type: orderType || 'pickup',
      items: [...cart],
      total,
    });

    if (orderId) {
      setStep(2);
      clearCart();
      toast.success('تم استلام طلبك بنجاح!', {
        description: `رقم الطلب: #${orderId.slice(0, 8).toUpperCase()}`,
      });
    } else {
      // Show server-side validation error
      const errorMessage = useStore.getState().error;
      toast.error('لم يتم إرسال الطلب', {
        description: errorMessage || 'يرجى المحاولة مرة أخرى.',
        duration: 5000,
      });
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
            className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl relative z-10 max-h-[90vh] flex flex-col"
          >
            {step === 1 ? (
              <div className="flex flex-col h-full bg-slate-50">
                {/* Header */}
                <div className="bg-white p-6 border-b flex items-center justify-between sticky top-0 z-10">
                  <h2 className="text-xl font-bold text-slate-900">إتمام الطلب</h2>
                  <button
                    onClick={onClose}
                    className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-grow overflow-y-auto p-6 md:p-8">
                  <form id="checkout-form" onSubmit={handleSubmit} className="space-y-6">
                    {/* Order Type Selection */}
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setOrderType('pickup')}
                        className={`relative overflow-hidden p-4 rounded-2xl flex flex-col items-center gap-3 transition-all duration-300 ${orderType === 'pickup'
                          ? 'bg-white ring-2 ring-primary shadow-lg shadow-red-100'
                          : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <div className={`p-3 rounded-full ${orderType === 'pickup' ? 'bg-red-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                          <Store className="w-6 h-6" />
                        </div>
                        <span className={`font-bold ${orderType === 'pickup' ? 'text-primary' : 'text-slate-600'}`}>استلام من المطعم</span>
                        {orderType === 'pickup' && (
                          <motion.div layoutId="check" className="absolute top-3 right-3 text-primary">
                            <CheckCircle2 className="w-5 h-5 fill-red-50" />
                          </motion.div>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderType('delivery')}
                        className={`relative overflow-hidden p-4 rounded-2xl flex flex-col items-center gap-3 transition-all duration-300 ${orderType === 'delivery'
                          ? 'bg-white ring-2 ring-primary shadow-lg shadow-red-100'
                          : 'bg-white border border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                      >
                        <div className={`p-3 rounded-full ${orderType === 'delivery' ? 'bg-red-50 text-primary' : 'bg-slate-100 text-slate-400'}`}>
                          <Truck className="w-6 h-6" />
                        </div>
                        <span className={`font-bold ${orderType === 'delivery' ? 'text-primary' : 'text-slate-600'}`}>توصيل للمنزل</span>
                        {orderType === 'delivery' && (
                          <motion.div layoutId="check" className="absolute top-3 right-3 text-primary">
                            <CheckCircle2 className="w-5 h-5 fill-red-50" />
                          </motion.div>
                        )}
                      </button>
                    </div>

                    {/* Customer Details */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          الاسم الكامل
                        </label>
                        <input
                          required
                          type="text"
                          placeholder="الاسم ثلاثي"
                          className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400" />
                          رقم الهاتف
                        </label>
                        <input
                          required
                          type="tel"
                          placeholder="01xxxxxxxxx"
                          className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium text-left"
                          dir="ltr"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>

                      <AnimatePresence>
                        {orderType === 'delivery' && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-1.5 overflow-hidden"
                          >
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-slate-400" />
                              العنوان بالتفصيل
                            </label>
                            <textarea
                              required
                              rows={3}
                              placeholder="المنطقة، الشارع، رقم العمارة، الشقة..."
                              className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none"
                              value={formData.address}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </form>
                </div>

                {/* Footer */}
                <div className="p-6 bg-white border-t mt-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                  <div className="flex justify-between items-center mb-4 text-sm">
                    <span className="text-slate-500 font-medium">الإجمالي المطلوب</span>
                    <span className="text-2xl font-black text-slate-900">{total} <span className="text-base font-bold text-slate-400">ج.م</span></span>
                  </div>
                  <button
                    form="checkout-form"
                    type="submit"
                    disabled={!orderType || loading}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-red-700 transition-all active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-xl shadow-red-500/20 disabled:shadow-none flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <span>تأكيد الطلب</span>
                        <ArrowLeft className="w-5 h-5" />
                      </>
                    )}
                  </button>
                  <p className="text-center text-xs text-slate-400 mt-3 font-medium">
                    الدفع عند الاستلام (كاش)
                  </p>
                </div>
              </div>
            ) : (
              // Success State
              <div className="p-12 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner ring-8 ring-green-50">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">تم بنجاح!</h2>
                <p className="text-slate-500 mb-8 max-w-[280px] leading-relaxed">
                  شكراً لطلبك. سنتواصل معك لتأكيد الطلب قريباً.
                </p>
                <button
                  onClick={onClose}
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                  العودة للقائمة
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
