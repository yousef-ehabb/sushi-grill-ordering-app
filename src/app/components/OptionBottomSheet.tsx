import React, { useState, useEffect } from 'react';
import { X, ShoppingBag } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { OptionGroupSelector } from './OptionGroupSelector';

interface OptionBottomSheetProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
}

export const OptionBottomSheet: React.FC<OptionBottomSheetProps> = ({ product, isOpen, onClose }) => {
    const { addToCartWithDetails, fetchProductOptionGroups, optionGroupsByProductId } = useStore();
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

    const groups = optionGroupsByProductId[product.id] || [];

    useEffect(() => {
        if (isOpen) {
            setSelectedOptions([]);
            fetchProductOptionGroups(product.id);
        }
    }, [isOpen, product.id, fetchProductOptionGroups]);

    const optionsPrice = selectedOptions.reduce((total, optionId) => {
        const option = groups.flatMap(g => g.options || []).find(o => o.id === optionId);
        return total + (option?.price_delta || 0);
    }, 0);
    const totalPrice = product.price + optionsPrice;

    const handleConfirm = () => {
        const optionsSnapshot = [...selectedOptions];

        for (const group of groups) {
            const groupSelections = optionsSnapshot.filter(id => group.options?.some(o => o.id === id));
            if (groupSelections.length < group.min_select) {
                toast.error(`يرجى اختيار ${group.min_select} صنف على الأقل من ${group.name_ar}`);
                return;
            }
        }

        addToCartWithDetails(product, 1, undefined, optionsSnapshot);
        onClose();

        toast.success('تمت الإضافة للسلة', {
            description: product.name_ar,
            position: 'bottom-left',
            action: {
                label: 'إضافة نفس الاختيارات',
                onClick: () => {
                    addToCartWithDetails(product, 1, undefined, optionsSnapshot);
                    toast.success('تمت إضافة نسخة أخرى!', { position: 'bottom-left' });
                },
            },
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-end justify-center" dir="rtl">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="relative z-10 bg-white w-full max-w-lg rounded-t-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 rounded-full bg-slate-200" />
                        </div>

                        <div className="flex items-center justify-between px-5 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <img
                                    src={product.image_url}
                                    alt={product.name_ar}
                                    className="w-12 h-12 rounded-xl object-cover shadow-sm"
                                />
                                <div>
                                    <h3 className="font-bold text-base text-slate-900">{product.name_ar}</h3>
                                    <span className="text-sm font-bold text-primary">{product.price} ج.م</span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-100 rounded-xl transition-all"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-5 max-h-[50vh] overflow-y-auto">
                            <OptionGroupSelector
                                groups={groups}
                                selectedOptions={selectedOptions}
                                setSelectedOptions={setSelectedOptions}
                                variant="sheet"
                            />
                        </div>

                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                            <button
                                onClick={handleConfirm}
                                className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-3 bg-slate-900 text-white hover:bg-primary hover:shadow-lg hover:shadow-red-500/20 transition-all active:scale-[0.98]"
                            >
                                <ShoppingBag className="w-5 h-5" />
                                <span>أضف للسلة</span>
                                <span className="bg-white/20 px-3 py-0.5 rounded-lg text-sm">{totalPrice} ج.م</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
