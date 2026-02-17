# Sushi & Grill Ordering App

A production-ready online ordering system for a sushi and grill restaurant, built with React, TypeScript, Vite, Tailwind, Zustand, and InsForge.

The app is designed as an Arabic-first, RTL-friendly experience with separate customer and admin workflows.

![Project Banner](public/hero-3.png)

## Overview

This project includes:
- Customer menu browsing, cart management, checkout, account, and order tracking
- Admin login and dashboard for operational controls and order handling
- InsForge-backed auth, database, storage, and edge-function validation

## Features

### Customer Side
- Fast add-to-cart flow with product detail modal
- Cart supports quantity updates and per-item special instructions
- Checkout with business-rule validation before order creation
- Account area with profile management and order history
- Order detail timeline with status progression

### Admin Side
- Admin authentication flow
- Order status management (`new`, `preparing`, `ready`, `out_for_delivery`, `completed`, `cancelled`)
- Product availability control
- Category activation control
- Global website open/close control with custom message
- Category minimum quantity business rules

## Tech Stack

- Frontend: React 18, TypeScript, Vite
- Styling/UI: Tailwind CSS, Radix UI, Motion, Lucide
- State: Zustand
- Backend: InsForge SDK (auth, database, storage, functions)
- Notifications: Sonner

## Project Structure

```text
src/
  app/
    components/      UI components and pages
    functions/       Runtime function code
    store/           Zustand stores
    App.tsx          Main app shell and routing logic
  lib/
    insforge.ts      InsForge client setup
    phoneUtils.ts    Phone parsing/validation helpers
scripts/
  validate-order.js  Deno edge function for server-side order validation
docs/
  *.md              Feature plans and walkthroughs
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Git

### Install

```bash
git clone https://github.com/yousef-ehabb/sushi-grill-ordering-app.git
cd sushi-grill-ordering-app
npm install
```

### Run in Development

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

## InsForge Notes

- The application uses InsForge for backend services.
- Contributors should use the InsForge dashboard for schema/data operations.
- Do not expose privileged InsForge project keys in code, docs, or pull requests.
- If a key is exposed, rotate it immediately in project settings.

## Contributor Resources

- Contribution workflow and onboarding: `CONTRIBUTING.md`
- AI IDE prompt library for consistent contributions: `PROMPTS.md`
- Short redirect doc: `CONTRIBUTION.md`

## Quality and Security

- Server-side validation is enforced through `validate-order` logic.
- UI uses optimistic updates where appropriate.
- Business constraints are validated both client-side and server-side.
- Treat all credentials as sensitive.

## Author

- [Yousef Ehab](https://github.com/yousef-ehabb)
