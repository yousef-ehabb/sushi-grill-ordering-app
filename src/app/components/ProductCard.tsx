import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Product, useStore } from '../store/useStore';
import { toast } from 'sonner';
import { ProductDetailsModal } from './ProductDetailsModal';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const {
    addToCart,
    categories,
    globalSettings,
    fetchProductOptionGroups,
    optionGroupsByProductId,
    optionGroupLoadingByProductId,
  } = useStore();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const category = categories.find(c => c.id === product.category_id);
  const isCategoryInactive = category && !category.is_active;
  const isWebsiteClosed = globalSettings && !globalSettings.is_website_open;
  const isDisabled = !product.is_available || !!isCategoryInactive || !!isWebsiteClosed;

  const groups = optionGroupsByProductId[product.id];
  const isLoadingOptionGroups = !!optionGroupLoadingByProductId[product.id] || groups === undefined;
  const resolvedGroups = groups || [];
  const hasOptions = resolvedGroups.length > 0;

  // Prefetch option groups so we know if this product requires configuration
  useEffect(() => {
    if (optionGroupsByProductId[product.id] === undefined) {
      fetchProductOptionGroups(product.id);
    }
  }, [product.id, fetchProductOptionGroups, optionGroupsByProductId]);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDisabled) return;

    if (isLoadingOptionGroups || hasOptions) {
      setIsDetailsOpen(true);
    } else {
      addToCart(product);
      toast.success('تمت الإضافة للسلة', {
        description: `${product.name_ar} أضيف إلى سلتك`,
        position: 'bottom-left',
      });
    }
  };

  return (
    <>
      <div
        className={`group relative bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col h-full ${isDisabled ? 'opacity-60 grayscale-[30%]' : ''}`}
      >
        {/* Image */}
        <div
          className="relative aspect-[4/3] overflow-hidden bg-zinc-100 cursor-pointer"
          onClick={() => setIsDetailsOpen(true)}
        >
          <img
            src={product.image_url}
            alt={product.name_ar}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />

          {/* Availability Overlay */}
          {!product.is_available && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex items-center justify-center p-2 text-center">
              <span className="bg-zinc-900 text-white px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold shadow-md -rotate-3">
                غير متوفر حالياً
              </span>
            </div>
          )}

          {/* Category Inactive Overlay */}
          {product.is_available && isCategoryInactive && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-10 flex items-center justify-center p-2 text-center">
              <span className="bg-amber-600 text-white px-3 py-1 md:px-4 md:py-1.5 rounded-full text-[10px] md:text-xs font-bold shadow-md -rotate-3">
                القسم غير متاح
              </span>
            </div>
          )}

          {/* Promotional Badge */}
          {product.is_available && !isCategoryInactive && (product.badge || product.is_best_seller) && (
            <div className="absolute top-2 right-2 md:top-3 md:right-3 z-10">
              <span className="bg-amber-400 text-stone-950 font-black text-[10px] md:text-xs px-2.5 py-0.5 md:px-3 md:py-1 rounded-full shadow-sm tracking-tight">
                {product.badge ? product.badge.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() : 'الأكثر طلباً'}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-3 sm:p-4 flex flex-col flex-grow">
          {/* Product Name — forced Sans-Serif for English glyphs */}
          <h3
            className="font-black text-sm md:text-base text-zinc-900 line-clamp-1 cursor-pointer group-hover:text-red-700 transition-colors mb-0.5"
            style={{ fontFamily: "'Inter', 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
            onClick={() => setIsDetailsOpen(true)}
            title={product.name_ar}
          >
            {product.name_ar}
          </h3>

          {/* Description */}
          {product.description_ar && (
            <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-3 flex-grow">
              {product.description_ar}
            </p>
          )}

          {/* Footer: Price + Action Button */}
          <div className="pt-2 border-t border-zinc-50 flex items-center justify-between gap-2 mt-auto">
            {/* Price */}
            <div className="flex items-baseline gap-1">
              <span className="text-red-600 font-extrabold text-base md:text-lg tracking-tight">
                {product.price}
              </span>
              <span className="text-xs text-zinc-500 font-medium">ج.م</span>
            </div>

            {/* Action Button */}
            <button
              onClick={handleAddToCart}
              disabled={isDisabled || isLoadingOptionGroups}
              className={`h-8 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all active:scale-95
                ${!isDisabled && !isLoadingOptionGroups
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-200'
                  : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                }`}
              aria-label={`أضف ${product.name_ar} للسلة`}
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>
                {isLoadingOptionGroups
                  ? '...'
                  : hasOptions
                    ? 'تخصيص'
                    : 'أضف'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Product Details & Customization Bottom Sheet Modal */}
      <ProductDetailsModal
        product={product}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
      />
    </>
  );
};
