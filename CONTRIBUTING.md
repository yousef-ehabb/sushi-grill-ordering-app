# Contributing

This project is a Vite + React + TypeScript ordering app connected to InsForge (database, auth, storage, functions).

If you are a friend/collaborator invited to the InsForge project, you are trusted and can have app-admin access too.

For AI-assisted contributions, use the prompt library in `PROMPTS.md`.

## Prerequisites

- Git
- Node.js 18+
- npm (recommended; repo includes a lockfile)
- An InsForge account (the maintainer will invite you)
- Recommended: VS Code

## Clone the Repo

### Option A: Fork workflow (recommended)

1. Fork the repo on GitHub.
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/sushi-grill-ordering-app.git
   cd sushi-grill-ordering-app
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/yousef-ehabb/sushi-grill-ordering-app.git
   ```

To get the latest changes later:
```bash
git fetch upstream
git checkout main
git merge upstream/main
```

### Option B: Direct clone (team members with repo write access)

```bash
git clone https://github.com/yousef-ehabb/sushi-grill-ordering-app.git
cd sushi-grill-ordering-app
```

## Install and Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

Before opening a PR, run:
```bash
npm run build
```

## IDE Setup (VS Code)

Recommended extensions:
- Tailwind CSS IntelliSense
- ESLint (if/when configured)
- Prettier (optional)
- GitLens (optional)

Recommended settings:
- Format on Save: on
- TypeScript: use workspace version (if prompted)

Useful paths:
- UI components: `src/app/components/`
- State management: `src/app/store/`
- InsForge client: `src/lib/insforge.ts`

## Connecting to the Database (InsForge Dashboard Only)

Contributors use the InsForge dashboard only (no direct Postgres connection tooling).

### 1) Accept the InsForge invite

1. The maintainer invites you to the InsForge project.
2. Accept the invite.
3. Open the project in the InsForge dashboard.

### 2) Key safety (important)

InsForge projects expose different key types:

- Anon/public key: safe for frontend usage with RLS enabled.
- Project API key (often looks like `ik_...`): full project access. Never put this in frontend code.

Rules:
- Do not paste keys into Issues/PRs/docs.
- If you suspect a key leak, rotate it in InsForge project settings immediately.

### 3) App-admin access (required for `/admin`)

This app has its own admin system backed by the `admin_users` table.

Admin login flow (high-level):
- `/admin/login` asks for `username` + `password`.
- The app looks up the admin email by `username` in `admin_users`.
- It signs in via InsForge Auth using that email + password.
- Admin privileges persist only if `admin_users.user_id` matches the signed-in Auth user id.

Set up an app-admin user:
1. Create an Auth user (sign up in the app UI).
2. In the InsForge dashboard, open Authentication -> Users and copy your `user_id`.
3. In the InsForge dashboard, open Database -> Tables -> `admin_users` and insert a row:
   - `username`: your chosen admin username (recommended: your GitHub handle)
   - `email`: the Auth email for your admin user
   - `user_id`: the Auth user id you copied
4. Log in at `/admin/login` using `username` + your Auth password.

If admin works once but disappears after refresh, `admin_users.user_id` is probably missing or incorrect.

### 4) Tables used by the app

You will commonly interact with:
- `categories`
- `products`
- `orders`
- `order_items`
- `global_settings`
- `business_rules`
- `admin_users`

## Making Edits (Workflow)

### Branch naming

- `feature/<short-name>`
- `fix/<short-name>`
- `chore/<short-name>`

Example:
```bash
git checkout -b feature/group-ordering
```

### Commit messages

Use Conventional Commits when possible:
- `feat: ...`
- `fix: ...`
- `docs: ...`
- `refactor: ...`
- `chore: ...`

### Pull Requests

PRs should include:
- What changed and why
- How to test locally
- Screenshots/screen recording for UI changes
- Any DB changes you made in InsForge (what + why + how to verify)

## Prompts and Templates (Copy/Paste)

### Feature request (Issue)

Title: `Feature: <short description>`

Body:
- Problem:
- Proposed solution:
- Acceptance criteria:
- UI scope (components/routes):
- Data impact (tables/columns/RLS):
- Function impact (if any):
- Test plan:

### Bug report (Issue)

Title: `Bug: <short description>`

Body:
- Expected behavior:
- Actual behavior:
- Steps to reproduce:
- Screenshots/recording:
- Console errors:

### PR description template

- What:
- Why:
- How to test:
- Screenshots:
- Notes / risks:
- Follow-ups:

### AI helper prompt (optional)

"Work in this repo (Vite + React + TypeScript + Zustand + Tailwind + InsForge). Follow existing patterns in `src/app/store/useStore.ts` and `src/app/components/`. Make minimal, safe changes. Don't add new dependencies unless necessary. Provide exact file edits and manual test steps."

## Reporting Issues

If you find a bug or want a feature, open an issue:
`https://github.com/yousef-ehabb/sushi-grill-ordering-app/issues`
