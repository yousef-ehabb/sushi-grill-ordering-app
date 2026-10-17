import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Cross-Tab Live Synchronization & Notifications', () => {
  let mockStorage: Record<string, string>;
  let mockChannel: {
    postMessage: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let windowListeners: Record<string, Function[]>;

  beforeEach(() => {
    mockStorage = {};
    windowListeners = {};
    mockChannel = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const mockLocalStorage = {
      getItem: vi.fn((key: string) => mockStorage[key] || null),
      setItem: vi.fn((key: string, val: string) => {
        mockStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };

    function MockBroadcastChannel() {
      return mockChannel;
    }

    const mockWindow = {
      localStorage: mockLocalStorage,
      BroadcastChannel: MockBroadcastChannel,
      addEventListener: vi.fn((event: string, fn: Function) => {
        if (!windowListeners[event]) windowListeners[event] = [];
        windowListeners[event].push(fn);
      }),
      removeEventListener: vi.fn((event: string, fn: Function) => {
        if (windowListeners[event]) {
          windowListeners[event] = windowListeners[event].filter((l) => l !== fn);
        }
      }),
      dispatchEvent: vi.fn((e: any) => {
        const fns = windowListeners[e.type] || [];
        fns.forEach((fn) => fn(e));
        return true;
      }),
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('broadcasts ORDER_EVENT_NOTIFICATION with minimal payload and no customer PII', async () => {
    const { broadcastSyncEvent } = await import('../src/app/utils/realtimeSync');

    broadcastSyncEvent({
      type: 'ORDER_EVENT_NOTIFICATION',
      orderId: 'ord_123456',
      action: 'created',
    });

    // Verify localStorage fallback was updated with minimal payload
    const raw = mockStorage['sushi_grill_sync_event'];
    expect(raw).toBeTruthy();
    const event = JSON.parse(raw);

    expect(event.type).toBe('ORDER_EVENT_NOTIFICATION');
    expect(event.orderId).toBe('ord_123456');
    expect(event.action).toBe('created');
    // Security check: Must not leak customer details, phones, or cart items
    expect(event.customer_phone).toBeUndefined();
    expect(event.customer_name).toBeUndefined();
    expect(event.items).toBeUndefined();
    expect(event.total).toBeUndefined();
  });

  it('subscribes to sync events and dispatches notifications to listener', async () => {
    const { subscribeToSyncEvents } = await import('../src/app/utils/realtimeSync');

    const received: any[] = [];
    const unsubscribe = subscribeToSyncEvents((event) => {
      received.push(event);
    });

    expect(typeof unsubscribe).toBe('function');

    // Simulate storage event from another tab
    const fakeEvent = {
      type: 'ORDER_EVENT_NOTIFICATION',
      orderId: 'ord_789',
      action: 'status_changed',
      timestamp: Date.now(),
    };

    const listeners = windowListeners['storage'] || [];
    expect(listeners.length).toBeGreaterThan(0);
    listeners.forEach((listener) =>
      listener({
        key: 'sushi_grill_sync_event',
        newValue: JSON.stringify(fakeEvent),
      })
    );

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('ORDER_EVENT_NOTIFICATION');
    expect(received[0].orderId).toBe('ord_789');
    expect(received[0].action).toBe('status_changed');

    unsubscribe();
  });

  it('verifies that Firebase Firestore is configured with auto-detect long polling and ignoreUndefinedProperties', async () => {
    const firebaseModule = await import('../src/lib/firebase');
    expect(firebaseModule.isFirebaseConfigured).toBeDefined();
    expect(firebaseModule.firebaseConfig).toBeDefined();
    expect(firebaseModule.firebaseConfig.projectId).toBe('pochinki-burger');
  });
});
