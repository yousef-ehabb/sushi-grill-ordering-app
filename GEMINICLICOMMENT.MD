# Development Plan: Sushi & Grill Ordering App

This plan addresses the technical risks identified during the codebase audit and outlines a roadmap for system stability and feature expansion.

## Phase 1: Stability & Risk Mitigation (Immediate)
*   **Atomic Order Submission:** Investigate Insforge's support for transactions to ensure `orders` and `order_items` are inserted atomically. If not supported, implement a "cleanup" logic in the `submitOrder` store action.
*   **Price Validation:** Update the `validate-order` edge function to perform server-side price calculations. The frontend should only send IDs and quantities; the server should determine the final total to prevent price tampering.
*   **Real-time Updates:** Replace the 30-second polling in `App.tsx` with Insforge real-time subscriptions for order status changes to improve UX and reduce server load.

## Phase 2: Feature Enhancement
*   **Robust Inventory Management:** Add a `stock_quantity` field to products. Update the `validate-order` function to decrement stock upon successful submission.
*   **Advanced Analytics:** Build an admin dashboard module to visualize peak ordering times, best-selling items (using the `order_items` history), and customer retention.
*   **Enhanced Auth Flow:** Implement "Remember Me" functionality and password reset via email/SMS.

## Phase 3: Technical Debt & DX
*   **Type Safety:** Expand TypeScript interfaces to cover all Insforge response shapes and edge function payloads.
*   **Automated Testing:** 
    *   Add Vitest for store logic (cart calculations, validation guards).
    *   Implement Playwright for E2E testing of the "Add to Cart -> Checkout" flow.
*   **Error Handling:** Implement a global error boundary and a more descriptive toast notification system for specific validation failures (e.g., specific item out of stock).

## Maintenance Strategy
*   **Dependency Audits:** Monthly check of `package.json` for security vulnerabilities.
*   **Edge Function Logging:** Implement structured logging within `validate-order.js` to track and debug validation failures in production.
