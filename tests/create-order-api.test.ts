import { describe, it, expect, vi, beforeEach } from 'vitest';
import createHandler from '../api/orders/create';
import { resetMemoryRateLimiter } from '../src/server/rateLimiter';

let mockIsAdminConfigured = true;
let mockProcessOrderResult: any = {
  success: true,
  orderId: 'ord_test_123',
  orderNumber: 1005,
  total: 100,
  subtotal: 80,
  deliveryFee: 20,
  isDuplicate: false,
};

vi.mock('../src/server/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => mockIsAdminConfigured,
  getFirebaseAdmin: () => ({
    adminDb: {},
    adminAuth: {
      verifyIdToken: async (token: string) => {
        if (token === 'valid_token') return { uid: 'user_123' };
        throw new Error('Invalid token');
      },
    },
  }),
}));

vi.mock('../src/server/orderEngine', () => ({
  processOrderCreation: async () => mockProcessOrderResult,
}));

describe('Serverless Order Creation API (/api/orders/create)', () => {
  beforeEach(() => {
    resetMemoryRateLimiter();
    mockIsAdminConfigured = true;
    mockProcessOrderResult = {
      success: true,
      orderId: 'ord_test_123',
      orderNumber: 1005,
      total: 100,
      subtotal: 80,
      deliveryFee: 20,
      isDuplicate: false,
    };
  });

  it('returns 500 with FIREBASE_CREDENTIALS_MISSING when Firebase Admin credentials are not configured', async () => {
    mockIsAdminConfigured = false;

    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'POST',
      headers: {},
      body: { customer_name: 'عميل تجريبي', customer_phone: '01011112222', items: [] },
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

    await createHandler(req, res);

    expect(responseStatus).toBe(500);
    expect(responseBody.success).toBe(false);
    expect(responseBody.code).toBe('FIREBASE_CREDENTIALS_MISSING');
    expect(responseBody.details).toContain('Missing FIREBASE_SERVICE_ACCOUNT_KEY');
  });

  it('successfully processes order and returns orderId & orderNumber when credentials and payload are valid', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'POST',
      headers: {},
      body: {
        customer_name: 'أحمد',
        customer_phone: '01011112222',
        branch: 'فرع الاستاد',
        type: 'pickup',
        items: [{ product_id: 'prod_1', quantity: 1 }],
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

    await createHandler(req, res);

    expect(responseStatus).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.orderId).toBe('ord_test_123');
    expect(responseBody.orderNumber).toBe(1005);
  });

  it('rejects invalid JSON payloads with 400', async () => {
    let responseStatus = 0;
    let responseBody: any = null;

    const req: any = {
      method: 'POST',
      headers: {},
      body: '{ invalid_json ',
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

    await createHandler(req, res);

    expect(responseStatus).toBe(400);
    expect(responseBody.code).toBe('INVALID_JSON');
  });
});
