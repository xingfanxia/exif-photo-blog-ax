import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and
  // .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};

// ESM-only deps that leak into the jsdom module graph (camelcase-keys →
// map-obj, nanoid) must be SWC-transformed, not ignored, or they crash
// suites at import with "Unexpected token 'export'". next/jest's own
// transformIgnorePatterns only allow-lists `geist`, and the patterns are
// OR-ed, so a separately-appended pattern can't UN-ignore a package. We
// therefore resolve next/jest's config and REPLACE transformIgnorePatterns,
// extending its allow-list with our ESM-only deps. pnpm stores real files
// under node_modules/.pnpm/<pkg>@<ver>/.
//
// LIMITATION: the regex only un-ignores deps whose first `.pnpm/` segment
// is exactly `<name>@<ver>`. A scoped/aliased copy (e.g. `@alloc+quick-lru@`)
// would stay ignored. imports-smoke.test.ts is the safety net: if a future
// `pnpm install` reshuffles the tree so a needed dep resolves via an aliased
// parent, that suite crashes at import and flags the drift here.
//
// Keep ESM_DEPS in sync with top-level ESM-only imports in src/
// (grep "from '<pkg>'"). `geist` is not imported in this repo today; it is
// retained to mirror next/jest's own default allow-list (harmless no-match
// if absent) so an upstream pull that adds the geist font Just Works.
// See PLOG-1 / UPSTREAM.md / __tests__/imports-smoke.test.ts.
const ESM_DEPS = [
  'geist',
  // camelcase-keys + its transitive ESM-only deps (all zero-dep leaves)
  'camelcase-keys', 'map-obj', 'camelcase', 'quick-lru',
  'nanoid',
];
const ESM_ALT = ESM_DEPS.join('|');

// Live-network integration suites unfit for a deterministic CI gate.
// github.test.ts hits the real GitHub REST API (rate-limited → flaky) to
// exercise the "is this fork behind upstream?" feature. Excluded from
// `jest --ci` so the 0-failed-suites gate stays honest; still runnable
// directly (`npx jest github`). The upstream test file is left byte-
// identical (fork discipline). See PLOG-1 / UPSTREAM.md.
const LIVE_NETWORK_TESTS = ['<rootDir>/__tests__/github.test.ts'];

const exportedConfig = async (): Promise<Config> => {
  const baseConfig = await createJestConfig(config)();
  return {
    ...baseConfig,
    transformIgnorePatterns: [
      `/node_modules/(?!.pnpm)(?!(${ESM_ALT})/)`,
      `/node_modules/.pnpm/(?!(${ESM_ALT})@)`,
      '^.+\\.module\\.(css|sass|scss)$',
    ],
    testPathIgnorePatterns: [
      ...(baseConfig.testPathIgnorePatterns ?? ['/node_modules/']),
      ...LIVE_NETWORK_TESTS,
    ],
  };
};

export default exportedConfig;
