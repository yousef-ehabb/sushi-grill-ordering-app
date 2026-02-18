import React, { useState, useEffect } from 'react';
import { X, ShoppingBag } from 'lucide-react';
import { Product, OptionGroup, useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { clsx } from 'clsx';

interface OptionBottomSheetProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
}

export const OptionBottomSheet: React.FC<OptionBottomSheetProps> = ({ product, isOpen, onClose }) => {
    const { addToCartWithDetails, fetchProductOptionGroups, optionGroupsByProductId } = useStore();
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [lastSelectedOptions, setLastSelectedOptions] = useState<string[]>([]);

    const groups = optionGroupsByProductId[product.id] || [];

    useEffect(() => {
        if (isOpen) {
            setSelectedOptions([]);
            fetchProductOptionGroups(product.id);
        }
    }, [isOpen, product.id, fetchProductOptionGroups]);

    // Calculate total price
    const optionsPrice = selectedOptions.reduce((total, optionId) => {
        const option = groups.flatMap(g => g.options || []).find(o => o.id === optionId);
        return total + (option?.price_delta || 0);
    }, 0);
    const totalPrice = product.price + optionsPrice;

    const handleOptionClick = (group: OptionGroup, optionId: string, isInactive: boolean) => {
        if (isInactive) return;

        const isSelected = selectedOptions.includes(optionId);
        if (isSelected) {
            setSelectedOptions(prev => prev.filter(id => id !== optionId));
        } else {
            const groupSelections = selectedOptions.filter(id =>
                group.options?.some(o => o.id === id)
            );
            if (groupSelections.length >= group.max_select) {
                toast.warning(`يمكنك اختيار ${group.max_select} بحد أقصى`);
                return;
            }
            setSelectedOptions(prev => [...prev, optionId]);
        }
    };

    const handleConfirm = () => {
        // Validate min_select
        for (const group of groups) {
            const groupSelections = selectedOptions.filter(id => group.options?.some(o => o.id === id));
            if (groupSelections.length < group.min_select) {
                toast.error(`يرجى اختيار ${group.min_select} صنف على الأقل من ${group.name_ar}`);
                return;
            }
        }

        addToCartWithDetails(product, 1, undefined, selectedOptions);
        setLastSelectedOptions([...selectedOptions]);
        onClose();

        // Toast with "add same selections" option
        toast.success('تمت الإضافة للسلة', {
            description: product.name_ar,
            position: 'bottom-left',
            action: {
                label: 'إضافة نفس الاختيارات',
                onClick: () => {
                    addToCartWithDetails(product, 1, undefined, selectedOptions);
                    toast.success('تمت إضافة نسخة أخرى!', { position: 'bottom-left' });
                },
            },
        });
    };

    // Count selections per group for the indicator
    const getGroupSelectionCount = (group: OptionGroup) => {
        return selectedOptions.filter(id => group.options?.some(o => o.id === id)).length;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-end justify-center" dir="rtl">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="relative z-10 bg-white w-full max-w-lg rounded-t-3xl shadow-2xl overflow-hidden"
                    >
                        {/* Drag Handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 rounded-full bg-slate-200" />
                        </div>

                        {/* Header */}
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

                        {/* Options */}
                        <div className="px-5 py-4 space-y-5 max-h-[50vh] overflow-y-auto">
                            {groups.map((group) => {
                                const count = getGroupSelectionCount(group);
                                return (
                                    <div key={group.id} className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-bold text-slate-700">{group.name_ar}</h4>
                                                {group.min_select > 0 && (
                                                    <span className="text-[10px] bg-red-50 text-primary px-2 py-0.5 rounded-full font-bold">إلزامي</span>
                                                )}
                                            </div>
                                            {/* Selection counter */}
                                            <span className={clsx(
                                                'text-xs font-bold px-2.5 py-1 rounded-full transition-colors',
                                                count > 0
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'bg-slate-100 text-slate-400'
                                            )}>
                                                {count}/{group.max_select}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {group.options
                                                ?.slice()
                                                .sort((a, b) => (Number(b.is_active) - Number(a.is_active)))
                                                .map((option) => {
                                                    const isSelected = selectedOptions.includes(option.id);
                                                    const isInactive = !option.is_active;

                                                    return (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            disabled={isInactive}
                                                            onClick={() => handleOptionClick(group, option.id, isInactive)}
                                                            className={clsx(
                                                                'px-4 py-2.5 rounded-xl text-sm font-bold transition-all border-2',
                                                                isInactive
                                                                    ? 'opacity-50 border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed pointer-events-none'
                                                                    : isSelected
                                                                        ? 'border-primary bg-red-50 text-primary shadow-sm shadow-red-500/10 scale-[1.02]'
                                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 active:scale-95'
                                                            )}
                                                        >
                                                            <span>{option.name_ar}</span>
                                                            {option.price_delta > 0 && (
                                                                <span className={clsx('text-[10px] mr-1', isSelected ? 'text-primary/60' : 'text-slate-400')}>
                                                                    +{option.price_delta} ج.م
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer / Confirm */}
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
