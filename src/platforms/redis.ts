import type { Redis } from '@upstash/redis';

/**
 * Normalizes a Redis URL for use with @upstash/redis:
 * SDK requires an HTTPS REST URL, but some providers (e.g. Vercel KV)
 * supply native `rediss://` protocol URL. This converts `rediss://` to
 * `https://` by extracting hostname, so either format works.
 */
export const normalizeRedisUrl = (
  url?: string,
): string | undefined => {
  if (!url || !url.startsWith('rediss://')) return url;
  try {
    return `https://${new URL(url).hostname}`;
  } catch {
    return url;
  }
};

const KEY_TEST = 'test';

// Two-state sentinel: `null` = not yet resolved; `undefined` = resolved with
// no client (REDIS_URL/REDIS_TOKEN unset) so we never re-evaluate per call.
let _redis: Redis | undefined | null = null;

/**
 * Lazily builds the client so `config` can import `normalizeRedisRestUrl`
 * from this module first.
 */
export const getRedis = (): Redis | undefined => {
  if (_redis === null) {
    const { REDIS_URL, REDIS_TOKEN } =
      require('@/app/config') as typeof import('@/app/config');
    if (REDIS_URL && REDIS_TOKEN) {
      // Lazy value-require: keeps the @upstash/redis SDK (ESM-only
      // `uncrypto` dep) out of the static module graph so importing
      // `config` under jsdom/jest doesn't crash. Type is import-type only.
      const { Redis } =
        require('@upstash/redis') as typeof import('@upstash/redis');
      _redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
    } else {
      _redis = undefined;
    }
  }
  return _redis;
};

export const warmRedisConnection = () => {
  const redis = getRedis();
  if (redis) { redis.get(KEY_TEST); }
};

export const testRedisConnection = () => {
  const redis = getRedis();
  return redis ? redis.get(KEY_TEST) : Promise.reject(false);
};
