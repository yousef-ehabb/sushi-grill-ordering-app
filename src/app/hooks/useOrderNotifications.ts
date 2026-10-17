import { useRef, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Order } from '../store/useStore';
import type { AdminBranchScope } from '../store/useAuthStore';

// ── localStorage keys ──
const LS_MUTED_KEY = 'admin_notification_muted';
const LS_TONE_KEY = 'admin_notification_tone';

// ── Tone definitions ──
export type ToneId = 'classic_bell' | 'kitchen_beep' | 'soft_melody' | 'loud_alarm' | 'modern_ping';

export interface ToneOption {
  id: ToneId;
  label: string;
  description: string;
  icon: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  { id: 'classic_bell', label: 'جرس كاشير كلاسيكي', description: 'Ding-Dong واضح', icon: '🔔' },
  { id: 'kitchen_beep', label: 'تنبيه مطعم سريع', description: 'بيب مزدوج رقمي', icon: '🍳' },
  { id: 'soft_melody', label: 'نغمة هادئة', description: 'أكورد صاعد ثلاثي', icon: '🎵' },
  { id: 'loud_alarm', label: 'جرس تنبيه قوي', description: 'تنبيه ثلاثي متكرر', icon: '🚨' },
  { id: 'modern_ping', label: 'نقرة رقمية', description: 'بينج حديث قصير', icon: '✨' },
];

// ── Synthesized Tones ──

/** 1. Classic Cashier Bell — crisp two-tone ding-dong */
function playClassicBell(ctx: AudioContext) {
  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(1200, now);
  osc1.frequency.exponentialRampToValueAtTime(800, now + 0.15);
  g1.gain.setValueAtTime(0.45, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc1.connect(g1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.5);

  // Harmonic overtone
  const o1h = ctx.createOscillator();
  const g1h = ctx.createGain();
  o1h.type = 'sine';
  o1h.frequency.setValueAtTime(2400, now);
  o1h.frequency.exponentialRampToValueAtTime(1600, now + 0.15);
  g1h.gain.setValueAtTime(0.12, now);
  g1h.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  o1h.connect(g1h).connect(ctx.destination);
  o1h.start(now);
  o1h.stop(now + 0.35);

  // Second tone (lower "dong")
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(900, now + 0.2);
  osc2.frequency.exponentialRampToValueAtTime(600, now + 0.4);
  g2.gain.setValueAtTime(0, now);
  g2.gain.setValueAtTime(0.4, now + 0.2);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(now + 0.2);
  osc2.stop(now + 0.8);

  const o2h = ctx.createOscillator();
  const g2h = ctx.createGain();
  o2h.type = 'sine';
  o2h.frequency.setValueAtTime(1800, now + 0.2);
  o2h.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
  g2h.gain.setValueAtTime(0, now);
  g2h.gain.setValueAtTime(0.1, now + 0.2);
  g2h.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  o2h.connect(g2h).connect(ctx.destination);
  o2h.start(now + 0.2);
  o2h.stop(now + 0.6);
}

/** 2. Fast Kitchen Beep — double high-pitch digital pager beep */
function playKitchenBeep(ctx: AudioContext) {
  const now = ctx.currentTime;

  for (let i = 0; i < 2; i++) {
    const offset = i * 0.18;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2200, now + offset);
    g.gain.setValueAtTime(0, now);
    g.gain.setValueAtTime(0.3, now + offset);
    g.gain.setValueAtTime(0.3, now + offset + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.12);

    // Softer sub-harmonic for body
    const sub = ctx.createOscillator();
    const gs = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(1100, now + offset);
    gs.gain.setValueAtTime(0, now);
    gs.gain.setValueAtTime(0.15, now + offset);
    gs.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
    sub.connect(gs).connect(ctx.destination);
    sub.start(now + offset);
    sub.stop(now + offset + 0.1);
  }
}

/** 3. Soft Melody Chime — warm 3-note ascending harmonic chord */
function playSoftMelody(ctx: AudioContext) {
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

  notes.forEach((freq, i) => {
    const offset = i * 0.2;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + offset);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.3, now + offset + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.7);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.7);

    // Gentle triangle overtone
    const tri = ctx.createOscillator();
    const gt = ctx.createGain();
    tri.type = 'triangle';
    tri.frequency.setValueAtTime(freq * 2, now + offset);
    gt.gain.setValueAtTime(0, now);
    gt.gain.linearRampToValueAtTime(0.08, now + offset + 0.03);
    gt.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.5);
    tri.connect(gt).connect(ctx.destination);
    tri.start(now + offset);
    tri.stop(now + offset + 0.5);
  });
}

/** 4. Loud Urgent Alarm — repeating triple alert tone for noisy environments */
function playLoudAlarm(ctx: AudioContext) {
  const now = ctx.currentTime;

  for (let i = 0; i < 3; i++) {
    const offset = i * 0.25;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now + offset);
    osc.frequency.linearRampToValueAtTime(1400, now + offset + 0.1);
    g.gain.setValueAtTime(0, now);
    g.gain.setValueAtTime(0.35, now + offset);
    g.gain.setValueAtTime(0.35, now + offset + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.18);

    // Bass punch
    const bass = ctx.createOscillator();
    const gb = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(400, now + offset);
    gb.gain.setValueAtTime(0, now);
    gb.gain.setValueAtTime(0.2, now + offset);
    gb.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
    bass.connect(gb).connect(ctx.destination);
    bass.start(now + offset);
    bass.stop(now + offset + 0.12);
  }
}

/** 5. Modern Pop/Ping — short modern notification ping */
function playModernPing(ctx: AudioContext) {
  const now = ctx.currentTime;

  // Main ping
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1567.98, now); // G6
  osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08); // C6
  g.gain.setValueAtTime(0.4, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.35);

  // Bright shimmer overtone
  const shimmer = ctx.createOscillator();
  const gs = ctx.createGain();
  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(3135.96, now);
  shimmer.frequency.exponentialRampToValueAtTime(2093, now + 0.06);
  gs.gain.setValueAtTime(0.12, now);
  gs.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  shimmer.connect(gs).connect(ctx.destination);
  shimmer.start(now);
  shimmer.stop(now + 0.2);

  // Sub bass thud
  const sub = ctx.createOscillator();
  const gsub = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(200, now);
  gsub.gain.setValueAtTime(0.18, now);
  gsub.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  sub.connect(gsub).connect(ctx.destination);
  sub.start(now);
  sub.stop(now + 0.15);
}

/** Dispatcher — plays the selected tone */
function playToneById(ctx: AudioContext, toneId: ToneId) {
  switch (toneId) {
    case 'classic_bell':  playClassicBell(ctx); break;
    case 'kitchen_beep':  playKitchenBeep(ctx); break;
    case 'soft_melody':   playSoftMelody(ctx); break;
    case 'loud_alarm':    playLoudAlarm(ctx); break;
    case 'modern_ping':   playModernPing(ctx); break;
  }
}

// ── Helpers ──
const ORIGINAL_TITLE = 'لوحة الإدارة';

function readMutedFromStorage(): boolean {
  try {
    return localStorage.getItem(LS_MUTED_KEY) === 'true';
  } catch { return false; }
}
function readToneFromStorage(): ToneId {
  try {
    const v = localStorage.getItem(LS_TONE_KEY);
    if (v && TONE_OPTIONS.some(t => t.id === v)) return v as ToneId;
  } catch { /* ignore */ }
  return 'classic_bell';
}

// ── Hook ──
export function useOrderNotifications(
  orders: Order[],
  adminBranchScope: AdminBranchScope,
  selectedBranchFilter: 'all' | 'فرع الاستاد' | 'فرع الكرفان',
) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const initialLoadDoneRef = useRef(false);
  const [isMuted, setIsMuted] = useState(readMutedFromStorage);
  const [selectedTone, setSelectedTone] = useState<ToneId>(readToneFromStorage);
  const [unseenCount, setUnseenCount] = useState(0);
  const titleFlashRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());

  // Stable refs for closure access
  const scopeRef = useRef(adminBranchScope);
  scopeRef.current = adminBranchScope;
  const branchFilterRef = useRef(selectedBranchFilter);
  branchFilterRef.current = selectedBranchFilter;
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;
  const toneRef = useRef(selectedTone);
  toneRef.current = selectedTone;

  // ── Persist to localStorage ──
  useEffect(() => {
    try { localStorage.setItem(LS_MUTED_KEY, String(isMuted)); } catch { /* ignore */ }
  }, [isMuted]);
  useEffect(() => {
    try { localStorage.setItem(LS_TONE_KEY, selectedTone); } catch { /* ignore */ }
  }, [selectedTone]);

  // ── AudioContext management ──
  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const ensureAudioUnlocked = useCallback(async () => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }, [getAudioCtx]);

  // Auto-unlock AudioContext on first user interaction
  useEffect(() => {
    const handler = () => {
      ensureAudioUnlocked();
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', handler);
    };
    document.addEventListener('click', handler);
    document.addEventListener('touchstart', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [ensureAudioUnlocked]);

  // ── Play a specific tone (for preview) ──
  const playTone = useCallback(async (toneId: ToneId) => {
    await ensureAudioUnlocked();
    const ctx = getAudioCtx();
    playToneById(ctx, toneId);
  }, [ensureAudioUnlocked, getAudioCtx]);

  // ── Select a tone (also previews it) ──
  const selectTone = useCallback(async (toneId: ToneId) => {
    setSelectedTone(toneId);
    await playTone(toneId);
  }, [playTone]);

  // ── Toggle mute ──
  const toggleMute = useCallback(async () => {
    const willMute = !mutedRef.current;
    setIsMuted(willMute);
    if (!willMute) {
      // Unmuting → preview the current tone
      await playTone(toneRef.current);
    }
  }, [playTone]);

  // ── Tab title flash ──
  const startTitleFlash = useCallback((count: number) => {
    if (titleFlashRef.current) clearInterval(titleFlashRef.current);
    let visible = true;
    titleFlashRef.current = setInterval(() => {
      document.title = visible
        ? `(${count}) 🔔 طلب جديد! | ${ORIGINAL_TITLE}`
        : ORIGINAL_TITLE;
      visible = !visible;
    }, 1000);
  }, []);

  const stopTitleFlash = useCallback(() => {
    if (titleFlashRef.current) {
      clearInterval(titleFlashRef.current);
      titleFlashRef.current = null;
    }
    document.title = ORIGINAL_TITLE;
  }, []);

  // Reset title flash when page becomes visible
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        setUnseenCount(0);
        stopTitleFlash();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [stopTitleFlash]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTitleFlash();
      document.title = ORIGINAL_TITLE;
    };
  }, [stopTitleFlash]);

  // ── Web Notification permission request ──
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Clear new-order highlight ──
  const markOrderSeen = useCallback((orderId: string) => {
    setNewOrderIds((prev) => {
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  }, []);

  // ── Trigger visual + browser notification for a single order ──
  const triggerNotification = useCallback(
    (order: Order) => {
      const orderNum = order.order_number ? `#${order.order_number}` : `#${order.id.slice(0, 8)}`;
      const branchName = order.branch || 'غير محدد';

      toast('🔔 طلب جديد!', {
        description: `طلب جديد رقم ${orderNum} — ${branchName}`,
        duration: 8000,
        position: 'top-center',
        style: {
          direction: 'rtl',
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#fff',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRight: '4px solid #ef4444',
          fontSize: '15px',
          fontWeight: '700',
          padding: '16px 20px',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)',
        },
      });

      setNewOrderIds((prev) => new Set(prev).add(order.id));
      setTimeout(() => markOrderSeen(order.id), 12000);

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('🔔 طلب جديد!', {
            body: `طلب جديد رقم ${orderNum} — ${branchName}`,
            icon: '/favicon.ico',
            tag: `order-${order.id}`,
          });
        } catch { /* ignore */ }
      }

      setUnseenCount((prev) => {
        const next = prev + 1;
        if (document.visibilityState !== 'visible') {
          startTitleFlash(next);
        }
        return next;
      });
    },
    [startTitleFlash, markOrderSeen],
  );

  // ── Branch relevance check ──
  const isOrderRelevant = useCallback(
    (order: Order): boolean => {
      const scope = scopeRef.current;
      if (scope === 'all') {
        const filter = branchFilterRef.current;
        if (filter === 'all') return true;
        return order.branch === filter;
      }
      if (scope === 'فرع الاستاد') return order.branch === 'فرع الاستاد';
      if (scope === 'فرع الكرفان') return order.branch === 'فرع الكرفان';
      return false;
    },
    [],
  );

  // ── Watch orders for genuinely new entries ──
  useEffect(() => {
    if (orders.length === 0) return;

    if (!initialLoadDoneRef.current) {
      knownIdsRef.current = new Set(orders.map((o) => o.id));
      initialLoadDoneRef.current = true;
      return;
    }

    const knownIds = knownIdsRef.current!;
    const newOrders = orders.filter((o) => !knownIds.has(o.id));

    if (newOrders.length > 0) {
      const nextKnown = new Set(knownIds);
      newOrders.forEach((o) => nextKnown.add(o.id));
      knownIdsRef.current = nextKnown;

      const relevantOrders = newOrders.filter(isOrderRelevant);

      if (relevantOrders.length > 0) {
        // Play selected tone once for the batch
        if (!mutedRef.current) {
          ensureAudioUnlocked().then(() => {
            const ctx = getAudioCtx();
            playToneById(ctx, toneRef.current);
          });
        }

        relevantOrders.forEach(triggerNotification);
      }
    } else {
      knownIdsRef.current = new Set(orders.map((o) => o.id));
    }
  }, [orders, isOrderRelevant, triggerNotification, ensureAudioUnlocked, getAudioCtx]);

  return {
    isMuted,
    toggleMute,
    selectedTone,
    selectTone,
    playTone,
    unseenCount,
    stopTitleFlash,
    newOrderIds,
    markOrderSeen,
  };
}
