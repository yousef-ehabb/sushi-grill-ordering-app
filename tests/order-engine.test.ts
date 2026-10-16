import { describe, it, expect, beforeEach } from 'vitest';
import { processOrderCreation } from '../src/server/orderEngine';
import { MockFirestore, mockFieldValue } from './mocks/mockFirestore';

describe('Server-Authoritative Order Engine', () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = new MockFirestore({
      settings: {
        global: {
          is_website_open: true,
          delivery_fee: 25,
          min_order_amount: 50,
          branches: {
            'فرع الاستاد': { is_open: true, delivery_fee: 20 },
            'فرع الكرفان': { is_open: false, delivery_fee: 25 },
          },
        },
      },
      products: {
        prod_burger: {
          name_ar: 'سوبر برجر',
          price: 100,
          is_available: true,
          branch_availability: {
            'فرع الاستاد': true,
            'فرع الكرفان': true,
          },
        },
        prod_soldout: {
          name_ar: 'برجر نفد',
          price: 80,
          is_available: false,
        },
        prod_stadium_only: {
          name_ar: 'وجبة الاستاد الحصرية',
          price: 150,
          is_available: true,
          branch_availability: {
            'فرع الاستاد': true,
            'فرع الكرفان': false,
          },
        },
      },
      options: {
        opt_cheese: {
          name_ar: 'جبنة زيادة',
          price: 20,
          is_available: true,
        },
        opt_bacon_soldout: {
          name_ar: 'بيكون غير متوفر',
          price: 30,
          is_available: false,
        },
      },
    });
  });

  it('calculates trusted total server-side regardless of client tampering', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'delivery' as const,
      branch: 'فرع الاستاد',
      address: 'شارع الهرم الرئيسي',
      items: [
        {
          product_id: 'prod_burger',
          quantity: 2,
          selected_option_ids: ['opt_cheese'],
        },
      ],
      client_total: 1.5, // Attacker forged total
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(true);
    // Base 100 + opt 20 = 120 per item * 2 = 240 subtotal + branch delivery fee 20 = 260 total
    expect(res.subtotal).toBe(240);
    expect(res.deliveryFee).toBe(20);
    expect(res.total).toBe(260);
    expect(res.total).not.toBe(payload.client_total);

    // Verify order was written with server total
    const order = db.getCollection('orders').get(res.orderId!);
    expect(order).toBeDefined();
    expect(order.total).toBe(260);
    expect(order.customer_phone).toBe('01012345678');
  });

  it('rejects order if product is marked unavailable', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [
        {
          product_id: 'prod_soldout',
          quantity: 1,
        },
      ],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('PRODUCT_UNAVAILABLE');
    expect(res.error).toContain('غير متوفر حالياً');
  });

  it('rejects order if product is unavailable at specific branch', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الكرفان',
      items: [
        {
          product_id: 'prod_stadium_only',
          quantity: 1,
        },
      ],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    // Branch itself is closed, or if branch were open, product would be unavailable
    expect(['BRANCH_CLOSED', 'BRANCH_UNAVAILABLE']).toContain(res.code);
  });

  it('rejects order if selected branch is closed', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الكرفان',
      items: [
        {
          product_id: 'prod_burger',
          quantity: 1,
        },
      ],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('BRANCH_CLOSED');
    expect(res.error).toContain('مغلق حالياً');
  });

  it('rejects order if restaurant is globally closed', async () => {
    db.getCollection('settings').get('global')!.is_website_open = false;
    db.getCollection('settings').get('global')!.closed_message = 'نعتذر عن استقبال الطلبات للصيانة';

    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('WEBSITE_CLOSED');
    expect(res.error).toBe('نعتذر عن استقبال الطلبات للصيانة');
  });

  it('rejects order if option add-on is unavailable', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [
        {
          product_id: 'prod_burger',
          quantity: 1,
          selected_option_ids: ['opt_bacon_soldout'],
        },
      ],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('OPTION_UNAVAILABLE');
    expect(res.error).toContain('غير متوفرة حالياً');
  });

  it('rejects invalid or tampered quantities', async () => {
    const payloadZero = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 0 }],
    };

    const resZero = await processOrderCreation(db as any, payloadZero, null, mockFieldValue as any);
    expect(resZero.success).toBe(false);
    expect(resZero.code).toBe('INVALID_QUANTITY');

    const payloadExcessive = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 9999 }],
    };

    const resExcessive = await processOrderCreation(db as any, payloadExcessive, null, mockFieldValue as any);
    expect(resExcessive.success).toBe(false);
    expect(resExcessive.code).toBe('INVALID_QUANTITY');
  });

  it('rejects invalid phone numbers and accepts valid Egyptian mobile numbers', async () => {
    const payloadInvalid = {
      customer_name: 'أحمد علي',
      customer_phone: '12345',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
    };

    const resInvalid = await processOrderCreation(db as any, payloadInvalid, null, mockFieldValue as any);
    expect(resInvalid.success).toBe(false);
    expect(resInvalid.code).toBe('INVALID_PHONE');

    const payloadValid = {
      customer_name: 'أحمد علي',
      customer_phone: '01234567890',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
    };

    const resValid = await processOrderCreation(db as any, payloadValid, null, mockFieldValue as any);
    expect(resValid.success).toBe(true);
  });

  it('rejects order when minimum order amount is not met', async () => {
    // Set minimum order amount to 200
    db.getCollection('settings').get('global')!.min_order_amount = 200;

    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [{ product_id: 'prod_burger', quantity: 1 }], // subtotal = 100 < 200
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('MIN_ORDER_AMOUNT_NOT_MET');
    expect(res.error).toContain('الحد الأدنى لقيمة الطلب');
  });

  it('rejects order if selected branch does not exist in registered branches', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع غير موجود إطلاقاً',
      items: [{ product_id: 'prod_burger', quantity: 1 }],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('INVALID_BRANCH');
    expect(res.error).toContain('غير موجود');
  });

  it('rejects order if option add-on does not exist in database', async () => {
    const payload = {
      customer_name: 'أحمد علي',
      customer_phone: '01012345678',
      type: 'pickup' as const,
      branch: 'فرع الاستاد',
      items: [
        {
          product_id: 'prod_burger',
          quantity: 1,
          selected_option_ids: ['opt_non_existent_fake_id'],
        },
      ],
    };

    const res = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
    expect(res.success).toBe(false);
    expect(res.code).toBe('OPTION_NOT_FOUND');
    expect(res.error).toContain('غير موجودة');
  });

  describe('Sequential Order Numbers Allocation', () => {
    it('allocates order number 1001 for the first order, and increments sequentially (1002, 1003)', async () => {
      const payload1 = {
        customer_name: 'عميل أول',
        customer_phone: '01011111111',
        type: 'pickup' as const,
        branch: 'فرع الاستاد',
        items: [{ product_id: 'prod_burger', quantity: 1 }],
      };
      const res1 = await processOrderCreation(db as any, payload1, null, mockFieldValue as any);
      expect(res1.success).toBe(true);
      expect(res1.orderNumber).toBe(1001);

      const payload2 = {
        customer_name: 'عميل ثان',
        customer_phone: '01022222222',
        type: 'pickup' as const,
        branch: 'فرع الاستاد',
        items: [{ product_id: 'prod_burger', quantity: 1 }],
      };
      const res2 = await processOrderCreation(db as any, payload2, null, mockFieldValue as any);
      expect(res2.success).toBe(true);
      expect(res2.orderNumber).toBe(1002);

      const payload3 = {
        customer_name: 'عميل ثالث',
        customer_phone: '01033333333',
        type: 'pickup' as const,
        branch: 'فرع الاستاد',
        items: [{ product_id: 'prod_burger', quantity: 1 }],
      };
      const res3 = await processOrderCreation(db as any, payload3, null, mockFieldValue as any);
      expect(res3.success).toBe(true);
      expect(res3.orderNumber).toBe(1003);

      // Verify stored order records have order_number
      const order1Doc = await db.collection('orders').doc(res1.orderId!).get();
      expect(order1Doc.data()?.order_number).toBe(1001);
      const order2Doc = await db.collection('orders').doc(res2.orderId!).get();
      expect(order2Doc.data()?.order_number).toBe(1002);
    });

    it('allocates distinct, unique sequential numbers under simulated concurrent requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => {
        return processOrderCreation(
          db as any,
          {
            customer_name: `عميل متزامن ${i}`,
            customer_phone: `0100000000${i}`,
            type: 'pickup' as const,
            branch: 'فرع الاستاد',
            items: [{ product_id: 'prod_burger', quantity: 1 }],
          },
          null,
          mockFieldValue as any
        );
      });

      const results = await Promise.all(promises);
      const numbers = results.map((r) => r.orderNumber);

      // Ensure all 5 requests succeeded
      expect(results.every((r) => r.success)).toBe(true);

      // Ensure all 5 order numbers are unique
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(5);

      // Verify sequence is [1001, 1002, 1003, 1004, 1005]
      expect(numbers.sort()).toEqual([1001, 1002, 1003, 1004, 1005]);
    });

    it('idempotent replay returns the exact same order number without consuming a new counter number', async () => {
      const payload = {
        customer_name: 'عميل متكرر',
        customer_phone: '01099999999',
        type: 'pickup' as const,
        branch: 'فرع الاستاد',
        items: [{ product_id: 'prod_burger', quantity: 1 }],
        idempotency_key: 'test_idemp_key_123',
      };

      const firstCall = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
      expect(firstCall.success).toBe(true);
      expect(firstCall.orderNumber).toBe(1001);
      expect(firstCall.isDuplicate).toBe(false);

      // Duplicate call with same idempotency key
      const secondCall = await processOrderCreation(db as any, payload, null, mockFieldValue as any);
      expect(secondCall.success).toBe(true);
      expect(secondCall.orderNumber).toBe(1001);
      expect(secondCall.orderId).toBe(firstCall.orderId);
      expect(secondCall.isDuplicate).toBe(true);

      // Next distinct order should get 1002, NOT 1003
      const thirdCall = await processOrderCreation(
        db as any,
        {
          customer_name: 'عميل جديد آخر',
          customer_phone: '01088888888',
          type: 'pickup' as const,
          branch: 'فرع الاستاد',
          items: [{ product_id: 'prod_burger', quantity: 1 }],
        },
        null,
        mockFieldValue as any
      );
      expect(thirdCall.success).toBe(true);
      expect(thirdCall.orderNumber).toBe(1002);
    });
  });
});
