import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { toast } from 'sonner';
import { ProductDetailsModal } from './ProductDetailsModal';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart, categories, globalSettings } = useStore();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const category = categories.find(c => c.id === product.category_id);
  const isCategoryInactive = category && !category.is_active;
  const isWebsiteClosed = globalSettings && !globalSettings.is_website_open;
  const isDisabled = !product.is_available || !!isCategoryInactive || !!isWebsiteClosed;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDisabled) return;
    addToCart(product);
    toast.success('تمت الإضافة للسلة', {
      description: `${product.name_ar} أضيف إلى سلتك`,
      position: 'bottom-left',
    });
  };

  return (
    <>
      <div className={`group relative bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-xl hover:border-red-100 transition-all duration-300 flex flex-col h-full ${isDisabled ? 'opacity-70' : ''}`}>
        {/* Image Container — clickable for details */}
        <div
          className="relative aspect-[4/3] overflow-hidden bg-slate-100 cursor-pointer"
          onClick={() => setIsDetailsOpen(true)}
        >
          <img
            src={product.image_url}
            alt={product.name_ar}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
          />

          {/* Availability Badge */}
          {!product.is_available && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
              <span className="bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg transform -rotate-6">
                غير متوفر حالياً
              </span>
            </div>
          )}

          {/* Category Inactive Badge */}
          {product.is_available && isCategoryInactive && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
              <span className="bg-amber-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg transform -rotate-6">
                القسم غير متاح
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col flex-grow">
          <div className="flex justify-between items-start gap-4 mb-2">
            <h3
              className="font-bold text-lg text-slate-900 line-clamp-1 group-hover:text-primary transition-colors cursor-pointer"
              onClick={() => setIsDetailsOpen(true)}
            >
              {product.name_ar}
            </h3>
            <span className="shrink-0 font-bold text-lg text-primary bg-red-50 px-2.5 py-1 rounded-lg">
              {product.price} ج.م
            </span>
          </div>

          <p className="text-slate-500 text-sm leading-relaxed line-clamp-2 mb-6 flex-grow">
            {product.description_ar}
          </p>

          <button
            onClick={handleAddToCart}
            disabled={isDisabled}
            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]
              ${!isDisabled
                ? 'bg-slate-900 text-white hover:bg-primary hover:shadow-lg hover:shadow-red-500/20'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
          >
            <div className={`p-1 rounded-full ${!isDisabled ? 'bg-white/20' : 'bg-slate-200'}`}>
              <Plus className="w-4 h-4" />
            </div>
            <span>أضف للسلة</span>
          </button>
        </div>
      </div>

      {/* Product Details Modal */}
      <ProductDetailsModal
        product={product}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
      />
    </>
  );
};
