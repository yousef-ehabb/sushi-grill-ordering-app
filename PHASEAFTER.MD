# Backend Architecture Review and Refactor Plan (Pre-Scale)

## 1) Current Backend Structure (As Implemented)

You currently have a frontend-driven backend:

1. Data access is mostly inside Zustand stores and components, not server modules.
2. Core "backend-like" logic sits in `src/app/store/useStore.ts` (orders/menu/admin ops), `src/app/store/useAuthStore.ts` (auth/admin role checks), plus direct DB calls in UI pages like `src/app/components/auth/AccountPage.tsx:67`, `src/app/components/auth/OrderDetailPage.tsx:83`, `src/app/components/ActiveOrderModal.tsx:93`.
3. Only one real server-side function is visible: `scripts/validate-order.js`.
4. No controllers/services/routes/repository layers in this repo.
5. No migration folder / schema-as-code found (only docs mention migrations).

## 2) Modular Separation vs Coupling

Current state is tightly coupled:

1. UI, state, and persistence are mixed in same places (`src/app/store/useStore.ts`).
2. Same query patterns are duplicated across store + components (orders/items fetch logic repeated).
3. Business rules are split between client and server function, so invariants are not centralized.
4. Admin role determination is repeated client-side (`src/app/store/useAuthStore.ts:87`, `:130`, `:151`, `:326`).

## 3) Scalability Risks for Loyalty / Analytics / Notifications

Key risks before adding features:

1. No transaction boundary for order creation: order insert then items insert are separate (`src/app/store/useStore.ts:418`, `:449`), so partial writes are possible.
2. Client-trusted pricing inputs: total and item prices are sent from client (`src/app/store/useStore.ts:425`, `:442`); validation function does not recompute pricing.
3. N+1 query patterns for orders/items in multiple flows (`src/app/store/useStore.ts:236`, `src/app/components/auth/AccountPage.tsx:73`).
4. Polling instead of events/realtime (`src/app/App.tsx:48`) will not scale for status updates and notifications.
5. Sensitive setup artifacts in repo: hardcoded keys and admin bootstrap credentials (`src/lib/insforge.ts:4`, `scripts/setup-admin.mjs:12`).
6. No background job system, which you will need for abandoned cart, WhatsApp, push, loyalty recalculation, analytics aggregation.

## 4) Recommended Pattern: Modular Monolith vs Microservices

Use a Modular Monolith now, not microservices yet.

1. Keep one database and one deployment boundary.
2. Split domain logic into modules (Orders, Catalog, Auth, Loyalty, Payments, Notifications, Analytics, Delivery).
3. Use async events between modules via outbox/queue.
4. Move to microservices later only if you hit clear boundaries: independent deploy needs, team scaling, or very high event throughput.

## 5) Recommended Folder / Module Structure

Adopt this structure first:

1. `backend/sql/migrations/*`
2. `backend/sql/policies/*`
3. `backend/functions/orders/place-order.ts`
4. `backend/functions/orders/update-status.ts`
5. `backend/functions/payments/create-intent.ts`
6. `backend/functions/payments/webhook.ts`
7. `backend/functions/loyalty/award-points.ts`
8. `backend/functions/notifications/dispatch.ts`
9. `backend/functions/analytics/aggregate-daily.ts`
10. `backend/shared/{db.ts,events.ts,idempotency.ts,errors.ts}`
11. `src/app/api/{ordersApi.ts,loyaltyApi.ts,paymentsApi.ts}`
12. `src/app/modules/{orders,auth,catalog,admin}/...` (UI + hooks only, no direct DB queries)

## 6) Redis / Jobs / Event-Driven: Do You Need Them?

Short answer:

1. Redis: Yes, but phase it in.
   - Start with caching hot reads (menu/settings), rate limiting, and dedupe/idempotency short TTL keys.
2. Background jobs: Yes, mandatory for your roadmap.
   - Notifications, WhatsApp retries, abandoned cart workflow, analytics rollups, loyalty adjustments.
3. Event-driven architecture: Yes, minimally now.
   - Use domain events + outbox table first; add external broker later if needed.

## 7) Database Design Improvements Needed

For your upcoming features, add these patterns:

1. Loyalty
   - `loyalty_accounts(user_id, points_balance, tier_id, version)`
   - `loyalty_ledger(id, user_id, order_id, type, points_delta, reason, created_at)` immutable
   - `loyalty_redemptions(id, user_id, order_id, points_spent, reward_id, status)`
2. Analytics
   - `order_events(order_id, event_type, payload, occurred_at)`
   - `fact_order_items(order_id, product_id, category_id, qty, gross, net, created_at)`
   - materialized views for daily/hourly KPIs (best sellers, rush hour, retention cohorts)
3. Order history tracking
   - `order_status_history(order_id, from_status, to_status, actor_id, source, changed_at)`
   - keep current status in `orders`, full audit in history table
4. Payments + idempotency
   - `payments(order_id, provider, status, amount, external_ref, idempotency_key unique)`
   - `webhook_events(provider, external_id unique, payload, processed_at, status)`

## 8) Practical Refactoring Roadmap (Before New Features)

Do this in order:

1. Centralize write paths server-side
   - Replace direct client order writes with `place-order` function/RPC that validates + calculates totals + writes in one transaction.
2. Introduce repository/service boundaries
   - Stop direct DB calls from UI components; move to `src/app/api/*` adapters.
3. Create schema/migration discipline
   - Add SQL migrations for tables, indexes, constraints, RLS, triggers.
4. Implement event + outbox
   - On order/payment/status changes, write events in same transaction.
5. Add worker/job runner
   - Process outbox for notifications, WhatsApp, loyalty awarding, analytics rollups.
6. Harden auth/admin model
   - Move admin checks to server policies/functions; avoid repeated client table lookups.
7. Optimize reads
   - Replace N+1 order-item fetches with joins/views.
8. Then build new features
   - Loyalty -> Payments -> Notifications/WhatsApp -> Analytics -> Recommendations -> Delivery ETA/slots.
