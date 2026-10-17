import { describe, it, expect, beforeEach } from 'vitest';
import { processOrderCreation } from '../src/server/orderEngine';
import { MockFirestore, mockFieldValue } from './mocks/mockFirestore';

describe('Server Atomic Idempotency', () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = new MockFirestore({
      settings: {
        global: {
          is_website_open: true,
          delivery_fee: 25,
          branches: {
            'فرع الاستاد': { is_open: true },
          },
        },
      },
      products: {
        prod_burger: {
          name_ar: 'سوبر برجر',
          price: 100,
          is_available: true,
        },
      },
      options: {},
    });
  });

  it('sequential retries with the same idempotency key return the original order ID without duplicating', async () => {
    const payload = {
      customer_name: 'سارة خالد',
      customer_phone: '01123456789',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
      idempotency_key: 'test_idemp_key_123',
    };

    // First attempt
    const res1 = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res1.success).toBe(true);
    expect(res1.isDuplicate).toBe(false);
    const originalOrderId = res1.orderId;

    // Verify exactly 1 order exists in database
    expect(db.getCollection('orders').size).toBe(1);

    // Second attempt with exact same key (e.g. user retrying or network reconnect)
    const res2 = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res2.success).toBe(true);
    expect(res2.isDuplicate).toBe(true);
    expect(res2.orderId).toBe(originalOrderId);

    // Verify STILL exactly 1 order exists in database (NO DUPLICATION)
    expect(db.getCollection('orders').size).toBe(1);
  });

  it('simultaneous concurrent submissions with the same key resolve safely to a single order', async () => {
    const payload = {
      customer_name: 'طارق يوسف',
      customer_phone: '01512345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 2 }],
      idempotency_key: 'test_concurrent_key_456',
    };

    // Dispatch 5 simultaneous concurrent requests
    const promises = Array.from({ length: 5 }).map(() =>
      processOrderCreation(db as any, payload, null, mockFieldValue as any)
    );

    const results = await Promise.all(promises);

    // All must succeed
    for (const r of results) {
      expect(r.success).toBe(true);
    }

    // All returned order IDs must be identical
    const returnedOrderIds = new Set(results.map((r) => r.orderId));
    expect(returnedOrderIds.size).toBe(1);

    // Exactly one order was created in the database
    expect(db.getCollection('orders').size).toBe(1);
    expect(db.getCollection('idempotency_records').size).toBe(1);
  });

  it('different idempotency keys create distinct separate orders', async () => {
    const payloadA = {
      customer_name: 'أحمد',
      customer_phone: '01011112222',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
      idempotency_key: 'test_key_A',
    };

    const payloadB = {
      customer_name: 'أحمد',
      customer_phone: '01011112222',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
      idempotency_key: 'test_key_B',
    };

    const resA = await processOrderCreation(db as any, payloadA, null, mockFieldValue as any);
    const resB = await processOrderCreation(db as any, payloadB, null, mockFieldValue as any);

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(true);
    expect(resA.orderId).not.toBe(resB.orderId);
    expect(db.getCollection('orders').size).toBe(2);
  });

  it('does not create an order if the transaction fails', async () => {
    const faultyDb = {
      collection: db.collection.bind(db),
      runTransaction: async () => {
        throw new Error('Database connection reset during commit');
      },
    };

    const payload = {
      customer_name: 'فاطمة',
      customer_phone: '01099998888',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
      idempotency_key: 'test_faulty_key',
    };

    const res = await processOrderCreation(faultyDb as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('TRANSACTION_FAILED');
    expect(db.getCollection('orders').size).toBe(0);
  });

  it('strictly scopes idempotency keys across different customers to prevent cross-account order hijacking', async () => {
    const sharedKey = 'common_shared_key_777';

    // Customer 1 creates an order
    const payloadCustomer1 = {
      customer_name: 'علي حسن',
      customer_phone: '01011112222',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
      idempotency_key: sharedKey,
    };

    const res1 = await processOrderCreation(db as any, payloadCustomer1, 'user_cust_1', mockFieldValue as any);
    expect(res1.success).toBe(true);
    expect(res1.isDuplicate).toBe(false);

    // Customer 2 submits with the identical idempotency key
    const payloadCustomer2 = {
      customer_name: 'محمود سامي',
      customer_phone: '01099998888',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
      idempotency_key: sharedKey,
    };

    const res2 = await processOrderCreation(db as any, payloadCustomer2, 'user_cust_2', mockFieldValue as any);
    expect(res2.success).toBe(true);
    expect(res2.isDuplicate).toBe(false);

    // Customer 2 MUST receive their own distinct order, NOT Customer 1's order!
    expect(res2.orderId).not.toBe(res1.orderId);
    expect(db.getCollection('orders').size).toBe(2);
  });
});

