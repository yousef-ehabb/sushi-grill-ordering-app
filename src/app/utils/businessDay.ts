/**
 * Business Day Utilities for Pochinki Sushi & Grill Ordering App:
 *
 * Restaurant Business Day Definition:
 * A business day runs from 12:00 PM (noon) to 2:00 AM (or next noon) the following morning.
 * For example:
 * - An order placed at 01:30 AM on Tuesday belongs to Monday's business day.
 * - An order placed at 12:15 PM on Tuesday belongs to Tuesday's business day.
 */

/**
 * Returns a standardized "YYYY-MM-DD" key representing the restaurant business day
 * for any given timestamp (Date, ISO string, timestamp number, or Firestore Timestamp).
 */
export function getBusinessDayKey(rawTimestamp?: string | number | Date | null): string {
  if (!rawTimestamp) return '';

  let date: Date;
  if (rawTimestamp instanceof Date) {
    date = rawTimestamp;
  } else if (typeof rawTimestamp === 'number') {
    date = new Date(rawTimestamp);
  } else if (typeof rawTimestamp === 'string') {
    date = new Date(rawTimestamp);
  } else if (rawTimestamp && typeof (rawTimestamp as any).toDate === 'function') {
    date = (rawTimestamp as any).toDate();
  } else if (rawTimestamp && typeof (rawTimestamp as any).toMillis === 'function') {
    date = new Date((rawTimestamp as any).toMillis());
  } else {
    date = new Date(rawTimestamp as any);
  }

  if (isNaN(date.getTime())) return '';

  const hours = date.getHours();
  const businessDate = new Date(date.getTime());

  // If before 12:00 PM noon (e.g. 1:30 AM early morning), belongs to previous calendar day
  if (hours < 12) {
    businessDate.setDate(businessDate.getDate() - 1);
  }

  const y = businessDate.getFullYear();
  const m = String(businessDate.getMonth() + 1).padStart(2, '0');
  const d = String(businessDate.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

/**
 * Returns current business day key ("YYYY-MM-DD")
 */
export function getCurrentBusinessDayKey(now: Date = new Date()): string {
  return getBusinessDayKey(now);
}

/**
 * Returns yesterday's business day key ("YYYY-MM-DD")
 */
export function getYesterdayBusinessDayKey(now: Date = new Date()): string {
  const currentKey = getCurrentBusinessDayKey(now);
  if (!currentKey) return '';
  const [y, m, d] = currentKey.split('-').map(Number);
  const prevDate = new Date(y, m - 1, d);
  prevDate.setDate(prevDate.getDate() - 1);
  const py = prevDate.getFullYear();
  const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
  const pd = String(prevDate.getDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

/**
 * Returns the exact Date range [start, end] for a business day key ("YYYY-MM-DD").
 * Start: 12:00:00 PM of that day.
 * End: 11:59:59 AM of the next day.
 */
export function getBusinessDayRange(businessDayKey: string): { start: Date; end: Date } | null {
  if (!businessDayKey || !/^\d{4}-\d{2}-\d{2}$/.test(businessDayKey)) return null;
  const [y, m, d] = businessDayKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, 12, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 11, 59, 59, 999);
  return { start, end };
}

/**
 * Returns a clean, human-readable Arabic description of a business day key.
 * e.g., "اليوم (السبت، 17 أكتوبر)" or "أمس (الجمعة، 16 أكتوبر)" or "الخميس، 15 أكتوبر 2026"
 */
export function formatBusinessDayArabic(
  businessDayKey: string,
  options?: { includeWeekday?: boolean; now?: Date }
): string {
  if (!businessDayKey) return '';
  if (businessDayKey === 'all') return 'كل الأوقات';

  const [y, m, d] = businessDayKey.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  if (isNaN(dateObj.getTime())) return businessDayKey;

  const currentKey = getCurrentBusinessDayKey(options?.now);
  const yesterdayKey = getYesterdayBusinessDayKey(options?.now);

  const formatted = dateObj.toLocaleDateString('ar-EG', {
    weekday: options?.includeWeekday !== false ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
  });

  if (businessDayKey === currentKey) {
    return `اليوم (${formatted})`;
  }

  if (businessDayKey === yesterdayKey) {
    return `أمس (${formatted})`;
  }

  return dateObj.toLocaleDateString('ar-EG', {
    weekday: options?.includeWeekday !== false ? 'long' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Filter an array of orders by a target business day key ("YYYY-MM-DD" or "all").
 */
export function filterOrdersByBusinessDay<T extends { created_at?: any }>(
  orders: T[],
  targetBusinessDayKey: string
): T[] {
  if (!targetBusinessDayKey || targetBusinessDayKey === 'all') {
    return orders;
  }
  return orders.filter((order) => {
    const key = getBusinessDayKey(order.created_at);
    return key === targetBusinessDayKey;
  });
}
