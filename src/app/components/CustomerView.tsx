import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { ProductCard } from './ProductCard';
import { Search, Flame, Loader2, UtensilsCrossed } from 'lucide-react';

export const CustomerView: React.FC = () => {
  const { categories, products, fetchCategories, fetchProducts, fetchBusinessRules } = useStore();
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isManualScroll, setIsManualScroll] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchCategories(), fetchProducts(), fetchBusinessRules()]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // Set initial active category
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0].id);
    }
  }, [categories]);

  // Scroll Spy Logic
  useEffect(() => {
    if (isManualScroll || searchQuery) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible sections
        const visibleSections = entries.filter((entry) => entry.isIntersecting);

        if (visibleSections.length > 0) {
          // If multiple sections are visible, prioritizing the one closest to the top-center
          // logic: find the one with the highest intersection ratio
          const target = visibleSections.reduce((prev, current) => {
            return (prev.intersectionRatio > current.intersectionRatio) ? prev : current;
          });

          setActiveCategory(target.target.id);
        }
      },
      {
        // rootMargin: '-140px 0px -70% 0px'
        // Top: -140px (accounts for sticky headers)
        // Bottom: -70% (focus detection on the top portion of the screen)
        rootMargin: '-140px 0px -70% 0px',
        threshold: [0, 0.1, 0.5]
      }
    );

    categories.forEach((cat) => {
      const element = document.getElementById(cat.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [categories, isManualScroll, searchQuery]);

  const handleCategoryClick = (categoryId: string) => {
    setIsManualScroll(true);
    setActiveCategory(categoryId);
    const element = document.getElementById(categoryId);
    if (element) {
      // Offset by header (approx 140px)
      const offset = 140;
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({
        top: elementPosition - offset,
        behavior: 'smooth'
      });

      // Reset manual scroll lock after animation
      setTimeout(() => setIsManualScroll(false), 1000);
    }
  };

  const filteredProducts = products.filter((product) => {
    if (!searchQuery) return true;
    return product.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.name_en.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Only show active categories
  const activeCategories = categories.filter(c => c.is_active);

  const bestSellers = products.filter(p => p.is_best_seller && p.is_available);

  return (
    <div className="pb-24 min-h-[60vh]" dir="rtl">

      {/* Search Bar - Not Sticky */}
      <div className="py-6 px-4">
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="ابحث عن وجبتك المفضلة..."
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 pr-12 pl-4 focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none shadow-sm text-slate-900 placeholder:text-slate-400 font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Navbar - Sticky */}
      {!searchQuery && (
        <div className="sticky top-[72px] z-40 bg-slate-50/95 backdrop-blur-xl border-b border-slate-200/50 shadow-sm py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 transition-all">
          <div className="max-w-7xl mx-auto">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x px-1">
              {activeCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`
                    whitespace-nowrap px-6 py-2.5 rounded-xl font-bold transition-all border snap-start duration-300
                    ${activeCategory === cat.id
                      ? 'bg-secondary text-white border-secondary shadow-lg shadow-secondary/20 scale-105'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary hover:bg-red-50'
                    }
                  `}
                >
                  {cat.name_ar}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-12">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-slate-500 font-medium text-lg">جاري تحميل المنيو الشهي...</p>
          </div>
        ) : searchQuery ? (
          // Search Results View
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Search className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-black text-slate-900">نتائج البحث</h2>
              <span className="text-sm font-bold bg-slate-200 px-2 py-1 rounded-md text-slate-600">
                {filteredProducts.length}
              </span>
            </div>

            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProducts.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
                <div className="inline-flex bg-slate-50 p-4 rounded-full mb-4">
                  <Search className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">لم نجد ما تبحث عنه</h3>
                <p className="text-slate-500">جرب البحث بكلمات أخرى</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 text-primary font-bold hover:underline"
                >
                  عرض كل المنيو
                </button>
              </div>
            )}
          </section>
        ) : (
          // Categorized View
          <>
            {activeCategories.map((category) => {
              const categoryProducts = products.filter(p => p.category_id === category.id);
              if (categoryProducts.length === 0) return null;

              return (
                <section
                  key={category.id}
                  id={category.id}
                  className="scroll-mt-[180px] bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm transition-all hover:shadow-md hover:border-slate-200"
                >
                  <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-4">
                    <div className="w-1.5 h-8 bg-primary rounded-full"></div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900">
                      {category.name_ar}
                    </h2>
                    <span className="text-sm font-bold bg-slate-50 text-slate-400 px-3 py-1 rounded-full border border-slate-100">
                      {categoryProducts.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {categoryProducts.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
