import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Minus } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { OptionGroupSelector } from './OptionGroupSelector';
import { computeOptionsPrice } from '../utils/price';

interface OptionBottomSheetProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
}

export const OptionBottomSheet: React.FC<OptionBottomSheetProps> = ({ product, isOpen, onClose }) => {
    const { addToCartWithDetails, fetchProductOptionGroups, optionGroupsByProductId, optionGroupLoadingByProductId } = useStore();
    const [quantity, setQuantity] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

    const groups = optionGroupsByProductId[product.id] || [];
    const isLoadingOptionGroups = !!optionGroupLoadingByProductId[product.id];

    // Background Body Scroll Lock
    useEffect(() => {
        if (!isOpen) return;

        const originalOverflow = document.body.style.overflow;
        const originalPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }

        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.paddingRight = originalPaddingRight;
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setQuantity(1);
            setSelectedOptions([]);
            fetchProductOptionGroups(product.id);
        }
    }, [isOpen, product.id, fetchProductOptionGroups]);

    const optionsPrice = computeOptionsPrice(selectedOptions, groups);
    const totalPrice = (product.price + optionsPrice) * quantity;

    const handleConfirm = () => {
        if (isLoadingOptionGroups || groups.length === 0) {
            if (isLoadingOptionGroups) {
                toast.error('جاري تحميل الخيارات...');
            } else if (groups.length === 0) {
                toast.error('لا توجد خيارات متاحة لهذا المنتج');
            }
            return;
        }
        const optionsSnapshot = [...selectedOptions];

        for (const group of groups) {
            const groupSelections = optionsSnapshot.filter(id => group.options?.some(o => o.id === id));
            if (groupSelections.length < group.min_select) {
                toast.error(`يرجى اختيار ${group.min_select} صنف على الأقل من ${group.name_ar}`);
                return;
            }
        }

        addToCartWithDetails(product, quantity, undefined, optionsSnapshot);
        onClose();

        toast.success('تمت الإضافة للسلة', {
            description: `${product.name_ar} × ${quantity}`,
            position: 'bottom-left',
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="relative z-10 bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col"
                    >
                        {/* Mobile Pull Handle */}
                        <div className="sm:hidden flex justify-center pt-2.5 pb-1 bg-white shrink-0">
                            <div className="w-10 h-1 rounded-full bg-zinc-300" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 shrink-0">
                            <div className="flex items-center gap-3">
                                <img
                                    src={product.image_url}
                                    alt={product.name_ar}
                                    className="w-12 h-12 rounded-xl object-cover shadow-xs border border-zinc-100"
                                />
                                <div>
                                    <h3 className="font-black text-base text-zinc-900">{product.name_ar}</h3>
                                    <span className="text-xs font-bold text-[#DC2626]">{product.price} ج.م</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-xl transition-all"
                                aria-label="إغلاق"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content with hidden scrollbar */}
                        <div className="px-5 py-4 space-y-5 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                            <OptionGroupSelector
                                groups={groups}
                                selectedOptions={selectedOptions}
                                setSelectedOptions={setSelectedOptions}
                                variant="modal"
                            />
                        </div>

                        {/* Sticky Bottom Action Bar with Quantity and Brand Red Action Button */}
                        <div className="sticky bottom-0 bg-white border-t border-zinc-100 p-3.5 sm:p-4 shadow-[0_-8px_25px_rgba(0,0,0,0.06)] z-20">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center bg-zinc-100 rounded-2xl p-1 border border-zinc-200/80 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        disabled={quantity <= 1}
                                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-xs text-zinc-700 hover:text-zinc-950 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="تقليل الكمية"
                                    >
                                        <Minus className="w-4 h-4 stroke-[2.5]" />
                                    </button>
                                    <span className="w-8 sm:w-10 text-center font-black text-base sm:text-lg text-zinc-900 select-none">
                                        {quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setQuantity(q => q + 1)}
                                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-xs text-zinc-700 hover:text-zinc-950 flex items-center justify-center transition-all active:scale-90"
                                        aria-label="زيادة الكمية"
                                    >
                                        <Plus className="w-4 h-4 stroke-[2.5]" />
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={isLoadingOptionGroups}
                                    className="flex-1 h-11 sm:h-12 bg-[#DC2626] hover:bg-red-700 text-white rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between px-4 sm:px-5 shadow-lg shadow-red-600/25 transition-all active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
                                >
                                    <div className="flex items-center gap-2">
                                        <ShoppingBag className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
                                        <span>أضف للسلة</span>
                                    </div>
                                    <span className="bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-xl text-xs sm:text-sm font-black tracking-tight">
                                        {totalPrice} ج.م
                                    </span>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

