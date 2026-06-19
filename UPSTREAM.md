# UPSTREAM.md — fork-divergence registry

This repo is a fork of [`sambecker/exif-photo-blog`](https://github.com/sambecker/exif-photo-blog).

**Contract:** `main` stays byte-identical to `sambecker/main`. All AX work lives
on `ax/*` branches. Divergence is **additive-preferred** (new files over edits).
Every unavoidable edit to an upstream-tracked ("hot") file is logged below so a
future `sambecker/main` pull can be reconciled deliberately, never by surprise.

How to verify the contract:

```bash
git fetch sambecker
git diff --stat sambecker/main...HEAD          # every entry below should appear
git diff --stat sambecker/main...main          # MUST be empty
```

---

## Divergence log

Legend: **NEW** = file added by the fork (no merge conflict possible) ·
**EDIT** = in-place change to an upstream file (reconcile on pull).

### PLOG-1 — Honest test signal (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `src/platforms/redis.ts` | EDIT | `import { Redis }` → `import type { Redis }`; value `require('@upstash/redis')` made lazy inside `getRedis()`, gated on `REDIS_URL`+`REDIS_TOKEN`. Stops the ESM-only SDK (`uncrypto`) leaking into the jsdom module graph and crashing 6 suites at import. No runtime behavior change (client still built only when both creds set). | If upstream refactors `getRedis`, re-apply the type-only import + lazy require. |
| `jest.config.ts` | EDIT | Switched to async config form to **replace** next/jest's `transformIgnorePatterns` (its patterns are OR-ed and only allow-list `geist`, so an appended pattern can't un-ignore a pkg). Allow-lists ESM-only deps (`camelcase-keys`,`map-obj`,`camelcase`,`quick-lru`,`nanoid`,+`geist`) for SWC transform. Excludes the live-network `github.test.ts` from the CI gate via `testPathIgnorePatterns`. | Keep the async wrapper if upstream changes jest config; re-merge the ESM allow-list. |
| `package.json` | EDIT | Added `"test:ci": "jest --ci"` (gate script; upstream only had an unusable `jest --watch`). Removed the bogus placeholder flag `--transformIgnorePatterns 'node_modules/(?!my-library-dir)/'` from `test` so interactive `pnpm test` also gets the honest signal from the config file. | Re-add `test:ci`; drop the placeholder flag again if a pull reintroduces it. |
| `__tests__/imports-smoke.test.ts` | NEW | Regression guard: static-imports the previously-crashing module chain + asserts redis stays lazy. Doubles as the safety net for `transformIgnorePatterns` drift. | None (additive). |

### PLOG-2 — Fork contract + config-fork scaffold + branch cleanup (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `CLAUDE.md` | NEW | Fork contract, upstream-sync procedure, `platforms/` module-map, keep-as-is assets, conventions. Additive — no upstream equivalent. | None. |
| `src/app/config-fork.ts` | NEW | `export *` from `@/app/config` + home for fork-only config (populated PLOG-8/12). Keeps `config.ts` byte-identical. | None. |

**Branch cleanup (owner-confirmed 2026-06-19):** 12 stale `ax/*` + `feature/*`
+ remote-only (`gen-ai`, `vercel/…rce…`) branches — 330–1209 commits behind
`main`, last activity Jan–Jul 2025 — were **archive-tagged then deleted**
(local + origin). Recover any via `git checkout -b <name> archive/<name>`
(tags pushed to origin). Surviving branches: `main`, `ax/overhaul`,
`backup/main-pre-upstream-reset-2026-06-17`.

### PLOG-3 — Explicit ordered migration runner (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `src/db/query.ts` | EDIT | Removed the JIT-DDL-from-read path (3-deep `migrationForError` nested catch + auto-`createPhotosTable`/`createAlbumsTable`/`createAboutTable` on missing-relation). `safelyQuery` now only retries `endpoint in transition` + logs/re-throws. Migrations run explicitly via `runMigrations`. | If upstream changes `safelyQuery`, keep the JIT-DDL removed; re-apply the trim. |
| `src/db/migration.ts` | EDIT | Deleted `migrationForError` (only query.ts used it). `MIGRATIONS[]` unchanged. | Re-delete if a pull reintroduces it. |
| `src/platforms/postgres.ts` | EDIT | Removed the no-op `catch (error) { throw error }` in `query()` (kept `finally { client.release() }`); **exported `pool`** so the runner can hold a dedicated client for the advisory lock. | Re-apply; keep `pool` exported. (SELECt typo + pool tuning are PLOG-8.) |
| `jest.config.ts` | EDIT | Added `moduleNameMapper {'^@/(.*)$':'<rootDir>/src/$1'}` so `jest.mock('@/…')` + runtime `require('@/…')` resolve (SWC only rewrites static imports). | Keep on merge. |
| `package.json` | EDIT | Added `db:migrate` script + `tsconfig-paths` devDep (CLI runner needs `@/` resolution under ts-node). | Re-add. |
| `src/db/migrate.ts` | NEW | `runMigrations()`/`ensureBaseTables()` + `schema_migrations` ledger; serialized by a session `pg_advisory_lock` on a dedicated client (concurrency-safe across parallel deploy instances). | None (additive). |
| `app/api/admin/migrate/route.ts` | NEW | Admin-gated POST entry (single admin-credentials provider → `session?.user` is the admin check) that calls `runMigrations()`. | None (additive). |
| `scripts/db/migrate.ts` + `tsconfig.scripts.json` | NEW | Standalone CLI bootstrap entry (`npm run db:migrate`, loads `.env.local`) — the fresh-DB / predeploy path. ts-node-runnable via the scripts tsconfig. | None (additive). |

**Note (vestigial fields):** `Migration.table?`/`fields[]` in `migration.ts` are now unused (their only consumer, `migrationForError`, was deleted). Left in place to keep the upstream MIGRATIONS[] diff minimal; the runner keys solely on `label`. **Migration 10** (`ALTER COLUMN iso TYPE INTEGER`, unguarded) is a same-type no-op on the fork's base schema and the `schema_migrations` ledger + atomic lock ensure it runs at most once — so the upstream SQL is left untouched.

### PLOG-4 — DB indexes via the runner (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `src/db/index.ts` | EDIT | (a) `parameterizeForDb` now emits a call to an IMMUTABLE SQL fn `photo_normalize_field()` (exported `PHOTO_NORMALIZE_FUNCTION_DDL`) instead of inline `REGEXP_REPLACE(LOWER(TRIM()))` — required because LOWER is only STABLE on Supabase ICU collation, so inline expression indexes throw. WHERE + index call the SAME fn. (b) `PHOTO_SEARCH_EXPRESSION` uses `COALESCE+\|\|` (IMMUTABLE) not `CONCAT` (STABLE → rejected by the trgm index). (c) tag filter rewritten `$n=ANY(tags)` → `tags @> ARRAY[$n]::varchar[]` (GIN-indexable). All behavior-preserving. | Keep all three; re-apply if a pull reverts the query builder. |
| `src/db/indexes.ts` | NEW | 14 idempotent CREATE INDEX + `PG_TRGM_EXTENSION_DDL`. Feed indexes are PARTIAL (`(taken_at DESC) WHERE hidden IS NOT TRUE`, +compound with exclude_from_feeds) not composite. Expression/trgm indexes use the shared IMMUTABLE fn + COALESCE expr. | None (additive). |
| `src/db/migrate.ts` | EDIT | `runMigrations` runs `CREATE EXTENSION pg_trgm` + the IMMUTABLE normalizer fn + the index set after column migrations; per-index try/catch (loud log) collects failures and throws an aggregate so one bad index can't silently skip the search index. Result includes `indexes[]`. | None. |

**Deferred to live-data EXPLAIN (PLOG-4 review M2/N1):** verify the 5 plain GROUP-BY btrees (make/model/film/recipe_title/focal_length) are actually used vs HashAggregate at blog scale (drop if dead weight); confirm `tags @> ARRAY[$1]` uses `idx_photos_tags_gin` and expression indexes are Index-Scanned (not Seq Scan). Needs photos in the DB.

### PLOG-5 — Edit-page lazy blur + lazy AI thumbnail (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `app/admin/photos/[photoId]/edit/page.tsx` | EDIT | Use persisted `photo.blurData`; stop computing the AI thumbnail at render; drop the `imageThumbnailBase64`/recomputed-blur props. | Keep the lazy approach; re-apply if upstream reworks the edit page. |
| `app/api/admin/photos/[photoId]/ai-thumbnail/route.ts` | NEW | Admin-gated GET returning the AI thumbnail base64 on demand (502 on empty). | None (additive). |
| `src/photo/PhotoEditPageClient.tsx` | EDIT | Drop `imageThumbnailBase64` prop; add a `getImageThumbnailBase64` thunk (fetches the route). | Re-apply. |
| `src/photo/form/usePhotoFormParent.ts` | EDIT | Accept `imageThumbnailBase64?` (upload) OR `getImageThumbnailBase64?` (edit). | Re-apply. |
| `src/photo/ai/useAiImageQueries.ts` | EDIT | Build a once-resolved (retry-able) thumbnail resolver shared across the 5 sub-queries. | Re-apply. |
| `src/photo/ai/useAiImageQuery.ts` | EDIT | First param now a lazy `getImageBase64` thunk; loud error on empty. | Re-apply. |
| `src/photo/ai/useTitleCaptionAiImageQuery.ts` | EDIT | Thread the lazy thunk. | Re-apply. |

### PLOG-8 — pg.Pool tuning + Supabase SSL fix (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `src/platforms/postgres.ts` | EDIT | `ssl: true` → `ssl: { rejectUnauthorized: false }` (Supabase pooler cert chain fails default verification; TLS still encrypts). Added `max: 3` + `idleTimeoutMillis`/`connectionTimeoutMillis: 10s` for the transaction pooler. Fixed `SELECt`→`SELECT` typo. | Keep the SSL relaxation + pool caps on merge. |

**Security note:** `rejectUnauthorized: false` skips TLS cert-chain verification (still encrypted). Empirically required for this Supabase pooler. Hardening option if desired: ship Supabase's CA cert and use `ssl: { ca, rejectUnauthorized: true }`.

---

> Maintained per the overhaul plan (`docs/overhaul/07-IMPLEMENTATION-PLAN.md`).
> Conventions and the upstream-sync procedure live in `CLAUDE.md`.

### PLOG-6 — R2 image loader + variants (branch `ax/overhaul`)

| File | Kind | What & why | Pull-reconcile note |
|---|---|---|---|
| `src/photo/imageLoader.ts` + `__tests__/imageLoader.test.ts` | NEW | Pure custom Next image loader (width→R2 variant, passthrough); shared variant table. | None (additive). |
| `next.config.ts` | EDIT | `images.loader:'custom'` + `loaderFile` + `imageSizes` from the shared module. | Keep the loader wiring on merge. |
| `src/platforms/next-image.ts` | EDIT | `NextCustomSize` derived from the shared variant module (was bare `200`). | Re-apply. |
| `src/feed/programmatic.ts` | EDIT | Feeds serve the direct R2 variant (`useNextImage:false`). | Re-apply. |
| `src/photo/storage/index.ts` | EDIT | Exported `OPTIMIZED_FILE_SIZES` (loader desync ref). | Keep export. |
| `src/platforms/storage/cloudflare-r2.ts` | EDIT | `cloudflareR2Delete` → `return await` (loud failures). | Re-apply. |
| `src/photo/storage/server.ts` | EDIT | Parallelized the sm/md/lg variant writes (`Promise.all`). | Re-apply. |
| `src/components/image/ImageMedium.tsx` | EDIT | Responsive card `sizes` default. | Re-apply. |
