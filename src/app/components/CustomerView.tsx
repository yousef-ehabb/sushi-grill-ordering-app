import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { ProductCard } from './ProductCard';
import { restaurantConfig } from '../../config/restaurant';
import { Loader2, UtensilsCrossed, Phone } from 'lucide-react';

export const CustomerView: React.FC = () => {
  const { categories, products, fetchCategories, fetchProducts, fetchBusinessRules } = useStore();
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isManualScroll, setIsManualScroll] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      // Safeguard: 5-second timeout so user never gets stuck
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000));
      await Promise.race([
        Promise.all([fetchCategories(), fetchProducts(), fetchBusinessRules()]),
        timeoutPromise,
      ]);
      if (isMounted) setIsLoading(false);
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Set initial active category
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories]);

  // Scroll Spy Logic
  useEffect(() => {
    if (isManualScroll) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible sections
        const visibleSections = entries.filter((entry) => entry.isIntersecting);

        if (visibleSections.length > 0) {
          const target = visibleSections.reduce((prev, current) => {
            return (prev.intersectionRatio > current.intersectionRatio) ? prev : current;
          });

          setActiveCategory(target.target.id);

          // Gently ensure the active category tab is in view in the horizontal scrollbar
          const tabElement = document.getElementById(`tab-${target.target.id}`);
          if (tabElement) {
            tabElement.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
          }
        }
      },
      {
        rootMargin: '-100px 0px -60% 0px',
        threshold: [0, 0.1, 0.5]
      }
    );

    categories.forEach((cat) => {
      const element = document.getElementById(cat.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [categories, isManualScroll]);

  const handleCategoryClick = (categoryId: string) => {
    setIsManualScroll(true);
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      // Offset by header + category bar (mobile: ~125px, desktop: ~155px)
      const isMobile = window.innerWidth < 768;
      const offset = isMobile ? 125 : 155;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
      });

      // Center active tab horizontally in the bar
      const tabElement = document.getElementById(`tab-${categoryId}`);
      if (tabElement) {
        tabElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }

      // Reset manual scroll lock after animation
      setTimeout(() => setIsManualScroll(false), 800);
    }
  };

  // Only show active categories
  const activeCategories = categories.filter(c => c.is_active);

  return (
    <div className="min-h-[60vh]" dir="rtl">

      {/* Category Pills - Neatly inside the white section */}
      <div className="sticky top-[58px] sm:top-[64px] md:top-[72px] z-30 bg-white/95 backdrop-blur-md border-b border-zinc-100 py-3 mb-4 -mx-4 px-4 transition-all">
        <div className="max-w-7xl mx-auto">
          <div className="flex gap-2 sm:gap-2.5 overflow-x-auto scrollbar-none snap-x py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                id={`tab-${cat.id}`}
                onClick={() => handleCategoryClick(cat.id)}
                className={`
                  whitespace-nowrap px-4 py-2 sm:px-5 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm transition-all border snap-start duration-200 shrink-0
                  ${activeCategory === cat.id
                    ? 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-600/30'
                    : 'bg-zinc-100 text-zinc-700 border-zinc-200/80 hover:bg-zinc-200 hover:text-zinc-900'
                  }
                `}
              >
                {cat.name_ar}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Product Grid Container */}
      <div className="max-w-7xl mx-auto pb-12 pt-2 md:pt-4 space-y-6 md:space-y-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            <p className="text-zinc-500 font-medium text-sm md:text-base">جاري تحميل المنيو الشهي...</p>
          </div>
        ) : (
          // Categorized View
          products.length > 0 ? (
            <>
              {activeCategories.map((category) => {
                const categoryProducts = products.filter(p => p.category_id === category.id);
                if (categoryProducts.length === 0) return null;

                return (
                  <section
                    key={category.id}
                    id={category.id}
                    className="scroll-mt-[125px] md:scroll-mt-[155px]"
                  >
                    <div className="flex items-center gap-2.5 md:gap-3 mb-4 md:mb-6 border-b border-zinc-100 pb-3 md:pb-4">
                      <div className="w-1.5 h-6 md:h-7 bg-red-600 rounded-full"></div>
                      <h2 className="text-lg sm:text-xl md:text-2xl font-black text-zinc-900">
                        {category.name_ar}
                      </h2>
                      <span className="text-xs sm:text-sm font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 md:px-3 md:py-1 rounded-full border border-amber-200/80">
                        {categoryProducts.length} أصناف
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                      {categoryProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </>
          ) : (
            <div className="col-span-full py-16 px-6 text-center bg-white rounded-3xl border border-zinc-200 shadow-sm">
              <div className="inline-flex bg-red-50 p-4 rounded-full mb-4">
                <UtensilsCrossed className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">القائمة قيد التحديث</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-6">
                نسعد بخدمتكم وتجهيز طلباتكم. يمكنك الاتصال بنا مباشرة لمعرفة أحدث العروض والطلبات السريعة.
              </p>
              <div className="flex justify-center gap-3">
                <a
                  href={`tel:${restaurantConfig.contact.primaryPhone}`}
                  className="bg-primary hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  اتصل بنا ({restaurantConfig.contact.primaryPhone})
                </a>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
