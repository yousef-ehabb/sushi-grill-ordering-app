/**
 * Returns the unified display order ID string (e.g. "#1010").
 * Uses the numeric order_number when available, otherwise falls back
 * to a truncated Firestore doc ID for legacy orders.
 */
export function getDisplayOrderId(order: { order_number?: number; id: string }): string {
  return order.order_number
    ? `#${order.order_number}`
    : `#${order.id.slice(0, 8).toUpperCase()}`;
}

/**
 * Whether the given status allows cancellation.
 * Only 'new' orders can be cancelled.
 */
export function isCancellable(status: string): boolean {
  return status === 'new';
}
