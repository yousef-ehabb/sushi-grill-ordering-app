import React, { useState, useRef } from 'react';
import { X, Upload, Loader2, ImageIcon, DollarSign, Type, FileText } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';

interface ProductEditModalProps {
    product: Product;
    onClose: () => void;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({ product, onClose }) => {
    const { updateProduct, uploadProductImage } = useStore();
    const [form, setForm] = useState({
        name_ar: product.name_ar,
        name_en: product.name_en,
        description_ar: product.description_ar,
        price: product.price,
    });
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('يرجى اختيار ملف صورة فقط');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setError('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
            return;
        }

        setSelectedFile(file);
        setError(null);

        const reader = new FileReader();
        reader.onload = (ev) => setImagePreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            let imageUrl = product.image_url;

            // Upload new image if selected
            if (selectedFile) {
                const url = await uploadProductImage(product.id, selectedFile);
                if (url) imageUrl = url;
            }

            await updateProduct(product.id, {
                name_ar: form.name_ar,
                name_en: form.name_en,
                description_ar: form.description_ar,
                price: Number(form.price),
                image_url: imageUrl,
            });

            onClose();
        } catch (err: any) {
            setError(err.message || 'فشل في حفظ التعديلات');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4" dir="rtl">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">تعديل المنتج</h2>
                        <p className="text-sm text-slate-500 font-medium">تحديث بيانات: {product.name_ar}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto p-6 md:p-8 space-y-6">
                    {/* Error */}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 block" />
                            {error}
                        </motion.div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Image Upload Column */}
                        <div className="space-y-3">
                            <label className="block text-sm font-bold text-slate-700">صورة المنتج</label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="relative aspect-[4/3] w-full bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden cursor-pointer group hover:border-primary/50 transition-all shadow-sm hover:shadow-md"
                            >
                                <img
                                    src={imagePreview || product.image_url}
                                    alt={product.name_ar}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white backdrop-blur-[2px]">
                                    <Upload className="w-8 h-8 mb-2" />
                                    <span className="text-sm font-bold">تغيير الصورة</span>
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <p className="text-xs text-slate-400 text-center">
                                يفضل استخدام صورة بنسبة أبعاد 4:3
                            </p>
                        </div>

                        {/* Details Column */}
                        <div className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <Type className="w-4 h-4 text-slate-400" />
                                    الاسم (عربي)
                                </label>
                                <input
                                    type="text"
                                    value={form.name_ar}
                                    onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <Type className="w-4 h-4 text-slate-400" />
                                    الاسم (إنجليزي)
                                </label>
                                <input
                                    type="text"
                                    value={form.name_en}
                                    onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium"
                                    dir="ltr"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-slate-400" />
                                    السعر (ج.م)
                                </label>
                                <input
                                    type="number"
                                    value={form.price}
                                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium"
                                    min="0"
                                    step="0.5"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            الوصف
                        </label>
                        <textarea
                            value={form.description_ar}
                            onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-medium resize-none"
                            rows={3}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-slate-50 flex gap-4">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-3.5 bg-primary hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-red-500/20 disabled:shadow-none flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                جاري الحفظ...
                            </>
                        ) : (
                            'حفظ التعديلات'
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-8 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-all active:scale-[0.98]"
                    >
                        إلغاء
                    </button>
                </div>
            </motion.div>
        </div>
    );
};
