import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, ShoppingBag, Trash2, ArrowRight, AlertTriangle } from 'lucide-react';
import { useStore, Order } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = ({ isOpen, onClose, onCheckout }) => {
  const {
    cart,
    updateQuantity,
    removeFromCart,
    orderType,
    categories,
    businessRules,
    optionGroupsByProductId,
    optionGroupLoadingByProductId,
    fetchProductOptionGroups,
  } = useStore();

  const total = cart.reduce((sum, item) => {
    const itemTotal = (item.price + (item.optionsPrice || 0)) * item.quantity;
    return sum + itemTotal;
  }, 0);

  // Ensure option data is loaded for cart items that have selections
  useEffect(() => {
    const neededProductIds = new Set<string>();
    for (const item of cart) {
      if (
        item.selectedOptionIds?.length &&
        optionGroupsByProductId[item.id] === undefined &&
        !optionGroupLoadingByProductId[item.id]
      ) {
        neededProductIds.add(item.id);
      }
    }
    neededProductIds.forEach((productId) => {
      fetchProductOptionGroups(productId);
    });
  }, [cart, optionGroupsByProductId, optionGroupLoadingByProductId, fetchProductOptionGroups]);

  // Calculate minimum quantity violations
  const getMinQtyWarnings = () => {
    const warnings: { categoryName: string; current: number; required: number }[] = [];

    // Group cart items by category
    const categoryQuantities: Record<string, number> = {};
    for (const item of cart) {
      if (!categoryQuantities[item.category_id]) {
        categoryQuantities[item.category_id] = 0;
      }
      categoryQuantities[item.category_id] += item.quantity;
    }

    // Check against business rules
    for (const [catId, qty] of Object.entries(categoryQuantities)) {
      const rule = businessRules.find(r => r.category_id === catId);
      if (rule && rule.min_quantity > 1 && qty < rule.min_quantity) {
        const category = categories.find(c => c.id === catId);
        warnings.push({
          categoryName: category?.name_ar || catId,
          current: qty,
          required: rule.min_quantity,
        });
      }
    }

    return warnings;
  };

  const warnings = getMinQtyWarnings();
  const hasViolations = warnings.length > 0;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: isOpen ? 0 : '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-2xl z-[60] flex flex-col"
        dir="rtl"
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">سلة المشتريات</h2>
            <span className="bg-red-50 text-primary text-xs px-2 py-0.5 rounded-full font-bold">
              {cart.length} أصناف
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="h-full flex flex-col items-center justify-center text-center space-y-6"
              >
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-2 shadow-inner">
                  <ShoppingBag className="w-10 h-10 text-slate-300" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900">سلتك فارغة</h3>
                  <p className="text-slate-500 max-w-[200px] mx-auto text-sm">
                    لم تضف أي وجبات بعد. تصفح المنيو واستمتع بأطيب المأكولات.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                  تصفح المنيو
                </button>
              </motion.div>
            ) : (
              cart.map((item) => {
                const itemSauces = item.selectedOptionIds?.map(id => {
                  const option = (optionGroupsByProductId[item.id] || [])
                    .flatMap(g => g.options || [])
                    .find(o => o.id === id);
                  return option ? { name: option.name_ar, active: option.is_active } : null;
                }).filter(Boolean) as { name: string; active: boolean }[] | undefined;

                const hasUnavailableSauce = itemSauces?.some(s => !s.active);

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    key={item.cartKey}
                    className="flex gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm group hover:border-red-100 transition-all"
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                      <img
                        src={item.image_url}
                        alt={item.name_ar}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className="flex-grow flex flex-col justify-between">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-900 leading-tight line-clamp-1">{item.name_ar}</h4>
                        <button
                          onClick={() => removeFromCart(item.cartKey)}
                          className="bg-red-50 text-red-500 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-0.5">
                        {itemSauces && itemSauces.length > 0 && (
                          <p className="text-[10px] text-slate-500 font-bold flex items-center gap-1 flex-wrap">
                            <span className="text-primary/70">🍟</span>
                            {itemSauces.map((s, i) => (
                              <span key={i}>
                                <span className={!s.active ? 'line-through text-red-400' : ''}>
                                  {s.name}
                                </span>
                                {!s.active && <span className="text-[8px] text-red-500 mr-0.5">⚠️</span>}
                                {i < itemSauces.length - 1 && '، '}
                              </span>
                            ))}
                          </p>
                        )}
                        {hasUnavailableSauce && (
                          <p className="text-[9px] text-red-500 font-bold">⚠️ صوص غير متوفر حالياً</p>
                        )}
                        {item.specialInstructions && (
                          <p className="text-[10px] text-slate-400 font-medium line-clamp-1">
                            — {item.specialInstructions}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                          <button
                            onClick={() => updateQuantity(item.cartKey, -1)}
                            className="p-1 hover:text-primary transition-colors active:scale-90"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-bold w-4 text-center text-sm">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.cartKey, 1)}
                            className="p-1 hover:text-primary transition-colors active:scale-90"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="font-bold text-primary">{(item.price + (item.optionsPrice || 0)) * item.quantity} ج.م</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {cart.length > 0 && (
          <div className="p-4 border-t bg-slate-50 space-y-4">
            {/* Minimum Quantity Warnings */}
            {hasViolations && (
              <div className="space-y-2">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>{w.categoryName}: الحد الأدنى {w.required} قطع (لديك {w.current})</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي</span>
                <span>{total} ج.م</span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold text-lg">
                <span>الإجمالي</span>
                <span>{total} ج.م</span>
              </div>
              {orderType === 'delivery' && (
                <p className="text-xs text-slate-500 text-center">
                  * قد يتم إضافة رسوم توصيل بناءً على منطقتك
                </p>
              )}
            </div>
            <button
              onClick={onCheckout}
              disabled={hasViolations}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg
                ${hasViolations
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-primary text-white hover:bg-red-700 shadow-red-100'
                }`}
            >
              إتمام الطلب
              <ArrowRight className="w-5 h-5 mr-1" />
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
};
