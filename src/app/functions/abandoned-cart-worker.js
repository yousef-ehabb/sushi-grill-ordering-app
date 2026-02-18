// Edge Function: Abandoned Cart Worker
// Runs on schedule to detect abandoned carts and send notifications
// Trigger: Cron (every 10-30 minutes)

module.exports = async function (request) {
  try {
    const timeThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago

    // Find abandoned carts (active carts not updated in last 30 minutes)
    const { rows: carts } = await this.database.query(
      `SELECT 
        c.id,
        c.user_id,
        c.items,
        c.updated_at,
        u.email,
        u.profile->>'name' as user_name
      FROM carts c
      JOIN auth.users u ON c.user_id = u.id
      WHERE c.status = 'active'
        AND c.updated_at < $1
        AND jsonb_array_length(c.items) > 0`,
      [timeThreshold]
    );

    if (!carts || carts.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No abandoned carts found', processed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const cart of carts) {
      try {
        // 1. Send email notification (simulated for MVP - log it)
        const emailSubject = 'لديك عناصر في سلة المشتريات! 🍣';
        const emailBody = `
          مرحباً ${cart.user_name || 'عزيزي العميل'}،
          
          لاحظنا أن لديك عناصر في سلة المشتريات لم تكمل طلبك بعد.
          لا تفوت فرصة الاستمتاع بأطيب المأكولات!
          
          ${cart.items.length} عنصر في انتظارك.
          
          أكمل طلبك الآن: ${process.env.APP_URL || 'https://your-app.com'}
        `;

        // Log email (in production, use actual email service)
        console.log(`[EMAIL] To: ${cart.email}`);
        console.log(`[EMAIL] Subject: ${emailSubject}`);
        console.log(`[EMAIL] Body: ${emailBody}`);

        // 2. Send push notification to all user's devices
        const { rows: subscriptions } = await this.database.query(
          `SELECT endpoint, p256dh, auth 
           FROM push_subscriptions 
           WHERE user_id = $1`,
          [cart.user_id]
        );

        if (subscriptions && subscriptions.length > 0) {
          for (const sub of subscriptions) {
            try {
              // Send push notification via web push
              // Note: This requires web-push library and VAPID keys
              // For MVP, we'll log it. In production, implement actual push sending.
              
              const pushPayload = JSON.stringify({
                title: 'لديك عناصر في سلة المشتريات! 🍣',
                body: `لديك ${cart.items.length} عنصر في انتظارك - أكمل طلبك الآن`,
                icon: '/logo.jpg',
                badge: '/logo.jpg',
                tag: 'abandoned-cart',
                url: '/',
                data: {
                  cartId: cart.id,
                  userId: cart.user_id,
                },
              });

              // In production, use web-push library:
              // await webpush.sendNotification(subscription, pushPayload);
              
              console.log(`[PUSH] Sending to: ${sub.endpoint.substring(0, 50)}...`);
              console.log(`[PUSH] Payload: ${pushPayload}`);

              // For now, we'll trigger push via a client-side check
              // The client will poll or use real-time subscriptions
            } catch (pushError) {
              console.error(`[PUSH] Failed for user ${cart.user_id}:`, pushError);
            }
          }
        }

        // 3. Mark cart as abandoned
        await this.database.query(
          `UPDATE carts 
           SET status = 'abandoned', updated_at = NOW()
           WHERE id = $1`,
          [cart.id]
        );

        results.push({
          cartId: cart.id,
          userId: cart.user_id,
          email: cart.email,
          itemsCount: cart.items.length,
          status: 'processed',
        });
      } catch (error) {
        console.error(`Failed to process cart ${cart.id}:`, error);
        results.push({
          cartId: cart.id,
          userId: cart.user_id,
          status: 'error',
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Abandoned cart processing completed',
        processed: results.length,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Abandoned cart worker error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to process abandoned carts',
        message: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

