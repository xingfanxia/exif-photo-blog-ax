/**
 * Regression guard for the eager-import class of bug (PLOG-1).
 *
 * `src/platforms/redis.ts` used to statically `import { Redis } from
 * '@upstash/redis'`, whose ESM-only transitive deps (uncrypto) cannot be
 * transformed by jest's default `transformIgnorePatterns`. That import
 * leaked through the module graph
 *   redis.ts → config.ts → path.ts → focal/tag → photo → utility/exif
 * and crashed 6 of 16 suites AT IMPORT — making every "tests pass" gate a
 * lie. The same class also hid behind `camelcase-keys` (→ map-obj /
 * camelcase / quick-lru) and `nanoid`, now SWC-transformed via
 * jest.config.ts's transformIgnorePatterns allow-list.
 *
 * These static imports ARE the assertion: on regression the suite fails to
 * load (the exact original symptom). The body additionally asserts each
 * module exposes a public surface so the guard can't silently no-op.
 */
import * as redis from '@/platforms/redis';
import * as config from '@/app/config';
import * as configFork from '@/app/config-fork';
import * as path from '@/app/path';
import * as focal from '@/focal';
import * as photo from '@/photo';
import * as exif from '@/utility/exif';

describe('module import smoke test', () => {
  it('loads the previously-crashing module chain without throwing', () => {
    const modules: [string, Record<string, unknown>][] = [
      ['@/platforms/redis', redis],
      ['@/app/config', config],
      ['@/app/config-fork', configFork],
      ['@/app/path', path],
      ['@/focal', focal],
      ['@/photo', photo],
      ['@/utility/exif', exif],
    ];
    for (const [name, mod] of modules) {
      expect(mod).toBeDefined();
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    }
  });

  it('config-fork re-exports a superset of upstream config (PLOG-2)', () => {
    // Every upstream config export must be reachable through config-fork so a
    // call site can switch the import without losing any binding.
    for (const key of Object.keys(config)) {
      expect(key in configFork).toBe(true);
    }
  });

  it('redis client stays lazy — no SDK in the static graph', () => {
    // getRedis() with no REDIS_URL/REDIS_TOKEN returns undefined WITHOUT
    // requiring the ESM-only @upstash/redis SDK; normalizeRedisUrl is pure.
    expect(typeof redis.getRedis).toBe('function');
    expect(redis.normalizeRedisUrl('rediss://example.com:6379'))
      .toBe('https://example.com');
    expect(redis.normalizeRedisUrl(undefined)).toBeUndefined();
  });
});
