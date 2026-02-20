import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';

const ABANDON_MS = 5 * 60 * 1000; // 5 minutes

export function useAbandonedCart() {
    const cart = useStore((s) => s.cart);
    const [isAbandoned, setIsAbandoned] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const permissionRequestedRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const requestNotificationPermission = useCallback(async () => {
        if (permissionRequestedRef.current) return;
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        permissionRequestedRef.current = true;
    }, []);

    const fireNotification = useCallback(() => {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        new Notification('هو إحنا زعلناك؟ 😅', {
            body: 'السوشي لسه مستنيك في الكارت… نكمّل ولا إيه؟',
            icon: '/logo.jpg',
            badge: '/logo.jpg',
            tag: 'abandoned-cart',
        });
    }, []);

    useEffect(() => {
        clearTimer();
        setIsAbandoned(false);

        if (cart.length === 0) return;

        // Ask for permission once
        requestNotificationPermission();

        timerRef.current = setTimeout(() => {
            setIsAbandoned(true);
            fireNotification();
        }, ABANDON_MS);

        return clearTimer;
    }, [cart, clearTimer, requestNotificationPermission, fireNotification]);

    const dismissAbandoned = useCallback(() => {
        setIsAbandoned(false);
    }, []);

    return { isAbandoned, dismissAbandoned };
}
