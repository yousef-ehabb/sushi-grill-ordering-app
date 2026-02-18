# Abandoned Cart Reminder System - Setup Guide

## Overview

This system implements a comprehensive abandoned cart reminder with:
- **Browser Push Notifications** (works even when app is closed)
- **In-App Notifications** (when user is active on site)
- **Email Reminders** (backup notification method)

## Prerequisites

1. Database tables created (run migration)
2. VAPID keys generated for push notifications
3. Edge function deployed
4. Service worker registered

## Step 1: Database Setup

Run the migration SQL file:

```bash
# Execute in InsForge SQL Editor or via MCP tool
docs/migrations/001_abandoned_cart_schema.sql
```

This creates:
- `carts` table - stores user cart state
- `push_subscriptions` table - stores browser push subscriptions

## Step 2: Generate VAPID Keys

VAPID keys are required for browser push notifications.

### Option A: Using web-push library (Node.js)

```bash
npm install -g web-push
web-push generate-vapid-keys
```

### Option B: Using online generator

Visit: https://web-push-codelab.glitch.me/

### Update the Public Key

1. Copy the **Public Key**
2. Update `src/lib/pushNotifications.ts`:
   ```typescript
   const VAPID_PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE';
   ```

3. Store the **Private Key** securely (you'll need it for the edge function)

## Step 3: Deploy Edge Function

The edge function `abandoned-cart-worker` needs to be deployed and scheduled.

### Deploy via InsForge MCP Tool

```javascript
// Use create-function or update-function MCP tool
{
  name: "abandoned-cart-worker",
  code: "src/app/functions/abandoned-cart-worker.js",
  schedule: "*/30 * * * *" // Every 30 minutes
}
```

### Manual Deployment

1. Upload `src/app/functions/abandoned-cart-worker.js` to InsForge
2. Set up cron schedule: `*/30 * * * *` (every 30 minutes)
3. Configure environment variables if needed

## Step 4: Update Service Worker Path

Ensure `public/sw.js` is accessible at `/sw.js` in your build.

If using Vite, verify the service worker is copied to `dist/sw.js` during build.

## Step 5: Test the System

### Test Cart Sync

1. Log in as a user
2. Add items to cart
3. Wait 2 seconds (debounce)
4. Check `carts` table - should see cart saved

### Test Abandoned Cart Detection

1. Add items to cart
2. Wait 30+ minutes (or manually update `updated_at` in DB)
3. Refresh page
4. Should see toast: "مرحباً بعودتك! لديك عناصر في سلة المشتريات"

### Test Push Notifications

1. Grant notification permission when prompted
2. Add items to cart
3. Wait 30 minutes of inactivity
4. Should receive browser push notification (even if tab is closed)

### Test Edge Function

1. Manually trigger the edge function
2. Check logs for:
   - Email logs
   - Push notification logs
   - Cart status updates

## Configuration

### Adjust Abandonment Threshold

Default: 30 minutes

To change, update in:
- `src/app/store/useStore.ts` - `checkAbandonedCart()` function
- `src/app/functions/abandoned-cart-worker.js` - time threshold calculation

### Adjust Sync Debounce

Default: 2 seconds

Update in `src/app/App.tsx`:
```typescript
setTimeout(() => {
  syncCartToDB(user.id).catch(console.error);
}, 2000); // Change this value
```

### Adjust Inactivity Timer

Default: 30 minutes

Update in `src/app/App.tsx`:
```typescript
setTimeout(() => {
  // Show notification
}, 30 * 60 * 1000); // Change this value
```

## Production Considerations

### 1. Email Service Integration

Replace email logging with actual email service:

```javascript
// Example with SendGrid, Mailgun, etc.
await emailService.send({
  to: cart.email,
  subject: emailSubject,
  html: emailBody,
});
```

### 2. Push Notification Service

Implement actual web-push sending in edge function:

```javascript
const webpush = require('web-push');
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

await webpush.sendNotification(subscription, pushPayload);
```

### 3. Rate Limiting

Add rate limiting to prevent spam:
- Max 1 email per user per hour
- Max 1 push per user per hour
- Track last notification sent

### 4. Privacy & GDPR

- Allow users to opt-out of notifications
- Provide clear privacy policy
- Store consent in database

## Troubleshooting

### Push Notifications Not Working

1. Check browser support (Chrome, Firefox, Edge support push)
2. Verify service worker is registered
3. Check notification permission status
4. Verify VAPID keys are correct
5. Check browser console for errors

### Cart Not Syncing

1. Check user is authenticated
2. Verify RLS policies allow user to write to `carts` table
3. Check browser console for errors
4. Verify `syncCartToDB` is being called

### Edge Function Not Running

1. Verify cron schedule is set correctly
2. Check function logs in InsForge dashboard
3. Test function manually via MCP tool
4. Verify database connection

## Security Notes

- VAPID private key must be kept secret
- RLS policies ensure users can only access their own carts
- Push subscriptions are user-scoped
- All database operations use authenticated user context

