/**
 * Operating Hours Utility — Auto-Close / Manual-Open Rule
 *
 * Restaurant shift: 12:00 PM noon → 2:00 AM next morning
 * Off-hours:       02:00 AM → 11:59 AM
 *
 * Rule:
 *  - System AUTO-CLOSES branches when time enters off-hours (≥2:00 AM).
 *  - System NEVER auto-opens. Admin must manually open each branch via the admin panel.
 */

/** Hour (0–23) at which auto-close triggers (2 AM) */
export const AUTO_CLOSE_HOUR = 2;

/** Hour (0–23) at which shift begins — only informational, NOT used for auto-open */
export const SHIFT_START_HOUR = 12;

/**
 * Returns true if the current time is in the restaurant off-hours window.
 * Off-hours = [2:00 AM, 12:00 PM) — i.e., hour is 2..11 inclusive.
 */
export function isInOffHours(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= AUTO_CLOSE_HOUR && h < SHIFT_START_HOUR;
}

/**
 * Returns true if auto-close should trigger RIGHT NOW.
 * This fires in the minute window 02:00:00 – 02:00:59.
 */
export function shouldAutoCloseNow(now: Date = new Date()): boolean {
  const h = now.getHours();
  const m = now.getMinutes();
  return h === AUTO_CLOSE_HOUR && m === 0;
}

/**
 * Computes ms until the next 2:00 AM from a given Date.
 * Used to schedule the auto-close timer.
 */
export function msUntilNextAutoClose(now: Date = new Date()): number {
  const next2AM = new Date(now);
  next2AM.setHours(AUTO_CLOSE_HOUR, 0, 0, 0);

  // If we're already past 2 AM today, schedule for tomorrow's 2 AM
  if (now >= next2AM) {
    next2AM.setDate(next2AM.getDate() + 1);
  }

  return next2AM.getTime() - now.getTime();
}

/**
 * Returns the off-hours closed message shown to customers.
 */
export function getOffHoursMessage(): string {
  return 'المطعم مغلق حالياً خارج ساعات العمل. نستقبل طلباتكم اعتباراً من الساعة 12:00 ظهراً عند فتح الفروع.';
}

/**
 * Formats ms duration into a human-readable Arabic countdown string.
 */
export function formatCountdown(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) {
    return `${h} س ${m} د`;
  }
  return `${m} دقيقة`;
}
