# AI Contributor Prompts

Use this file as a copy/paste prompt library for AI IDEs (Antigravity, Cursor, Windsurf, etc.) so every contributor works with the same project context, coding style, and delivery quality.

## How to Use

1. Start with the `Master Context Prompt` once per new AI chat/session.
2. Use one of the `Step Prompts` based on your task.
3. Replace placeholders like `<FEATURE_NAME>` and `<FILE_PATH>`.
4. Ask the AI to output only actionable edits and verification steps.

---

## Master Context Prompt (Paste First)

```text
You are contributing to the "sushi-grill-ordering-app" repository.

Project context:
- Stack: React + TypeScript + Vite + Zustand + Tailwind + InsForge SDK.
- Main app areas:
  - UI components: src/app/components/
  - State/store: src/app/store/
  - InsForge client: src/lib/insforge.ts
  - Order validation function: src/app/functions/place-order.js
- Key database tables: categories, products, orders, order_items, global_settings, business_rules, admin_users.
- App supports customer and admin flows (admin login and dashboard).
- Arabic-first UX and RTL support are important.

Rules:
- Make minimal, focused changes.
- Follow existing patterns before introducing new ones.
- Do not add new dependencies unless clearly required.
- Keep TypeScript strict and avoid "any" unless unavoidable.
- Never expose secrets or privileged keys in code or docs.
- If task touches InsForge integration, follow official SDK patterns and keep frontend/client-safe key usage.

Output style:
- Provide:
  1) short implementation plan,
  2) exact file edits,
  3) manual test steps,
  4) edge cases.
- Keep explanations concise and practical.
```

---

## Step Prompt 1: Understand the Full Picture

```text
Read the codebase and summarize how ordering works end-to-end.

Focus on:
- Product listing and add-to-cart flow
- Cart validation and checkout submission
- Order status updates and tracking
- Auth/account and order history
- Admin operations and business rules

Return:
1) architecture map,
2) data flow map,
3) key files to touch for future changes,
4) top 5 technical risks.
```

## Step Prompt 2: Plan a New Feature

```text
I want to implement: <FEATURE_NAME>

Create an implementation plan that matches existing project patterns.

Return:
1) scope and acceptance criteria,
2) files to modify,
3) required DB changes (if any),
4) UI/UX updates,
5) test cases,
6) rollout strategy with low risk.

Do not code yet. Just produce a clear execution plan.
```

## Step Prompt 3: Implement the Feature

```text
Implement this feature now: <FEATURE_NAME>

Constraints:
- Follow existing architecture and naming style.
- Keep changes minimal and production-safe.
- Reuse existing components/store logic where possible.
- Avoid breaking admin or checkout flow.

Deliverables:
1) exact code changes,
2) any migration/data update steps,
3) how to verify locally,
4) list of impacted user flows.
```

## Step Prompt 4: Safe InsForge/DB Update

```text
I need to change database-related behavior for: <USE_CASE>

Do this safely:
1) inspect current schema usage in code,
2) propose backward-compatible DB changes,
3) update app code accordingly,
4) include rollback plan.

Return:
- table/column impact,
- query/update impact,
- validation updates,
- manual verification checklist in InsForge dashboard.
```

## Step Prompt 5: Bug Fix Mode

```text
Fix this bug: <BUG_DESCRIPTION>

Approach:
1) reproduce from code path,
2) identify root cause,
3) implement minimal fix,
4) prevent regressions.

Return:
- root cause,
- exact fix,
- why this fix is safe,
- test steps (including edge cases).
```

## Step Prompt 6: UI/UX Improvement Without Breaking Logic

```text
Improve UX for: <PAGE_OR_COMPONENT>

Requirements:
- Keep existing business logic unchanged.
- Maintain RTL and Arabic-first behavior.
- Preserve responsiveness (mobile-first).
- Keep the visual style consistent with the app.

Return:
1) UI changes,
2) accessibility checks,
3) responsive behavior checks,
4) before/after verification steps.
```

## Step Prompt 7: Prepare PR-Ready Output

```text
Prepare this work for a pull request.

Generate:
1) Conventional Commit message,
2) PR title,
3) PR description with:
   - what changed,
   - why,
   - how to test,
   - screenshots needed,
   - risks and follow-ups.

Keep it concise and ready to paste into GitHub.
```

## Step Prompt 8: Code Review Assistant

```text
Review my branch changes like a senior reviewer.

Check for:
- logic bugs,
- edge cases,
- data consistency,
- security concerns,
- performance issues,
- readability/maintainability.

Return:
1) blocking issues,
2) non-blocking suggestions,
3) final go/no-go decision.
```

---

## Team Sync Prompt (Use at Start of Any Task)

```text
Before coding, restate the task in one paragraph, then list:
1) what you will change,
2) what you will not change,
3) assumptions,
4) risks,
5) validation steps.

Wait for confirmation only if assumptions are high-risk.
```

---

## Copy/Paste Placeholders

- `<FEATURE_NAME>`: e.g. "Scheduled Orders"
- `<USE_CASE>`: e.g. "Add coupon support at checkout"
- `<BUG_DESCRIPTION>`: e.g. "Admin order status does not persist after refresh"
- `<PAGE_OR_COMPONENT>`: e.g. "CartSidebar" or "OrderDetailPage"

---

## Good Prompting Tips for Contributors

- Keep one task per prompt.
- Ask for exact file-level edits and test steps.
- Ask the AI to preserve existing patterns and avoid large rewrites.
- Ask for edge-case handling before implementation.
- For risky changes, ask for a rollback plan.
