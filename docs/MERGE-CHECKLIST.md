# Feature Completion & Merge Checklist

> **Applies to:** All feature branches merging into `main`
> **Last updated:** 2026-02-19
> **Branch protection:** `main` requires PR + 1 approval + status checks

---

## 1. Local Pre-Push Checks

Complete **all** items before pushing your branch.

### Code Review

- [ ] No `console.log`, `console.warn`, `debugger` statements in production code
- [ ] No commented-out code blocks left behind
- [ ] No hardcoded secrets, API keys, or test credentials
- [ ] No `// TODO` or `// FIXME` without a linked issue
- [ ] All new functions have meaningful names (self-documenting)
- [ ] No unused imports or dead variables

### Acceptance Criteria

- [ ] Every acceptance criterion from the task/issue is verified
- [ ] Edge cases documented in the issue have been tested
- [ ] Arabic strings display correctly (RTL layout intact)

### Manual QA Scenarios

Run these against `localhost` before pushing:

- [ ] Happy path: complete a full order end-to-end
- [ ] Validation: submit invalid data and confirm rejection
- [ ] UI: confirm no layout breaks on mobile viewport (375px)
- [ ] State: refresh the page mid-flow and confirm recovery
- [ ] Error: disconnect network and confirm graceful handling

### Edge Function Safety (if modified)

- [ ] Function uses `createClient()` from InsForge SDK (no raw SQL)
- [ ] All validation is server-side (never trust client input)
- [ ] Price calculation is server-authoritative
- [ ] Atomic transaction with rollback on partial failure
- [ ] No direct SDK inserts to `orders` or `order_items` from frontend
- [ ] Function deployed to InsForge and tested against live endpoint
- [ ] CORS headers present for all response paths (200, 400, 500)

### Integrity Gate

- [ ] `grep -r "\.from('orders').insert" src/` returns **zero** results (no bypass)
- [ ] `grep -r "\.from('order_items').insert" src/` returns **zero** results
- [ ] Only `place-order` edge function exists in InsForge (no orphan functions)

---

## 2. Git Workflow

```bash
# 1. Sync with latest main
git checkout main
git pull origin main
git checkout feature/your-branch
git rebase main
# OR: git merge main (if rebase causes too many conflicts)

# 2. Resolve conflicts
# - Never auto-resolve conflicts in: place-order.js, useStore.ts, schema files
# - Always manually verify conflict resolution in critical files

# 3. Test after rebase
npm run dev
# Run manual QA scenarios again

# 4. Push
git push origin feature/your-branch

# 5. Open PR on GitHub
# Target: main
# Use the PR template below
```

---

## 3. Pull Request Requirements

### PR Title Format

```
[Feature|Fix|Refactor|Chore]: Short description
```

Examples:
- `Feature: Sauce add-on system for fries`
- `Fix: Price mismatch validation in place-order`

### PR Description Template

```markdown
## What

Brief description of what this PR does.

## Why

Context: what problem does this solve or what feature does this add?

## Changes

- File/component 1: what changed
- File/component 2: what changed

## Edge Function Changes

- [ ] No edge function changes
- [ ] Modified `place-order` — deployed & tested
- [ ] New function added — name: ___

## Testing Summary

| Scenario | Result |
|----------|--------|
| Happy path order | ✅ / ❌ |
| Validation rejection | ✅ / ❌ |
| Mobile layout | ✅ / ❌ |

## Risk Assessment

- **Low**: UI-only change, no backend impact
- **Medium**: New validation logic, tested against live endpoint
- **High**: Transaction flow, pricing, or schema change

## Screenshots

(Attach if any UI was changed)
```

---

## 4. Merge Readiness Validation

Before clicking "Merge":

- [ ] PR has ≥1 approval
- [ ] All status checks pass (green)
- [ ] No merge conflicts with `main`
- [ ] PR description is complete (not a draft)
- [ ] Final sanity: open the deployed preview or localhost and place one test order
- [ ] If edge function was modified: confirm deployment matches local code

---

## 5. Post-Merge Actions

```bash
# 1. Pull updated main
git checkout main
git pull origin main

# 2. Tag the release
git tag v{X.Y}-{feature-slug}
git push origin v{X.Y}-{feature-slug}
# Example: git tag v1.1-sauce-addon

# 3. Deploy edge functions (if modified)
# Use InsForge MCP or dashboard to verify deployment

# 4. Smoke test production
# - Place a real order
# - Verify order appears in admin panel
# - Confirm no 500 errors in function logs

# 5. Clean up
git branch -d feature/your-branch
git push origin --delete feature/your-branch
```

---

## 6. Red-Zone Rules

### 🔴 NEVER change without review + approval

| File/Area | Reason |
|-----------|--------|
| `place-order.js` | Core transaction & pricing logic |
| Atomic transaction flow | Data integrity depends on insert + rollback |
| Server-side price calculation | Prevents price tampering |
| `orders` / `order_items` schema | Breaking change = data loss risk |
| InsForge environment variables | Misconfiguration = full outage |

### 🟡 Extra caution required

| File/Area | Reason |
|-----------|--------|
| `useStore.ts` (submitOrder) | Payload construction for edge function |
| Any new edge function | Must follow SDK patterns, not raw SQL |
| Option validation logic | Affects what customers can order |
| DB schema migrations | Must be backward-compatible |
| Auth flow (`useAuthStore.ts`) | Session handling is fragile |

### 🟢 Safe to change with standard review

| File/Area |
|-----------|
| UI components (styling, layout) |
| Static text / translations |
| Admin panel display logic |
| Non-critical utilities |

---

## Quick Reference

```
Pre-Push    → Code clean + QA + integrity gate
Git         → Rebase main + resolve + push + open PR
PR          → Title format + description template + risk level
Merge       → Approval + checks green + final sanity
Post-Merge  → Pull main + tag + deploy + smoke test
Red-Zone    → place-order / pricing / transactions = NEVER skip review
```
