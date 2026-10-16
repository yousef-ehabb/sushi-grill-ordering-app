import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { toast } from 'sonner';
import { OptionGroupSelector } from './OptionGroupSelector';
import { computeOptionsPrice } from '../utils/price';
import { clsx } from 'clsx';
import { isProductAvailableInBranch } from '../utils/branchAvailability';

interface ProductDetailsModalProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
}

const MAX_NOTE_LENGTH = 200;

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ product: initialProduct, isOpen, onClose }) => {
    const { addToCartWithDetails, categories, globalSettings, fetchProductOptionGroups, optionGroupsByProductId, products } = useStore();
    const [quantity, setQuantity] = useState(1);
    const [note, setNote] = useState('');
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const dragControls = useDragControls();

    const product = products.find(p => p.id === initialProduct.id) || initialProduct;
    const category = categories.find(c => c.id === product.category_id);
    const isCategoryInactive = category && !category.is_active;
    const isWebsiteClosed = globalSettings && !globalSettings.is_website_open;

    const isAvailableInStadium = isProductAvailableInBranch(product, 'فرع الاستاد');
    const isAvailableInCaravan = isProductAvailableInBranch(product, 'فرع الكرفان');
    const isUnavailableInBoth = (!isAvailableInStadium && !isAvailableInCaravan) || product.is_available === false;
    const branchNotice = !isAvailableInStadium && isAvailableInCaravan
        ? 'غير متاح في فرع الاستاد'
        : !isAvailableInCaravan && isAvailableInStadium
        ? 'غير متاح في فرع الكرفان'
        : null;

    const isDisabled = isUnavailableInBoth || !!isCategoryInactive || !!isWebsiteClosed;

    const groups = optionGroupsByProductId[product.id] || [];

    // Real-time alert if item becomes unavailable while modal is open
    useEffect(() => {
        if (isOpen && !product.is_available) {
            toast.error('صنف غير متاح حالياً', {
                description: `عذراً، الصنف "${product.name_ar}" أصبح غير متاح حالياً.`,
                duration: 6000,
            });
        }
    }, [isOpen, product.is_available, product.name_ar]);

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

    // Fetch options when modal is opened
    useEffect(() => {
        if (isOpen) {
            fetchProductOptionGroups(product.id);
        }
    }, [isOpen, product.id, fetchProductOptionGroups]);

    const optionsPrice = computeOptionsPrice(selectedOptions, groups);
    const totalPrice = (product.price + optionsPrice) * quantity;

    const handleAdd = () => {
        if (isDisabled) return;

        for (const group of groups) {
            const groupSelections = selectedOptions.filter(id => group.options?.some(o => o.id === id));
            if (groupSelections.length < group.min_select) {
                toast.error(`يرجى اختيار ${group.min_select} صنف على الأقل من ${group.name_ar}`);
                return;
            }
        }

        addToCartWithDetails(product, quantity, note || undefined, selectedOptions);
        toast.success('تمت الإضافة للسلة', {
            description: `${product.name_ar} × ${quantity}`,
            position: 'bottom-left',
        });

        handleClose();
    };

    const handleClose = () => {
        setQuantity(1);
        setNote('');
        setSelectedOptions([]);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
                    {/* Soft blurred dark overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Responsive Modal Container: Ergonomic Bottom Sheet on mobile, Centered Card on desktop */}
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        drag="y"
                        dragControls={dragControls}
                        dragListener={false}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.55 }}
                        onDragEnd={(_e, info) => {
                            if (info.offset.y > 100 || info.velocity.y > 500) {
                                handleClose();
                            }
                        }}
                        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl relative z-10 max-h-[88vh] flex flex-col"
                    >
                        {/* Mobile Pull Handle Bar with touch-to-drag */}
                        <div
                            onPointerDown={(e) => dragControls.start(e)}
                            className="sm:hidden flex justify-center items-center bg-white shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
                        >
                            <div className="w-12 h-1 bg-zinc-300 rounded-full mx-auto my-2.5" />
                        </div>

                        {/* Product Hero Image & Floating Translucent Dismiss */}
                        <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-zinc-100 shrink-0">
                            <img
                                src={product.image_url}
                                alt={product.name_ar}
                                className="w-full h-full object-cover"
                            />
                            {/* Gradient vignette for contrast */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

                            {/* Floating circular translucent close icon on top corner */}
                            <button
                                type="button"
                                onClick={handleClose}
                                className="absolute top-3 left-3 bg-white/80 hover:bg-white text-zinc-800 hover:text-zinc-950 backdrop-blur-md w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 z-20 border border-white/40 cursor-pointer"
                                aria-label="إغلاق"
                            >
                                <X className="w-5 h-5 stroke-[2.2]" />
                            </button>

                            {isDisabled && (
                                <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex items-center justify-center z-10">
                                    <span className="bg-zinc-900 text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-lg transform -rotate-3">
                                        {!product.is_available ? 'غير متوفر حالياً' : 'القسم غير متاح'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Options & Modifiers List: Clean Internal Scroll with Hidden Scrollbars */}
                        <div className="flex-1 overflow-y-auto scrollbar-none px-5 py-3 space-y-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {/* Product Title, Badge & Prominent Price Tag */}
                            <div className="border-b border-zinc-100 pb-3.5 space-y-2">
                                <div className="flex justify-between items-start gap-3">
                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                                                {product.name_ar}
                                            </h2>
                                            {product.is_best_seller && (
                                                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full tracking-tight">
                                                    الأكثر طلباً
                                                </span>
                                            )}
                                            {branchNotice && (
                                                <span className="bg-amber-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-tight">
                                                    {branchNotice}
                                                </span>
                                            )}
                                        </div>
                                        {product.name_en && (
                                            <p className="text-xs text-zinc-400 font-medium">
                                                {product.name_en}
                                            </p>
                                        )}
                                    </div>

                                    {/* Prominent Price Tag */}
                                    <div className="shrink-0 text-left bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl">
                                        <span className="font-black text-lg sm:text-xl text-[#DC2626]">
                                            {product.price}
                                        </span>
                                        <span className="text-xs font-bold text-[#DC2626] mr-1">ج.م</span>
                                    </div>
                                </div>

                                {/* Subtle Description */}
                                {product.description_ar && (
                                    <p className="text-xs text-zinc-500 leading-relaxed">
                                        {product.description_ar}
                                    </p>
                                )}
                            </div>

                            {/* Ingredients Tags */}
                            {product.ingredients_ar && product.ingredients_ar.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                                        المكونات الأساسية
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {product.ingredients_ar.map((ing, i) => (
                                            <span
                                                key={i}
                                                className="bg-zinc-50 text-zinc-600 px-2.5 py-1 rounded-lg text-xs font-medium border border-zinc-200/70"
                                            >
                                                {ing}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Modifiers List (Option Groups & Customization) */}
                            {groups.length > 0 && (
                                <div className="pt-1">
                                    <OptionGroupSelector
                                        groups={groups}
                                        selectedOptions={selectedOptions}
                                        setSelectedOptions={setSelectedOptions}
                                        variant="modal"
                                    />
                                </div>
                            )}

                            {/* Special Instructions Textarea */}
                            {!isDisabled && (
                                <div className="space-y-2 pt-2 border-t border-zinc-100">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-zinc-700">
                                            ملاحظات خاصة
                                        </label>
                                        <span className="text-[11px] text-zinc-400 font-medium">اختياري</span>
                                    </div>
                                    <textarea
                                        rows={2}
                                        maxLength={MAX_NOTE_LENGTH}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-[#DC2626]/20 focus:border-[#DC2626] outline-none transition-all placeholder:text-zinc-400 font-medium resize-none text-xs sm:text-sm text-zinc-800"
                                        placeholder="مثال: بدون بصل، صوص خارجي..."
                                    />
                                    <div className="flex justify-end">
                                        <span className={`text-[10px] font-medium ${note.length > MAX_NOTE_LENGTH * 0.9 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                            {note.length}/{MAX_NOTE_LENGTH}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sticky Action Bar */}
                        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-zinc-100 p-4 flex items-center gap-3 z-30">
                            {/* Ergonomic Quantity Counter */}
                            <div className="flex items-center bg-zinc-100 rounded-2xl p-1 border border-zinc-200/80 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                    disabled={quantity <= 1 || isDisabled}
                                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-xs text-zinc-700 hover:text-zinc-950 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                                    disabled={isDisabled}
                                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-xs text-zinc-700 hover:text-zinc-950 flex items-center justify-center transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    aria-label="زيادة الكمية"
                                >
                                    <Plus className="w-4 h-4 stroke-[2.5]" />
                                </button>
                            </div>

                            {/* Wide Primary Button */}
                            <button
                                type="button"
                                onClick={handleAdd}
                                disabled={isDisabled}
                                className={clsx(
                                    "flex-1 h-12 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between px-4 sm:px-5 transition-all",
                                    !isDisabled
                                        ? "bg-[#DC2626] hover:bg-red-700 active:bg-red-800 text-white shadow-lg shadow-red-600/25 active:scale-[0.98] cursor-pointer"
                                        : "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <ShoppingBag className="w-4.5 h-4.5 sm:w-5 sm:h-5 stroke-[2.2]" />
                                    <span>{!product.is_available ? 'غير متاح حالياً' : 'أضف للسلة'}</span>
                                </div>
                                <span className={clsx(
                                    "px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black tracking-tight",
                                    !isDisabled ? "bg-white/20 backdrop-blur-xs" : "bg-slate-300/60 text-slate-600"
                                )}>
                                    {totalPrice} ج.م
                                </span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

