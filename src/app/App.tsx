import React, { useState, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { CustomerView } from './components/CustomerView';
import { AdminView } from './components/AdminView';
import { AdminLogin } from './components/AdminLogin';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CartSidebar } from './components/CartSidebar';
import { CheckoutModal } from './components/CheckoutModal';
import { RegisterPage } from './components/auth/RegisterPage';
import { LoginPage } from './components/auth/LoginPage';
import { AccountPage } from './components/auth/AccountPage';
import { OrderDetailPage } from './components/auth/OrderDetailPage';
import { AuthGuard } from './components/auth/AuthGuard';
import { ActiveOrderModal } from './components/ActiveOrderModal';
import { useStore } from './store/useStore';
import { useAuthStore } from './store/useAuthStore';
import { restaurantConfig } from '../config/restaurant';
import { ShoppingBag, UtensilsCrossed, Phone, XCircle, User, LogIn, ClipboardList, MapPin, Flame } from 'lucide-react';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

const CustomerLayout: React.FC = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isActiveOrderOpen, setIsActiveOrderOpen] = useState(false);
  const { cart, globalSettings, fetchGlobalSettings, activeOrder, fetchActiveOrder } = useStore();
  const { isAuthenticated, user, initSession } = useAuthStore();
  const isOpen = globalSettings?.is_website_open ?? true;
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    initSession();
  }, []);

  React.useEffect(() => {
    fetchGlobalSettings();
  }, []);

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Poll active order for header badge
  useEffect(() => {
    if (!isAuthenticated) return;
    fetchActiveOrder();
    const interval = setInterval(fetchActiveOrder, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 font-['Thmanyah_Serif_Display','29LT_Azahar','IBM_Plex_Sans_Arabic',sans-serif] selection:bg-red-100 selection:text-red-900" dir="rtl">
      <Toaster position="top-center" expand={true} richColors theme="light" />

      {/* Closed Overlay */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, type: 'spring' }}
              className="text-center max-w-md"
            >
              <div className="w-20 h-20 mx-auto mb-6 bg-red-500/10 rounded-full flex items-center justify-center ring-8 ring-red-500/5">
                <XCircle className="w-10 h-10 text-red-400" />
              </div>
              <h2 className="text-3xl font-black text-white mb-3">المطعم مغلق</h2>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                {globalSettings?.closed_message || restaurantConfig.ordering.closedMessage}
              </p>
              <div className="inline-flex items-center gap-3">
                <div className="w-12 h-12 bg-white p-1 rounded-xl shadow-lg flex items-center justify-center">
                  <Flame className="w-8 h-8 text-primary fill-primary" />
                </div>
                <span className="text-white font-bold text-xl">{restaurantConfig.brand.nameAr}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/95 backdrop-blur-md shadow-sm py-2.5 px-4 sm:px-6 md:px-8 border-b border-zinc-100'
            : 'bg-gradient-to-b from-black/90 via-black/50 to-transparent py-3.5 px-4 sm:px-6 md:px-8'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo - Clearly visible, sharp, no awkward circular clip */}
          <Link
            to="/"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center group transition-transform active:scale-95 focus:outline-none py-0.5"
            aria-label={restaurantConfig.brand.nameAr}
          >
            <img
              src={restaurantConfig.brand.logoUrl}
              alt={restaurantConfig.brand.nameAr}
              className="h-10 md:h-12 w-auto object-contain transition-transform group-hover:scale-105 drop-shadow-md"
            />
          </Link>

          {/* Actions - Clean spacing for cart, account, phone */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            {/* Phone Button */}
            <a
              href={`tel:${restaurantConfig.contact.primaryPhone}`}
              className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl transition-all ${
                isScrolled
                  ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm border border-white/15'
              }`}
              aria-label="اتصل بنا"
            >
              <Phone className="w-4 h-4 text-amber-400" />
            </a>

            {/* Active Order Pill if active */}
            {isAuthenticated && activeOrder && (
              <button
                onClick={() => setIsActiveOrderOpen(true)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                  isScrolled
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-amber-400/20 text-amber-300 border border-amber-400/40 backdrop-blur-md'
                }`}
                aria-label="متابعة طلبي"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="hidden sm:inline">طلبك نشط</span>
              </button>
            )}

            {/* Auth Button */}
            {isAuthenticated ? (
              <Link
                to="/account"
                className={`flex items-center gap-1.5 font-bold text-xs sm:text-sm h-9 px-3 sm:h-10 sm:px-3.5 rounded-xl transition-all ${
                  isScrolled
                    ? 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                    : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm border border-white/15'
                }`}
                aria-label="حسابي"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">{user?.name?.split(' ')[0] || 'حسابي'}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className={`flex items-center gap-1.5 font-bold text-xs sm:text-sm h-9 px-3 sm:h-10 sm:px-3.5 rounded-xl transition-all ${
                  isScrolled
                    ? 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                    : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm border border-white/15'
                }`}
                aria-label="تسجيل الدخول"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">دخول</span>
              </Link>
            )}

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative group bg-red-600 hover:bg-red-700 text-white w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/30 transition-all active:scale-95"
              aria-label="سلة المشتريات"
            >
              <ShoppingBag className="w-4.5 h-4.5 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
              <AnimatePresence>
                {totalItems > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    key={totalItems}
                    className="absolute -top-1.5 -right-1.5 bg-zinc-950 text-white text-[10px] sm:text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-xs"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </nav>

      {/* Spacious & Cinematic Hero Section */}
      <div className="relative w-full overflow-hidden min-h-[55vh] py-16 md:py-24 flex flex-col justify-center items-center text-center pt-28 pb-16 sm:pt-32 sm:pb-20">
        {/* Real Restaurant Photo with Rich Cinematic Vignette */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={restaurantConfig.brand.heroImageUrl}
            alt={restaurantConfig.brand.nameAr}
            className="w-full h-full object-cover object-center"
          />
          {/* Deep crimson and dark tone blend */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-red-950/75 to-black/80" />
        </div>

        <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center max-w-2xl mx-auto"
          >
            {/* Status Badge with subtle glow */}
            {isOpen && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 border border-white/20 text-white text-xs sm:text-sm font-semibold mb-2 backdrop-blur-md shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                </span>
                <span>مفتوح الآن للطلبات والتوصيل السريع</span>
              </div>
            )}

            {/* Brand Title */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white my-3 tracking-tight leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)]">
              {restaurantConfig.brand.nameAr}
            </h1>

            {/* Subtitle */}
            <p className="text-stone-200 text-xs sm:text-base md:text-lg mb-6 sm:mb-8 max-w-lg md:max-w-2xl mx-auto font-medium leading-relaxed drop-shadow-md">
              لحم بلدي طازج يومياً وقطع دجاج مقرمشة بتتبيلات وخلطات بوشنكي الخاصة
            </p>

            {/* Action Buttons */}
            <div className="flex flex-row items-center justify-center gap-3 w-full max-w-sm sm:max-w-md mx-auto">
              <button
                onClick={() => {
                  const menuElem = document.getElementById('menu');
                  if (menuElem) {
                    const isMobile = window.innerWidth < 768;
                    const offset = isMobile ? 65 : 85;
                    const top = menuElem.getBoundingClientRect().top + window.scrollY - offset;
                    window.scrollTo({ top, behavior: 'smooth' });
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-red-950/60 transition-all hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2 border border-red-500/40 group text-sm sm:text-base"
              >
                <UtensilsCrossed className="w-4 h-4 text-white group-hover:rotate-12 transition-transform" />
                <span>اطلب الآن من المنيو</span>
              </button>

              <a
                href={`tel:${restaurantConfig.contact.primaryPhone}`}
                className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/25 hover:border-white/40 py-3 px-6 rounded-xl font-bold text-xs sm:text-sm transition-all hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-2 shadow-sm group"
              >
                <Phone className="w-4 h-4 text-stone-300 group-hover:text-white transition-colors" />
                <span>اتصل بنا</span>
              </a>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content - Curved Sheet Transition */}
      <main
        id="menu"
        className="rounded-t-[2.5rem] bg-white -mt-8 relative z-10 pt-6 px-4 shadow-xl"
      >
        <CustomerView />
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-300 py-16 px-4 mt-20 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-right">
            {/* Brand Column */}
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3">
                <img
                  src={restaurantConfig.brand.logoUrl}
                  alt={restaurantConfig.brand.nameAr}
                  className="w-12 h-12 object-contain rounded-2xl shadow-lg border-2 border-amber-400 bg-[#140606]"
                />
                <div>
                  <h3 className="text-2xl font-black text-white">{restaurantConfig.brand.nameAr}</h3>
                  <span className="text-xs font-bold text-amber-400">{restaurantConfig.brand.taglineAr}</span>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
                ساندوتشات برجر اللحم البلدي الطازج وقطع الفرايد تشيكن المقرمشة المحضرة بأعلى معايير الجودة والنظافة.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <a
                  href={restaurantConfig.social.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-900 hover:bg-primary text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-slate-800"
                >
                  Instagram: @{restaurantConfig.social.instagram}
                </a>
                <a
                  href={restaurantConfig.social.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-slate-900 hover:bg-primary text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-slate-800"
                >
                  Facebook: {restaurantConfig.social.facebook}
                </a>
              </div>
            </div>

            {/* Branches & Phone Numbers */}
            <div className="space-y-4">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                فروعنا وأرقام الطلبات
              </h3>
              <div className="space-y-3 text-sm">
                {restaurantConfig.contact.branches.map((branch) => (
                  <div key={branch.id} className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                    <span className="font-bold text-amber-400 block mb-1">{branch.name_ar}</span>
                    <div className="flex flex-wrap gap-2">
                      {branch.phones.map((phone) => (
                        <a
                          key={phone}
                          href={`tel:${phone}`}
                          className="text-slate-300 hover:text-primary transition-colors font-mono font-medium dir-ltr"
                        >
                          {phone}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Working Hours & Policies */}
            <div className="flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-white font-bold text-lg mb-2">مواعيد العمل</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  يومياً من 12:00 ظهراً حتى 02:00 صباحاً.<br />
                  خدمة التوصيل والاستلام متوفرة طوال ساعات العمل.
                </p>
              </div>
              <div className="border-t border-slate-900 pt-4 text-xs text-slate-500">
                &copy; {new Date().getFullYear()} {restaurantConfig.brand.nameAr}. جميع الحقوق محفوظة.
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CartSidebar
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
      />
      <ActiveOrderModal
        orderId={activeOrder?.id ?? null}
        isOpen={isActiveOrderOpen}
        onClose={() => setIsActiveOrderOpen(false)}
        onBrowseMenu={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<CustomerLayout />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/account"
        element={
          <AuthGuard>
            <AccountPage />
          </AuthGuard>
        }
      />
      <Route
        path="/account/orders/:orderId"
        element={
          <AuthGuard>
            <OrderDetailPage />
          </AuthGuard>
        }
      />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminView />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default App;
