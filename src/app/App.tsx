import React, { useState, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { CustomerView } from './components/CustomerView';
import { AdminView } from './components/AdminView';
import { AdminLogin } from './components/AdminLogin';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CartSidebar } from './components/CartSidebar';
import { CheckoutModal } from './components/CheckoutModal';
import { AbandonedCartBanner } from './components/AbandonedCartBanner';
import { useAbandonedCart } from './hooks/useAbandonedCart';
import { RegisterPage } from './components/auth/RegisterPage';
import { LoginPage } from './components/auth/LoginPage';
import { AccountPage } from './components/auth/AccountPage';
import { OrderDetailPage } from './components/auth/OrderDetailPage';
import { AuthGuard } from './components/auth/AuthGuard';
import { ActiveOrderModal } from './components/ActiveOrderModal';
import { useStore } from './store/useStore';
import { useAuthStore } from './store/useAuthStore';
import { ShoppingBag, UtensilsCrossed, Phone, XCircle, User, LogIn, ClipboardList } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { registerServiceWorker, subscribeToPushNotifications } from '../lib/pushNotifications';

const CustomerLayout: React.FC = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isActiveOrderOpen, setIsActiveOrderOpen] = useState(false);
  const { 
    cart, 
    globalSettings, 
    fetchGlobalSettings, 
    activeOrder, 
    fetchActiveOrder,
    syncCartToDB,
    restoreCartFromDB,
    checkAbandonedCart,
  } = useStore();
  const { isAuthenticated, user, initSession } = useAuthStore();
  const { isAbandoned, dismissAbandoned } = useAbandonedCart();
  const isOpen = globalSettings?.is_website_open ?? true;
  const [isScrolled, setIsScrolled] = useState(false);

  // Register service worker on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

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

  // Subscribe to push notifications when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      subscribeToPushNotifications(user.id).catch(console.error);
    }
  }, [isAuthenticated, user]);

  // Check for abandoned cart on mount/auth change
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const checkCart = async () => {
      const result = await checkAbandonedCart(user.id);
      if (result.hasAbandoned) {
        const restored = await restoreCartFromDB(user.id);
        if (restored) {
          toast.info('مرحباً بعودتك! لديك عناصر في سلة المشتريات', {
            description: 'تم استعادة سلة المشتريات الخاصة بك',
            duration: 5000,
            action: {
              label: 'عرض السلة',
              onClick: () => setIsCartOpen(true),
            },
          });
        }
      }
    };

    checkCart();
  }, [isAuthenticated, user]);

  // Sync cart to DB when cart changes (debounced)
  useEffect(() => {
    if (!isAuthenticated || !user || cart.length === 0) return;

    const timeoutId = setTimeout(() => {
      syncCartToDB(user.id).catch(console.error);
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timeoutId);
  }, [cart, isAuthenticated, user]);

  // Inactivity timer: Show notification if user is inactive for 30 mins with items in cart
  useEffect(() => {
    if (!isAuthenticated || !user || cart.length === 0) return;

    let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();

    const resetTimer = () => {
      lastActivity = Date.now();
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        const inactiveMinutes = (Date.now() - lastActivity) / (1000 * 60);
        if (inactiveMinutes >= 5) {
          toast.warning('السوشي بيقولك فينّك؟', {
            description: 'السوشي لسه مستنيك في الكارت… نكمّل ولا إيه؟',
            duration: 8000,
            action: {
              label: 'عرض السلة',
              onClick: () => setIsCartOpen(true),
            },
          });
        }
      }, 5 * 60 * 1000); // 5 minutes
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [isAuthenticated, user, cart.length]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-50 font-['IBM Plex Sans Arabic'] selection:bg-red-100 selection:text-red-900" dir="rtl">
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
                {globalSettings?.closed_message || 'المطعم مغلق حالياً ❤️'}
              </p>
              <div className="inline-flex items-center gap-3">
                <div className="w-12 h-12 bg-white p-1 rounded-xl shadow-lg">
                  <img src="/logo.jpg" alt="Logo" className="w-full h-full object-contain rounded-lg" />
                </div>
                <span className="text-white font-bold text-xl">سوشي أند جريل</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-2' : 'bg-transparent py-4'
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className={`relative transition-all duration-300 ${isScrolled ? 'w-10 h-10' : 'w-14 h-14'} bg-white rounded-2xl shadow-lg p-1`}>
              <img src="/logo.jpg" alt="Sushi & Grill" className="w-full h-full object-contain rounded-xl" />
            </div>
            <div className={`flex flex-col gap-1 ${isScrolled ? 'opacity-100' : 'text-white drop-shadow-lg'}`}>
              <span className={`font-black tracking-tighter leading-none transition-all duration-300 ${isScrolled ? 'text-slate-900 text-xl' : 'text-white text-3xl'}`}>سوشي أند جريل</span>
              <span className={`text-sm font-medium tracking-wide ${isScrolled ? 'text-slate-500' : 'text-white/90'}`}>المذاق الأصلي</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 md:gap-3">
            <a
              href="tel:01141638005"
              className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${isScrolled
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/20'
                }`}
              aria-label="اتصل بنا"
            >
              <Phone className="w-4 h-4" />
            </a>

            {/* Auth Button */}
            {isAuthenticated ? (
              <Link
                to="/account"
                className={`flex items-center gap-2 font-bold text-sm px-4 py-2.5 rounded-full transition-all ${isScrolled
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/20'
                  }`}
              >
                <User className="w-4 h-4" />
                <span className="hidden md:inline max-w-[80px] truncate">{user?.name?.split(' ')[0] || 'حسابي'}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className={`flex items-center gap-2 font-bold text-sm px-4 py-2.5 rounded-full transition-all ${isScrolled
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/20'
                  }`}
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden md:inline">دخول</span>
              </Link>
            )}

            {/* My Orders Icon */}
            {isAuthenticated && (
              <button
                onClick={() => setIsActiveOrderOpen(true)}
                className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all ${isScrolled
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/20'
                  }`}
                aria-label="طلباتي"
              >
                <ClipboardList className="w-4.5 h-4.5" />
                <AnimatePresence>
                  {activeOrder && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${activeOrder.status === 'new' ? 'bg-blue-500'
                        : activeOrder.status === 'preparing' ? 'bg-amber-500'
                          : activeOrder.status === 'ready' ? 'bg-emerald-500'
                            : 'bg-purple-500'
                        }`}
                    />
                  )}
                </AnimatePresence>
              </button>
            )}

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative group bg-primary hover:bg-red-700 text-white p-3 rounded-full shadow-lg shadow-red-500/20 transition-all active:scale-95"
            >
              <ShoppingBag className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <AnimatePresence>
                {totalItems > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    key={totalItems}
                    className="absolute -top-1 -right-1 bg-slate-900 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative h-[60vh] md:h-[70vh] w-full overflow-hidden bg-slate-900">
        <div className="absolute inset-0">
          <img
            src="/hero-1.png"
            alt="Sushi Platters"
            className="w-full h-full object-cover object-center opacity-60 scale-105 animate-[kenburns_20s_infinite_alternate]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
        </div>

        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            {isOpen && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-200 text-sm font-medium mb-4 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                مفتوح الآن للطلبات
              </div>
            )}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-4 leading-tight">
              طعم <span className="text-primary">السوشي</span> الحقيقي<br />
              والمشويات المميزة
            </h1>
            <p className="text-slate-300 text-lg md:text-xl mb-8 max-w-xl leading-relaxed">
              استمتع بأشهى أطباق السوشي والمشويات المحضرة يومياً من أجود المكونات الطازجة. اطلب الآن واكتشف المذاق الفريد.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}
                className="bg-primary hover:bg-red-700 text-white px-8 py-3.5 rounded-xl font-bold text-lg shadow-xl shadow-red-600/20 transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-2"
              >
                <UtensilsCrossed className="w-5 h-5" />
                تصفح المنيو
              </button>
              <a
                href="tel:01141638005"
                className="bg-white/10 hover:bg-white/20 text-white backdrop-blur-md border border-white/20 px-8 py-3.5 rounded-xl font-bold text-lg transition-all hover:-translate-y-1 active:scale-95"
              >
                اتصل بنا
              </a>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <main id="menu" className="relative z-10 -mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <CustomerView />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-300 py-16 px-4 mt-20 border-t border-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-center text-center md:text-right">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3">
                <div className="w-12 h-12 bg-white p-1 rounded-xl shadow-lg">
                  <img src="/logo.jpg" alt="Logo" className="w-full h-full object-contain rounded-lg" />
                </div>
                <span className="text-2xl font-bold text-white">سوشي أند جريل</span>
              </div>
              <p className="text-sm leading-relaxed max-w-xs mx-auto md:mx-0">
                نقدم لكم أجود أنواع السوشي والمأكولات البحرية. جودة عالمية وطعم لا يقاوم في كل قطعة.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-white font-bold text-lg">تواصل معنا</h3>
              <div className="flex flex-col gap-2 items-center md:items-start text-sm">
                <span className="hover:text-primary transition-colors cursor-pointer">01141638005</span>
                <span className="hover:text-primary transition-colors cursor-pointer">info@sushiandgrill.com</span>
                <span>يومياً من 12 ظهراً حتى 12 منتصف الليل</span>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-4">
              <a href="#" className="text-sm font-medium hover:text-white transition-colors">سياسة الخصوصية</a>
              <a href="#" className="text-sm font-medium hover:text-white transition-colors">الشروط والأحكام</a>
              <span className="text-xs text-slate-500 mt-4">&copy; {new Date().getFullYear()} جميع الحقوق محفوظة.</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Abandoned Cart Banner */}
      <AbandonedCartBanner
        isVisible={isAbandoned}
        onOpenCart={() => setIsCartOpen(true)}
        onDismiss={dismissAbandoned}
      />

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
