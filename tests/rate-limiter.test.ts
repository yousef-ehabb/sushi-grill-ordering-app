import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkRateLimit,
  getClientIp,
  applyRateLimitHeaders,
  resetMemoryRateLimiter,
} from '../src/server/rateLimiter';
import trackHandler from '../api/orders/track';

vi.mock('../src/server/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => true,
  getFirebaseAdmin: () => ({
    adminDb: {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false }),
        }),
      }),
    },
    adminAuth: {},
  }),
}));

describe('Server Rate Limiting & Abuse Protection', () => {
  beforeEach(() => {
    resetMemoryRateLimiter();
  });

  it('allows requests within the configured threshold and decrements remaining quota', async () => {
    const config = { maxRequests: 3, windowSeconds: 60, prefix: 'test_limit' };
    const ip = '192.168.1.100';

    const res1 = await checkRateLimit(ip, config);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = await checkRateLimit(ip, config);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await checkRateLimit(ip, config);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);

    // 4th request exceeds quota
    const res4 = await checkRateLimit(ip, config);
    expect(res4.allowed).toBe(false);
    expect(res4.remaining).toBe(0);
  });

  it('isolates rate limit quotas between different IP addresses (shared IP support)', async () => {
    const config = { maxRequests: 2, windowSeconds: 60, prefix: 'test_ip_isolation' };
    const ipA = '10.0.0.1';
    const ipB = '10.0.0.2';

    // Exhaust IP A
    await checkRateLimit(ipA, config);
    await checkRateLimit(ipA, config);
    const blockedA = await checkRateLimit(ipA, config);
    expect(blockedA.allowed).toBe(false);

    // IP B must still be permitted
    const resB = await checkRateLimit(ipB, config);
    expect(resB.allowed).toBe(true);
    expect(resB.remaining).toBe(1);
  });

  it('sets standard rate limit and Retry-After headers', () => {
    const headers: Record<string, string> = {};
    const mockRes = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    };

    const blockedResult = {
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 60,
      mode: 'in_memory_fallback' as const,
    };

    applyRateLimitHeaders(mockRes, blockedResult);

    expect(headers['X-RateLimit-Limit']).toBe('10');
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(headers['X-RateLimit-Mode']).toBe('in_memory_fallback');
    expect(headers['Retry-After']).toBeDefined();
    expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
  });

  it('correctly extracts client IP from X-Forwarded-For proxy header', () => {
    const reqWithProxy = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
    };
    expect(getClientIp(reqWithProxy)).toBe('203.0.113.195');

    const reqWithRealIp = {
      headers: {
        'x-real-ip': '198.51.100.22',
      },
    };
    expect(getClientIp(reqWithRealIp)).toBe('198.51.100.22');
  });

  it('returns HTTP 429 when order tracking endpoint limit is exceeded', async () => {
    const ip = '41.233.12.99';
    let statusCode = 0;
    let jsonBody: any = null;
    const responseHeaders: Record<string, string> = {};

    const req: any = {
      method: 'GET',
      headers: {
        'x-forwarded-for': ip,
      },
      query: {
        orderId: 'some_order_id',
        phone: '01011112222',
      },
    };

    const res: any = {
      setHeader(name: string, val: string) {
        responseHeaders[name] = val;
      },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
        return this;
      },
    };

    // Simulate sending 31 requests (limit is 30)
    for (let i = 0; i < 30; i++) {
      await trackHandler(req, res);
    }

    // 31st request must trigger 429 Too Many Requests
    await trackHandler(req, res);

    expect(statusCode).toBe(429);
    expect(jsonBody.success).toBe(false);
    expect(jsonBody.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(responseHeaders['Retry-After']).toBeDefined();
  });
});
