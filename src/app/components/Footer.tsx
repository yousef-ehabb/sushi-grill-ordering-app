import React from 'react';
import { Phone, Clock, MapPin, Truck } from 'lucide-react';
import { restaurantConfig } from '../../config/restaurant';
import { useStore } from '../store/useStore';

const FacebookIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

export const Footer: React.FC = () => {
  const { globalSettings } = useStore();
  const isStoreOpen = globalSettings ? globalSettings.is_website_open : restaurantConfig.ordering.isOpen;

  return (
    <footer className="bg-[#0c0a09] text-zinc-300 border-t-2 border-red-700/40 relative z-10" dir="rtl">
      {/* 3-Column Responsive Grid */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-right">
          
          {/* Column 1 (Brand & Identity) */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3">
              <img
                src={restaurantConfig.brand.logoUrl}
                alt={restaurantConfig.brand.nameAr}
                className="w-13 h-13 object-contain rounded-2xl shadow-md border border-amber-400/40 bg-[#160a0a] p-1 shrink-0"
              />
              <div>
                <h3 className="text-xl font-black text-white tracking-tight">
                  {restaurantConfig.brand.nameAr}
                </h3>
                <span className="text-xs font-bold text-amber-400">
                  {restaurantConfig.brand.taglineAr}
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-sm">
              ساندوتشات برجر اللحم البلدي المشوي الطازج والفرايد تشيكن المقرمشة المحضرة بأعلى معايير الجودة والنظافة.
            </p>

            {/* Circular Social Buttons with subtle red glow */}
            <div className="flex items-center gap-3 pt-1">
              <a
                href={restaurantConfig.social.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-[#DC2626] hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer group"
                aria-label="Facebook"
              >
                <FacebookIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
              </a>
              <a
                href={restaurantConfig.social.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-[#DC2626] hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer group"
                aria-label="Instagram"
              >
                <InstagramIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
              </a>
            </div>
          </div>

          {/* Column 2 (Branches & Orders) */}
          <div className="space-y-4">
            <h4 className="text-white font-black text-base flex items-center gap-2">
              <MapPin className="w-4.5 h-4.5 text-[#DC2626]" />
              فروعنا وأرقام الطلبات
            </h4>

            <div className="space-y-3">
              {restaurantConfig.contact.branches.map((branch) => (
                <div
                  key={branch.id}
                  className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-3.5 space-y-2 hover:border-zinc-700/80 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm text-zinc-200">
                      {branch.name_ar}
                    </span>
                    {branch.is_main && (
                      <span className="text-[10px] bg-red-950/80 text-red-400 border border-red-900/50 px-2 py-0.5 rounded-full font-bold">
                        الفرع الرئيسي
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {branch.phones.map((phone) => (
                      <a
                        key={phone}
                        href={`tel:${phone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-[#DC2626] text-zinc-200 hover:text-white transition-all text-xs font-mono font-bold border border-zinc-700/60 hover:border-red-600 shadow-xs active:scale-95 cursor-pointer dir-ltr"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{phone}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3 (Working Hours & Delivery) */}
          <div className="space-y-4">
            <h4 className="text-white font-black text-base flex items-center gap-2">
              <Clock className="w-4.5 h-4.5 text-[#DC2626]" />
              مواعيد العمل
            </h4>

            <div className="space-y-3">
              {/* Daily Working Hours Badge Card */}
              <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-300">ساعات العمل اليومية</span>
                  <span className="text-[11px] font-black text-amber-400 bg-amber-950/60 border border-amber-900/50 px-2 py-0.5 rounded-lg">
                    يومياً
                  </span>
                </div>
                <div className="font-mono text-sm font-bold text-zinc-100 dir-ltr text-right">
                  12:00 PM – 02:00 AM
                </div>
                <p className="text-[11px] text-zinc-400">
                  من 12:00 ظهراً حتى 02:00 صباحاً
                </p>
              </div>

              {/* Delivery Info & Dynamic Operational Badge */}
              <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-bold">
                    <Truck className="w-4 h-4 text-[#DC2626]" />
                    <span>خدمة التوصيل والاستلام</span>
                  </div>

                  {/* Dynamic Live Status Indicator */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                      isStoreOpen
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isStoreOpen ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                      }`}
                    />
                    {isStoreOpen ? 'مفتوح الآن' : 'مغلق حالياً'}
                  </span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  خدمة التوصيل السريع لجميع المناطق والاستلام متوفرة طوال ساعات العمل.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Copyright Bar */}
      <div className="border-t border-zinc-800/80 py-4 text-xs text-zinc-500 text-center px-4">
        &copy; {new Date().getFullYear()} {restaurantConfig.brand.nameAr}. جميع الحقوق محفوظة.
      </div>
    </footer>
  );
};
