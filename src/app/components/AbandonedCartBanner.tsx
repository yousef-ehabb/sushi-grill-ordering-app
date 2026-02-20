import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, X, Clock } from 'lucide-react';

interface AbandonedCartBannerProps {
    isVisible: boolean;
    onOpenCart: () => void;
    onDismiss: () => void;
}

export const AbandonedCartBanner: React.FC<AbandonedCartBannerProps> = ({
    isVisible,
    onOpenCart,
    onDismiss,
}) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -100, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                    className="fixed top-4 left-4 right-4 z-[80] max-w-md mx-auto"
                    dir="rtl"
                >
                    <div className="bg-slate-900 text-white rounded-2xl shadow-2xl shadow-black/40 p-4 flex items-center gap-4 border border-slate-700">
                        {/* Icon */}
                        <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-red-400 animate-pulse" />
                        </div>

                        {/* Text */}
                        <div className="flex-grow min-w-0">
                            <p className="font-bold text-white text-sm leading-snug">
                                هو إحنا زعلناك؟ 😅
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5 leading-snug">
                                السوشي لسه مستنيك في الكارت… نكمّل ولا إيه؟
                            </p>
                        </div>

                        {/* CTA */}
                        <button
                            onClick={() => {
                                onDismiss();
                                onOpenCart();
                            }}
                            className="shrink-0 bg-primary hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-red-600/30"
                        >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            اطلب الآن
                        </button>

                        {/* Dismiss */}
                        <button
                            onClick={onDismiss}
                            className="shrink-0 p-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                            aria-label="إغلاق"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
