import React, { useState } from 'react';
import { X, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface ProductDetailsModalProps {
    product: Product;
    isOpen: boolean;
    onClose: () => void;
}

const MAX_NOTE_LENGTH = 200;

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ product, isOpen, onClose }) => {
    const { addToCartWithDetails, categories, globalSettings } = useStore();
    const [quantity, setQuantity] = useState(1);
    const [note, setNote] = useState('');

    const category = categories.find(c => c.id === product.category_id);
    const isCategoryInactive = category && !category.is_active;
    const isWebsiteClosed = globalSettings && !globalSettings.is_website_open;
    const isDisabled = !product.is_available || !!isCategoryInactive || !!isWebsiteClosed;

    const handleAdd = () => {
        if (isDisabled) return;
        addToCartWithDetails(product, quantity, note || undefined);
        toast.success('تمت الإضافة للسلة', {
            description: `${product.name_ar} × ${quantity}`,
            position: 'bottom-left',
        });
        // Reset and close
        setQuantity(1);
        setNote('');
        onClose();
    };

    const handleClose = () => {
        setQuantity(1);
        setNote('');
        onClose();
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
                        onClick={handleClose}
                        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 60 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 60 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl relative z-10 max-h-[92vh] flex flex-col"
                    >
                        {/* Hero Image */}
                        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 shrink-0">
                            <img
                                src={product.image_url}
                                alt={product.name_ar}
                                className="w-full h-full object-cover"
                            />
                            <button
                                onClick={handleClose}
                                className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm w-10 h-10 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all"
                            >
                                <X className="w-5 h-5 text-slate-700" />
                            </button>

                            {/* Unavailability overlay */}
                            {isDisabled && (
                                <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                                    <span className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-lg transform -rotate-6">
                                        {!product.is_available ? 'غير متوفر حالياً' : 'القسم غير متاح'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex-grow overflow-y-auto p-6 space-y-5">
                            {/* Title & Price */}
                            <div className="flex justify-between items-start gap-4">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-black text-slate-900">{product.name_ar}</h2>
                                    {product.name_en && (
                                        <p className="text-sm text-slate-400 font-medium">{product.name_en}</p>
                                    )}
                                </div>
                                <span className="shrink-0 font-black text-xl text-primary bg-red-50 px-3 py-1.5 rounded-xl">
                                    {product.price} ج.م
                                </span>
                            </div>

                            {/* Description */}
                            <p className="text-slate-600 leading-relaxed text-sm">
                                {product.description_ar}
                            </p>

                            {/* Ingredients */}
                            {product.ingredients_ar && product.ingredients_ar.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-sm font-bold text-slate-700">المكونات</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {product.ingredients_ar.map((ing, i) => (
                                            <span
                                                key={i}
                                                className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200"
                                            >
                                                {ing}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Special Instructions */}
                            {!isDisabled && (
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">
                                        ملاحظات خاصة (اختياري)
                                    </label>
                                    <textarea
                                        rows={2}
                                        maxLength={MAX_NOTE_LENGTH}
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none text-sm"
                                        placeholder="مثال: بدون صوص، أو إضافة جبنة..."
                                    />
                                    <div className="flex justify-end">
                                        <span className={`text-xs font-medium ${note.length > MAX_NOTE_LENGTH * 0.9 ? 'text-amber-500' : 'text-slate-400'}`}>
                                            {note.length}/{MAX_NOTE_LENGTH}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer: Quantity + Add Button */}
                        {!isDisabled && (
                            <div className="p-5 border-t bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.04)] flex items-center gap-4">
                                {/* Quantity Selector */}
                                <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
                                    <button
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        className="p-1 hover:text-primary transition-colors active:scale-90"
                                    >
                                        <Minus className="w-4 h-4" />
                                    </button>
                                    <span className="font-bold w-6 text-center text-lg">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(q => q + 1)}
                                        className="p-1 hover:text-primary transition-colors active:scale-90"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Add to Cart */}
                                <button
                                    onClick={handleAdd}
                                    className="flex-grow py-3.5 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-[0.98] shadow-lg shadow-red-500/20"
                                >
                                    <ShoppingBag className="w-5 h-5" />
                                    <span>أضف للسلة</span>
                                    <span className="bg-white/20 px-2.5 py-0.5 rounded-lg text-sm font-bold mr-1">
                                        {product.price * quantity} ج.م
                                    </span>
                                </button>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
