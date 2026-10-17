import type { Product, GlobalSettings, OptionGroup } from '../store/useStore';

export type SyncEventInput =
  | { type: 'PRODUCT_AVAILABILITY_CHANGED'; productId: string; is_available: boolean }
  | { type: 'PRODUCT_UPDATED'; productId: string; data: Partial<Product> }
  | { type: 'GLOBAL_SETTINGS_CHANGED'; settings: Partial<GlobalSettings> }
  | { type: 'OPTIONS_UPDATED'; optionGroups: OptionGroup[] }
  | { type: 'ORDER_EVENT_NOTIFICATION'; orderId: string; action: 'created' | 'status_changed' }
  | { type: 'ORDER_CREATED'; order: any }
  | { type: 'ORDER_STATUS_CHANGED'; orderId: string; status: any }
  | { type: 'FORCE_REFRESH' };

export type SyncEvent = SyncEventInput & { timestamp: number };

const CHANNEL_NAME = 'sushi_grill_live_sync';
const STORAGE_KEY = 'sushi_grill_sync_event';

let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (err) {
    console.warn('[Sync] BroadcastChannel not available:', err);
  }
}

/**
 * Broadcast an event to all other tabs/windows in the same browser
 */
export function broadcastSyncEvent(event: SyncEventInput): void {
  const fullEvent: SyncEvent = {
    ...event,
    timestamp: Date.now(),
  } as SyncEvent;

  // 1. BroadcastChannel (modern, instant, zero storage overhead)
  if (channel) {
    try {
      channel.postMessage(fullEvent);
    } catch (err) {
      console.warn('[Sync] Failed to postMessage on BroadcastChannel:', err);
    }
  }

  // 2. LocalStorage event fallback (triggers storage event in other same-origin tabs)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullEvent));
    } catch {
      // Ignore storage quota or disabled storage errors
    }
  }
}

/**
 * Subscribe to sync events sent from other tabs
 */
export function subscribeToSyncEvents(listener: (event: SyncEvent) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // Handle BroadcastChannel messages
  const handleMessage = (e: MessageEvent<SyncEvent>) => {
    if (e.data && e.data.type) {
      listener(e.data);
    }
  };

  if (channel) {
    channel.addEventListener('message', handleMessage);
  }

  // Handle storage event (fallback / multi-tab)
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed: SyncEvent = JSON.parse(e.newValue);
        if (parsed && parsed.type) {
          listener(parsed);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    if (channel) {
      channel.removeEventListener('message', handleMessage);
    }
    window.removeEventListener('storage', handleStorage);
  };
}
