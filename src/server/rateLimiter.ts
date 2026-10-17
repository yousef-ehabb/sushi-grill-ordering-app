export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  mode: 'upstash_redis' | 'in_memory_fallback';
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  prefix: string;
}

// In-memory sliding window bucket for development, test, and fallback environments
interface MemoryBucket {
  count: number;
  resetAtMs: number;
}

const memoryStore = new Map<string, MemoryBucket>();

// Periodic cleanup of expired memory buckets (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of memoryStore.entries()) {
      if (bucket.resetAtMs <= now) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (cleanup.unref) cleanup.unref();
}

/**
 * Extract client IP safely from request headers
 */
export function getClientIp(req: any): string {
  if (!req || !req.headers) return '127.0.0.1';

  let rawIp = '';
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    rawIp = forwarded.split(',')[0].trim();
  } else if (typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip'].length > 0) {
    rawIp = req.headers['x-real-ip'].trim();
  } else {
    rawIp = req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
  }

  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:192.0.2.1)
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.slice(7);
  }

  // Strip port if IPv4 address has port suffix (e.g. 192.168.1.1:54321)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(rawIp)) {
    rawIp = rawIp.split(':')[0];
  }

  return rawIp.trim() || '127.0.0.1';
}

/**
 * Rate limit check against Upstash Redis REST API or in-memory fallback
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  const sanitizedId = encodeURIComponent(identifier || '127.0.0.1');
  const key = `ratelimit:${config.prefix}:${sanitizedId}`;
  const now = Date.now();

  // 1. Upstash Redis integration (when configured in production)
  if (upstashUrl && upstashToken) {
    try {
      // Pipeline: INCR key, EXPIRE key windowSeconds NX, TTL key
      const pipelineRes = await fetch(`${upstashUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', key],
          ['EXPIRE', key, config.windowSeconds, 'NX'],
          ['TTL', key],
        ]),
      });

      if (pipelineRes.ok) {
        const data = await pipelineRes.json();
        const count = Number(data[0]?.result) || 1;
        const ttl = Number(data[2]?.result) || config.windowSeconds;
        const resetAt = Math.floor(now / 1000) + (ttl > 0 ? ttl : config.windowSeconds);
        const remaining = Math.max(0, config.maxRequests - count);

        return {
          allowed: count <= config.maxRequests,
          limit: config.maxRequests,
          remaining,
          resetAt,
          mode: 'upstash_redis',
        };
      } else {
        console.warn(`[RateLimiter] Upstash Redis returned non-200 status (${pipelineRes.status}), falling back to in-memory`);
      }
    } catch (err) {
      console.warn('[RateLimiter] Upstash Redis request failed, falling open to in-memory fallback:', err);
    }
  } else if (isProduction) {
    console.warn('[RateLimiter] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing in production. Falling back to local in-memory limiter.');
  }

  // 2. In-Memory fallback store
  let bucket = memoryStore.get(key);
  if (!bucket || bucket.resetAtMs <= now) {
    bucket = {
      count: 1,
      resetAtMs: now + config.windowSeconds * 1000,
    };
    memoryStore.set(key, bucket);
  } else {
    bucket.count += 1;
  }

  const remaining = Math.max(0, config.maxRequests - bucket.count);
  const resetAt = Math.ceil(bucket.resetAtMs / 1000);

  return {
    allowed: bucket.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining,
    resetAt,
    mode: 'in_memory_fallback',
  };
}

/**
 * Apply rate limit headers to HTTP response
 */
export function applyRateLimitHeaders(res: any, result: RateLimitResult): void {
  if (!res || !res.setHeader) return;

  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(result.resetAt));
  res.setHeader('X-RateLimit-Mode', result.mode);

  if (!result.allowed) {
    const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
    res.setHeader('Retry-After', String(retryAfter));
  }
}

/**
 * Helper to clear in-memory store (for testing purposes)
 */
export function resetMemoryRateLimiter(): void {
  memoryStore.clear();
}
