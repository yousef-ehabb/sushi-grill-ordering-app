// Push Notification Utilities
// Handles browser push notification subscription and management

import { insforge } from './insforge';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// VAPID public key (you'll need to generate this - see setup instructions)
// For MVP, we'll use a placeholder. In production, generate VAPID keys.
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    console.warn('Notification permission denied');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

/**
 * Convert base64 URL-safe string to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(
  userId: string
): Promise<PushSubscriptionData | null> {
  try {
    // Check if service worker is supported
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return null;
    }

    // Request permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('Notification permission not granted');
      return null;
    }

    // Register service worker
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Extract subscription data
    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))
        ),
        auth: btoa(
          String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))
        ),
      },
    };

    // Save subscription to database
    const { error } = await insforge.database.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,endpoint',
      }
    );

    if (error) {
      console.error('Failed to save push subscription:', error);
      return null;
    }

    return subscriptionData;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(
  userId: string
): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();
    }

    // Remove from database
    const { error } = await insforge.database
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to remove push subscription:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
    return false;
  }
}

/**
 * Check if user has push notifications enabled
 */
export async function hasPushSubscription(userId: string): Promise<boolean> {
  try {
    const { data, error } = await insforge.database
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (error) {
      console.error('Failed to check push subscription:', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error('Error checking push subscription:', error);
    return false;
  }
}

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('Service Worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

