import { describe, it, expect, vi } from 'vitest';
import trackHandler from '../api/orders/track';

const mockOrders: Record<string, any> = {
  ord_alice_1: {
    customer_name: 'أليس (طلب قديم بدون رقم تسلسلي)',
    customer_phone: '01011112222',
    address: 'عنوان خاص جداً لشقة أليس',
    type: 'delivery',
    branch: 'فرع الاستاد',
    subtotal: 100,
    delivery_fee: 20,
    total: 120,
    status: 'preparing',
    created_at: '2026-10-16T12:00:00Z',
    items: [{ name_ar: 'سوبر برجر', quantity: 1, unit_price: 100 }],
  },
  ord_bob_1001: {
    order_number: 1001,
    customer_name: 'بوب',
    customer_phone: '01122223333',
    address: 'عنوان بوب السري',
    type: 'pickup',
    branch: 'فرع الاستاد',
    subtotal: 150,
    delivery_fee: 0,
    total: 150,
    status: 'new',
    created_at: '2026-10-16T13:00:00Z',
    items: [{ name_ar: 'سوبر برجر دبل', quantity: 1, unit_price: 150 }],
  },
};

vi.mock('../src/server/firebaseAdmin', () => ({
  getFirebaseAdmin: () => ({
    adminDb: {
      collection: () => ({
        doc: (id: string) => ({
          get: async () => ({
            id,
            exists: !!mockOrders[id],
            data: () => mockOrders[id],
          }),
        }),
        where: (field: string, op: string, value: any) => ({
          limit: (_n: number) => ({
            get: async () => {
              const matches = Object.entries(mockOrders)
                .filter(([_, data]) => op === '==' && data[field] === value)
                .map(([id, data]) => ({
                  id,
                  exists: true,
                  data: () => data,
                }));
              return {
                empty: matches.length === 0,
                docs: matches,
              };
            },
          }),
        }),
      }),
    },
    adminAuth: {},
  }),
}));

describe('Order Tracking Privacy & Isolation', () => {
  it('allows order tracking when the orderId and customer phone match', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'GET',
      query: {
        orderId: 'ord_alice_1',
        phone: '01011112222',
      },
    };

    const res: any = {
      setHeader: vi.fn(),
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    await trackHandler(req, res);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.order.id).toBe('ord_alice_1');
    expect(responseBody.order.status).toBe('preparing');
    expect(responseBody.order.total).toBe(120);

    // Ensure sensitive customer address is NOT exposed in the tracking response
    expect(responseBody.order.address).toBeUndefined();
  });

  it('rejects order tracking with 404 if phone does not match to prevent IDOR enumeration', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'GET',
      query: {
        orderId: 'ord_alice_1',
        phone: '01099999999', // Attacker guessed orderId but does not know customer phone
      },
    };

    const res: any = {
      setHeader: vi.fn(),
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    await trackHandler(req, res);

    expect(responseStatus).toBe(404);
    expect(responseBody.success).toBe(false);
    expect(responseBody.code).toBe('NOT_FOUND');
    expect(responseBody.order).toBeUndefined();
  });

  it('rejects order tracking with 404 for non-existent order ID', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'GET',
      query: {
        orderId: 'non_existent_order_id',
        phone: '01011112222',
      },
    };

    const res: any = {
      setHeader: vi.fn(),
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    await trackHandler(req, res);

    expect(responseStatus).toBe(404);
    expect(responseBody.success).toBe(false);
  });

  it('allows order tracking using sequential order number (1001) with matching phone', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'GET',
      query: {
        orderId: '1001', // Customer enters 1001 instead of internal doc ID
        phone: '01122223333',
      },
    };

    const res: any = {
      setHeader: vi.fn(),
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    await trackHandler(req, res);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.order.id).toBe('ord_bob_1001');
    expect(responseBody.order.order_number).toBe(1001);
    expect(responseBody.order.total).toBe(150);
    expect(responseBody.order.customer_name).toBe('بوب');
    // Ensure sensitive customer address is not exposed
    expect(responseBody.order.address).toBeUndefined();
  });

  it('rejects order tracking with 404 when tracking by valid order number (1001) but wrong phone', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'GET',
      query: {
        orderId: '1001',
        phone: '01012345678', // Incorrect phone
      },
    };

    const res: any = {
      setHeader: vi.fn(),
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    await trackHandler(req, res);

    expect(responseStatus).toBe(404);
    expect(responseBody.success).toBe(false);
    expect(responseBody.code).toBe('NOT_FOUND');
    expect(responseBody.order).toBeUndefined();
  });

  it('maintains backwards compatibility for legacy orders without order_number using internal doc ID', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'GET',
      query: {
        orderId: 'ord_alice_1', // Legacy internal ID
        phone: '01011112222',
      },
    };

    const res: any = {
      setHeader: vi.fn(),
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        return this;
      },
    };

    await trackHandler(req, res);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.order.id).toBe('ord_alice_1');
    expect(responseBody.order.order_number).toBeNull();
  });
});
