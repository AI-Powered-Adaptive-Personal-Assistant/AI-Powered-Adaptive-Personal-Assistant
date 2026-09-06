/**
 * In-Memory Sliding-Window Rate Limiter for AI Serverless Endpoints (Point 12)
 * Protects AI provider quotas from abuse and unauthorized scraping.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const clientMap = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  for (const [key, record] of clientMap.entries()) {
    record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
    if (record.timestamps.length === 0) {
      clientMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

/**
 * Checks and records a request against a sliding-window rate limit.
 * @param identifier Unique key (e.g. UID or Client IP)
 * @param maxPerMinute Maximum allowed requests per 60 seconds (default 60)
 */
export function checkRateLimit(
  identifier: string,
  maxPerMinute: number = 60
): RateLimitResult {
  const now = Date.now();
  const windowMs = 60 * 1000;

  let record = clientMap.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    clientMap.set(identifier, record);
  }

  // Filter timestamps within the current sliding window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= maxPerMinute) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return {
      allowed: false,
      limit: maxPerMinute,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  return {
    allowed: true,
    limit: maxPerMinute,
    remaining: maxPerMinute - record.timestamps.length,
    resetMs: windowMs,
  };
}