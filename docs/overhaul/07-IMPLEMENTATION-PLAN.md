# Implementation Plan — exif-photo-blog Overhaul (corrected, execution-ready)

> Synthesized from the 13-agent implementation-plan workflow (winning philosophy: **STOP-THE-BLEEDING-FIRST**, judged 9.5/10) + the fork-vs-rewrite decision (`06`). **Two adversarial reviews caught and corrected real factual/sequencing errors in the draft** — every must-fix below is applied. Decision basis: **fix the fork, disciplined-strangler** (`06`); owner steer "upstream quiet" → structural tier (PLOG-10/11/13) is *included*, fencing relaxed, cheap `UPSTREAM.md`/`CLAUDE.md` insurance kept.

Sequencing rule: **pain × (1/risk)**. Three phases — Foundations (honest gates, zero user risk) → Pain-relief (the four owner-reported pains) → Architecture (deferred last, behind a now-honest test signal). Each milestone ships an independent PR, leaves `main` green + upstream-pullable, and carries a **verification oracle**.

## ⚠️ Corrections applied from adversarial review (do not re-introduce)
- **`jest` is currently a LYING oracle**: `src/platforms/redis.ts:1` eager-imports `@upstash/redis`, leaking through `config.ts → path.ts → focal → photo` and crashing **6 of 16 suites at import** (actual: `6 failed / 28 passed`). Until fixed, every "tests pass" gate is false. (No fabricated "18 of 46" figure — jest can't enumerate `it()` in import-crashed suites; the honest gate is "0 failed suites".)
- **Build the explicit migration runner BEFORE indexes.** `createPhotosTable` is one `sql` tagged-template (can't hold `CREATE TABLE + N CREATE INDEX`), and it only runs inside `safelyQuery`'s column-error catch — which `CREATE INDEX IF NOT EXISTS` never triggers — so indexes are **inert on prod** until a real runner applies them. Each index = its own statement, applied via the runner.
- **Detail-page (PLOG-6) is NOT a naive waterfall**: `getPhotoCached → getPhotosNearIdCached` are dependency-ordered (second is conditional on `photo.excludeFromFeeds`), already wrapped in a shared React `cache()` memo used by both `generateMetadata` and the page, and `excludeFromFeeds` is already a query option. Keep only: ISR, in-viewport prefetch, static-limit raise.
- **AI cast bug stated precisely**: v6 `Output.object({schema})` (`openai.ts:104`) *does* validate; the unsound `as z.infer<T>` (`:121`) is a re-cast **after** post-processing → fix = re-`.parse()` the post-processed object + one tolerant retry. **Verify all model IDs live against the AI Gateway catalog at implementation time** (never from doc text — `gpt-5.2` being stale proves drift).
- **`docs/overhaul/06` already exists** (this decision doc). Tracked set = `00`–`07` (8 files). No new `06-decisions.md`.
- Migration labels are **dynamic** (`MIGRATIONS[]` already has 11) — never hardcode "label 11".

---

## Phase A — Foundations (pure-additive, zero user-facing risk, make gates honest)

### ✅ PLOG-1 — Honest test signal + track docs `[deps: none]` — DONE (ax/overhaul)
> Oracle met: `npx jest --ci` → **16 suites / 16 passed, 0 failed** (was 6 failed), deterministic across runs; imports-smoke green; docs/overhaul tracked = 9 (≥8). Root cause was broader than redis alone — a transitive ESM-only subtree (`@upstash/redis→uncrypto`, `camelcase-keys→{map-obj,camelcase,quick-lru}`, `nanoid`) leaked through the jsdom graph; fixed via lazy redis require + `transformIgnorePatterns` allow-list (the class fix). Live-network `github.test.ts` excluded from the gate. Divergences logged in `UPSTREAM.md` (created early).
- `src/platforms/redis.ts:1`: move the top-level `import { Redis } from '@upstash/redis'` to a lazy `await import()`/`require` **inside `getRedis()`** (already lazy at `:28`) — stops the SDK leaking into the jsdom module graph.
- `package.json`: add `"test:ci": "jest --ci"` (only script today is `jest --watch`, unusable as a gate).
- `__tests__/imports-smoke.test.ts` (new): assert the previously-crashing modules import cleanly under jsdom — permanent regression guard for the eager-import class.
- `git add docs/overhaul/` (00–07).
- **Oracle:** `npx jest --ci` → `16 suites / 16 passed, 0 failed` (was 6 failed). `git ls-files docs/overhaul/ | wc -l` ≥ 8. imports-smoke green.

### ✅ PLOG-2 — Fork contract (`CLAUDE.md`) + minimal `config-fork.ts` scaffold + branch cleanup `[deps: PLOG-1]` — DONE (ax/overhaul)
> Oracle met: `CLAUDE.md` = 92 lines (<150); `git diff --stat sambecker/main...HEAD -- src/app/config.ts` **empty**; 12 stale branches archive-tagged (recoverable via `archive/*`, pushed to origin) + deleted local+remote — `git branch` now only main/ax-overhaul/backup. `config-fork.ts` re-exports config (smoke-test verifies superset). Divergences logged in `UPSTREAM.md`.
- `CLAUDE.md` (new, <150 lines, additive → never conflicts on merge): `main MUST stay == sambecker/main, AX work on ax/*`; upstream-sync procedure + **which `next.config.ts` hunks are AX's and why** (the one unavoidable hot-file divergence); verdict "fix don't rewrite" → `06`; conventions (env via `config.ts`/`config-fork.ts`, max-len 80, tests in `__tests__/`, the migration mechanism + index caveat); the `platforms/` module-map (infra clients vs camera-EXIF decoders); record the grid is **deliberately not de-cliented** (bundle acceptable).
- `src/app/config-fork.ts` (new, minimal scaffold now): `export *` from `@/app/config` + a home for fork-only facts. Landing it here resolves the PLOG-8↔PLOG-12 circular dep (PLOG-8 writes its AI vars into this file; PLOG-12 expands it). **`config.ts` stays byte-identical to upstream.**
- **Real decision on the 11 stale `ax/*` + `feature/*` branches** (500–665 file diffs from a 2025-01 merge-base = unmergeable archaeology): delete or archive-tag them; AI work is re-derived fresh per `03`/PLOG-8. (Not just "record" — act.)
- **Oracle:** `wc -l CLAUDE.md` <150; `git diff --stat sambecker/main...HEAD -- src/app/config.ts` **empty**; stale branches gone (`git branch` clean) or tagged `archive/*`.

---

## Phase B — Pain-relief (the four owner-reported pains, S/M effort, low risk)

### 🟡 PLOG-3 — Explicit ordered migration runner (kill JIT-migration-on-error) `[deps: PLOG-1]`  *(promoted before indexes per review)* — CODE DONE; live-apply gated
> Code oracle met: `npx jest --ci` → **17 suites / 49 passed**; new `__tests__/migrate.test.ts` (4 tests) verifies FK-safe base-table order, ordered apply on fresh DB, idempotent no-op when recorded, partial-state apply. JIT-DDL-from-read removed from `safelyQuery` (kept only the `endpoint in transition` retry + loud re-throw); `migrationForError` deleted (no callers); `postgres.ts` no-op catch removed. New: `src/db/migrate.ts` (`runMigrations`/`ensureBaseTables` + `schema_migrations` ledger), admin-gated `app/api/admin/migrate/route.ts`.
> **Consequence:** with JIT-DDL gone, the schema must be created by the runner BEFORE the app/`next build` queries it. **Live-apply is owner-gated** (Critical Decision Trigger).
> Reviews done (code-reviewer + database-reviewer): CRITICAL concurrency race fixed via session `pg_advisory_lock` on a dedicated client (`pool` now exported); partial-failure re-run window closed by the lock; bootstrap path added (`npm run db:migrate` CLI via `scripts/db/migrate.ts` + `tsconfig.scripts.json`, verified to load + reach `pool.connect()`); migrate.test.ts now 6 tests (incl. lock acquire/release + release-on-throw). `npx jest --ci` → **17 suites / 51 passed**.
> **To bootstrap the empty live DB:** `npm run db:migrate` (loads `.env.local`) — or POST `/api/admin/migrate` signed-in. Branch-DB EXPLAIN idempotency oracle runs at live-apply.
- Keep `MIGRATIONS[]` as ordered source of truth; make every entry idempotent.
- `app/api/admin/migrate/route.ts` (new, admin-gated) or a predeploy step: create `schema_migrations` if absent, apply pending migrations in order, record each label — **outside** any query catch.
- `src/db/query.ts:10-110`: delete the 3-deep nested catch + `migrationForError`-driven auto-DDL from the read path; keep the genuine re-throw + the `endpoint is in transition` retry. (Also remove the separate no-op `try/catch` in `postgres.ts` that only re-throws.) Remove `migrationForError` once no caller remains.
- **Oracle (Supabase BRANCH db, never prod first):** runner once → all tables + migrations applied + `schema_migrations` populated in order; second run = no-op; a normal `getPhotos` read shows **no DDL side-effect** in the log. `npx jest --ci` green. (Tier-4 schema change → `database-reviewer` pass before prod.)

### 🟡 PLOG-4 — DB indexes (via the runner) `[deps: PLOG-3]` — CODE DONE; live EXPLAIN gated
> Code oracle met: `src/db/indexes.ts` (new) defines 13 idempotent `CREATE INDEX IF NOT EXISTS` (each its own statement) + `CREATE EXTENSION IF NOT EXISTS pg_trgm`, wired into `runMigrations` after the column migrations. Expression indexes (make/model/lens) + the trgm search index are generated from the SAME `parameterizeForDb`/`PHOTO_SEARCH_EXPRESSION` exported from `db/index.ts` (can't desync with the WHERE clauses). migrate.test.ts asserts the extension + indexes are issued. `npx jest --ci` → **17 suites / 52 passed**; `npm run build` → **exit 0** (build tolerates the empty/missing schema — JIT-DDL removal did NOT break build).
> **database-reviewer found a BLOCKING bug (fixed):** `LOWER`/`CONCAT` are only STABLE on Supabase's ICU collation → inline expression + trgm indexes would throw `must be marked IMMUTABLE` and (no error isolation) abort the whole index loop. Fixed: IMMUTABLE `photo_normalize_field()` fn used by both WHERE + indexes; `PHOTO_SEARCH_EXPRESSION` → COALESCE/`||`; partial feed indexes (H2) + compound partial (H3); `tags @> ARRAY[$1]` GIN rewrite (N1); per-index loud-log + aggregate-throw (L3). `npx jest --ci` → **17 suites / 53 passed**; `npm run build` → exit 0.
> **Deferred (needs live DB + data):** `pg_indexes` list + `EXPLAIN ANALYZE` index-scan oracle; verify the 5 plain GROUP-BY btrees aren't dead weight (M2) + GIN/expression indexes are used (N1). Runs at bootstrap + after photos exist.
- Add the index set the builder's predicates require, **each as its own `CREATE INDEX IF NOT EXISTS` statement** applied through the PLOG-3 runner (not stuffed into the single-statement `createPhotosTable`): btree `(hidden, taken_at DESC)`, `(hidden, created_at DESC)`, `gin(tags)`, btrees for the GROUP-BY aggregations (make/model, film, recipe_title, focal_length), `pg_trgm gin` on the search expression, and **expression indexes that exactly match `parameterizeForDb`'s `REGEXP_REPLACE(LOWER(TRIM(col)))`** for make/model/lens (a one-function-off expression index is silently unused).
- **Confirm `pg_trgm` is enabled** on the Supabase tier (`CREATE EXTENSION IF NOT EXISTS pg_trgm`); pin the exact search-expression string as a shared constant so the index and the query can't desync.
- **Oracle:** on a branch DB, `SELECT indexname FROM pg_indexes WHERE tablename='photos'` lists every index; `EXPLAIN ANALYZE` on a `$1=ANY(tags)` filter and the title/caption ILIKE shows Index/Bitmap scan (not Seq Scan). App behavior byte-identical.

### 🟡 PLOG-5 — Edit-page lazy blur + lazy AI thumbnail (owner's #1 pain) `[deps: PLOG-1]` — CODE DONE; browser perf-trace gated
> Code oracle met: edit `page.tsx` no longer calls `blurImageFromUrl`/`resizeImageFromUrl` at render (grep-clean) — blur uses persisted `photo.blurData`; the AI thumbnail is fetched lazily on AI-click via new admin-gated `app/api/admin/photos/[photoId]/ai-thumbnail/route.ts`. The base64 props are removed from the RSC tree (`PhotoEditPageClient`); the AI hooks (`useAiImageQuery`/`useTitleCaptionAiImageQuery`/`useAiImageQueries`/`usePhotoFormParent`) take a lazy resolver (promise-cached, retry-able) — upload keeps the direct base64 path. `npx jest --ci` → 17/53; `npm run build` → exit 0. code-reviewer pass: fixed the failed-fetch-cached-forever regression (retry-able cache) + route 502-on-empty + loud error on empty base64.
> **Deferred (needs running app + photos + AI key):** `chrome-devtools` before/after edit-open perf trace + "AI-generate still works on click" browser check.
- **Reframed (review):** blur (`blurImageFromUrl`) and the AI thumbnail (`resizeImageFromUrl`) are gated by `BLUR_ENABLED` / `AI_CONTENT_GENERATION_ENABLED` (`edit/page.tsx:54-65`) — **not unconditional**. *When those flags are on*, every edit-page open does a blocking full-image fetch+sharp pass that is **pure waste**: `blur_data` is already persisted (`query.ts:50/128`), and the thumbnail is only needed on AI-button click.
- `edit/page.tsx:61-65`: use stored `photo.blur_data` instead of `blurImageFromUrl(...)`.
- `edit/page.tsx:55-59,77`: stop computing `imageThumbnailBase64` at render; move to a new lazy route handler (`app/api/admin/photos/[photoId]/ai-thumbnail/route.ts`) invoked on AI-generate click.
- Stop threading `imageThumbnailBase64`/`blurData` as base64 RSC props (`PhotoEditPageClient.tsx`, `usePhotoFormParent.ts`, `useAiImageQueries.ts`). Leave the `resizeImage/blurImage` primitives intact.
- **Oracle (capture a BASELINE first):** server log on edit-open shows **zero** `blur/resizeImageFromUrl` calls (was the flag-gated passes); `chrome-devtools performance_start_trace` before/after shows the response-time drop with the captured numbers (not "seconds→sub-second" by assertion); RSC payload no longer carries the base64 strings; AI-generate still works on click; non-AI edit round-trips unchanged.

### PLOG-6 — Image delivery via R2/Cloudflare loader + `sizes` + serve variants (perf #2/#3 AND egress) `[deps: PLOG-2]`
- `src/photo/imageLoader.ts` (new, pure, client+server safe): map a **rendered display-slot width → nearest stored variant suffix** via one explicit mapping (stored variants are `sm=200 / md=640 / lg=1080`; display slots are `SMALL=50 / MEDIUM=300 / LARGE=1000` — **do not conflate the two axes**), return the **absolute** Cloudflare variant URL (not a relative `/cdn-cgi` path — breaks on Vercel); fall back to `src` unchanged for non-R2 hosts (QR, vercel-blob).
- `next.config.ts`: `images.loader:'custom'`, `images.loaderFile:'./src/photo/imageLoader.ts'`; set `imageSizes` from the **single shared slot→variant mapping module** (resolve the "shared import in next.config" feasibility — next.config runs before `@/` aliases; use a relative import or inline the constant and assert equality in a test, since `IMAGE_QUALITY` is already duplicated for this exact reason).
- `src/platforms/next-image.ts:9`: replace the prose-comment-coupled `NextCustomSize = 200` with an import from that shared module (or a build-time assert) so the two files can't silently desync.
- `ImageWithFallback.tsx:62` + Image{Small,Medium,Large} + `components/image/index.ts`: thread a real `sizes` prop (card: `(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw`).
- `src/feed/programmatic.ts:21`: `useNextImage:false` so feeds serve the direct variant.
- **Grafted storage fixes (review):** (a) `cloudflare-r2.ts:101` `cloudflareR2Delete` — `return await ...send()` so deletion failures are loud (currently fire-and-forget); (b) parallelize `storeOptimizedPhotosForUrl`'s variant loop (`server.ts:23-24` serial `await`-in-`for`) with `Promise.all` over `OPTIMIZED_FILE_SIZES`; (c) document + test the dense `getFileNamePartsFromStorageUrl` regex the loader depends on (a mis-parse silently falls back to `/_next/image` and regresses egress undetected).
- **Oracle:** `chrome-devtools list_network_requests` on grid + a `/p/[id]` detail → image bytes go to `photos.xiax.xyz` (absolute), **zero `/_next/image`**; response widths match the slot (no 640 for a 300 slot); `emulate_device` sweep (iPhone 14 Pro / Pixel 7 / iPad) confirms srcset; `next-image.ts` and `next.config.ts` share one size source (grep). `npm run build` succeeds.

### PLOG-7 — Detail ISR + in-viewport prefetch + static-limit `[deps: PLOG-6]`
- **Corrected (review):** keep ONLY the real changes — `app/p/[photoId]/page.tsx`: add `export const revalidate = 3600` (no ISR today → photos beyond `GENERATE_STATIC_PARAMS_LIMIT=1000` are SSR every request). **Do NOT** "Promise.all the waterfall" or "filter excludeFromFeeds in WHERE" — both already done/dependency-ordered.
- `PhotoMedium.tsx:23`: drive `prefetch` from the existing `useVisibility` observer (prefetch in-viewport cards) instead of the global `SHOULD_PREFETCH_ALL_LINKS` (off) → card click stops being a cold navigation.
- Raise `GENERATE_STATIC_PARAMS_LIMIT` toward the real library size if confirmed >1000 (set in `config-fork.ts`).
- Optional polish: pass `animateOnFirstLoadOnly`/`staggerOnFirstLoadOnly` on the grid + drop entrance duration 0.6→0.3 so back-to-grid doesn't replay the stagger.
- **Oracle:** scrolling the homepage triggers prefetch of in-viewport `/p/[id]` routes; a beyond-1000 detail returns from ISR cache on 2nd hit (`x-vercel-cache: HIT`); `chrome-devtools` photo-open trace shows reduced TTI vs a captured baseline.

### PLOG-8 — Infra confirm + `pg.Pool` tuning `[deps: none — independent, can run anytime]`
- **⚠️ REGION (updated 2026-06-19): DB moved to AWS Tokyo `ap-northeast-1`** (new Supabase project `mhivudssocofqzujqbxa`). Vercel's default `iad1` (US-East) would be a **trans-Pacific hop (~150ms+ per round trip)** on every dynamic/admin/build query (this *reverses* the earlier "region latency ruled out" finding, which assumed us-east-1↔iad1). ✅ **Already shipped:** an additive `vercel.json` with `"regions": ["hnd1"]` (Tokyo) is committed on `ax/overhaul`. **Human-gated confirms still needed:** verify in the Vercel dashboard that functions execute in `hnd1` after deploy; Supabase tier **non-pausing** (free-tier 7-day pause = prime cold-`卡` cause); Fluid Compute ON. Record in `04 §5`.
- `postgres.ts:5-13`: set explicit small `max` (1–3 per warm instance against the transaction pooler) + `idleTimeoutMillis` + `connectionTimeoutMillis` (default max 10 × many warm instances can exhaust the Supabase pooler under burst). Fix the `SELECt` typo (`:59`).
- **Oracle:** dashboard confirms region/tier (recorded in `04`); post-tuning `npm run build` + a smoke load shows no connection-timeout errors.

---

## Phase C — Architecture (deferred last, behind the now-honest test signal; included per quiet-upstream steer)

### PLOG-9 — AI: provider-agnostic `ai.ts` (Gateway) + injectable model + typed schema + `normalizeAiResult` `[deps: PLOG-1, PLOG-2]`
- `src/platforms/ai.ts` (new, replaces `openai.ts`): `getVisionModel(model?: LanguageModel)` factory — no injection → `gateway(AI_MODEL)` with `providerOptions.gateway.models` fallback chain; `OPENAI_SECRET_KEY`/`OPENAI_BASE_URL` → legacy `createOpenAI` escape hatch. Every exported fn takes an optional model param (provider indirection **and** test seam — tests pass `MockLanguageModelV2` from `ai/test`). Rename the 4 import sites (`photo/actions.ts`, `photo/ai/server.ts`, `photo/color/server.ts`, `admin/actions.ts`). **Verify the default + fallback model IDs live against the AI Gateway catalog at implementation time** (use the `vercel:ai-gateway` skill) — do NOT copy `gemini-3.1-flash-lite` etc. from this doc.
- **Cast→parse (stated precisely):** v6 `Output.object` already validates against the schema; the gap is the `as z.infer<T>` re-cast at `openai.ts:121` **after** `Object.fromEntries + cleanUpAiTextResponse`. Call `schema.parse()` on the post-processed object; add one tolerant retry with a stricter "respond ONLY with valid JSON…" suffix on parse failure.
- `src/photo/ai/prompts.ts` (new): dimension-driven system prompt; `GENERIC_TAG_DENY_LIST` exported and consumed by **both** prompt and post-processor.
- `src/photo/ai/index.ts:113`: `tags` `z.string()` (CSV) → `z.array(z.string()).min(4).max(10)`; `.max()` caps on title/caption/semantic.
- `src/photo/ai/normalizeAiResult.ts` (new, pure): trim/strip-markdown; tags → lowercase/kebab/dedupe/drop-deny-list/cap/soft-merge with existing tags. Adapt CSV consumers.
- AI gate: `AI_CONTENT_GENERATION_ENABLED = Boolean(OPENAI_SECRET_KEY || AI_GATEWAY_API_KEY)` + `AI_MODEL`/`AI_MODEL_FALLBACK`/`AI_GATEWAY_API_KEY` — **in `config-fork.ts`** (not `config.ts`); drop the `OPENAI_MODEL='compatible'` magic sentinel + stale `gpt-5.2` default.
- `__tests__/ai-generate.test.ts` (new, TDD-first, `MockLanguageModelV2`): tags-array schema parses; `normalizeAiResult` enforces count/deny-list/dedupe/lowercase; malformed mock → exactly one retry.
- **Oracle:** new suite green offline/credential-free; deliberately malformed mock → one retry then typed parse; live smoke (real key) → tags as deduped lowercase array in [4,10], no deny-list terms; grep → zero `@/platforms/openai` imports, no `as z.infer<T>` without a preceding `.parse()`.

### PLOG-10 — Batch AI backfill worker (standalone Node) + idempotency columns `[deps: PLOG-9]`
- `src/db/migration.ts` + `createPhotosTable`: add `metadata_status` + `input_hash` columns — **reference the next available `MIGRATIONS[]` label dynamically** (already 11 entries; do not hardcode "11"). These ARE column-adds, so they fit the runner.
- `scripts/ai-backfill/index.ts` (new standalone Node worker, NOT a route handler — avoids 60s/4.5MB caps): `sha256` `input_hash` over (image bytes + prompt-version + model); skip `metadata_status=done && hash matches`; provider Batch API (50% off), `custom_id=photo-{id}`, annotate-and-continue, resubmit only failed sub-batch; **reuse `getVisionModel` + `normalizeAiResult`** (one impl shared with live upload).
- Per-upload stays real-time with `p-limit(5)` + `Retry-After` backoff.
- **Oracle:** run against seeded test photos / branch DB → first run sets status+hash; second run skips all (idempotent); a forced-fail item is annotated and the batch continues.

### PLOG-11 — Typed SQL→TS boundary with zod (`PhotoRowSchema`) — kill the double-`as unknown` cast `[deps: PLOG-3]`
- `src/photo/index.ts`: `PhotoRowSchema` (zod) mirroring real columns + JSONB shapes; derive `PhotoDb` via `z.infer` (one definition); replace `as unknown as PhotoDb` with `PhotoRowSchema.parse(camelcaseKeys(raw))` (loud throw with context). Model the `recipeData` string|object legacy branch as `z.union`; parse `colorData`.
- `src/album/index.ts`: same. A `z.coerce.number()` helper for the ~12 hand-`parseInt` `COUNT(*)` bigint-as-string sites. `postgres.ts:17`: stop defaulting `query<T = any>`.
- `__tests__/photo.test.ts`: valid row, null-tags, legacy string `recipeData`, malformed `colorData` (must throw loudly).
- **Oracle:** new parse tests green incl. the malformed-throw; a renamed-column fixture throws a field-named error (not a silent wrong object); grep → no `as unknown as PhotoDb`.

### PLOG-12 — `config-fork.ts` expansion + input-boundary zod validation `[deps: PLOG-9, PLOG-11]`
- Expand `config-fork.ts` (scaffolded in PLOG-2): surface `PHOTO_ID_FORWARDING_TABLE` (today a hidden `JSON.parse(process.env...)` at `photo/index.ts:219`), and **also the other flagged config leaks**: `ADMIN_EMAIL`/`ADMIN_PASSWORD` (`auth/server.ts:15-16`) and the re-derived `NEXT_PUBLIC_VERCEL_ENV` (`image-response/cache.ts:2`); reconcile the duplicated `IMAGE_QUALITY` logic (`next.config.ts:72` vs `config.ts:263`).
- `src/photo/form/index.ts:392-478`: `photoFormSchema` (`z.coerce.number()` for numeric EXIF fields — kills the NaN-unsafe `parseInt/parseFloat` + the `(photoForm as any)[key]` escapes); parse inside `convertFormDataToPhotoDbInsert`; actions surface structured validation errors.
- `app/api/storage/presigned-url/[key]/route.ts`: validate/sanitize `key` (zod) before signing.
- `.env.example` (new, tracked): every consumed env var grouped by feature + the AI Gateway vars; drop orphaned `NEXT_PUBLIC_CAMERAS_FIRST`; migrate `NEXT_PUBLIC_SITE_TITLE → NEXT_PUBLIC_META_TITLE` per the in-code deprecation map.
- `__tests__/photo-form.test.ts`: malformed FormData (non-numeric fNumber, empty id) → coercion + rejection.
- **Oracle:** form-validation tests green; `git diff --stat sambecker/main...HEAD -- src/app/config.ts` stays **empty**; `test -f .env.example`.

### PLOG-13 — Consolidate the 3 query-assembly re-impls onto one `ParamBuilder` + DB integration tier `[deps: PLOG-3, PLOG-11]`
- **Characterization test FIRST (review must-fix):** `__tests__/integration/photo-query.test.ts` exercising the `$N` binding (the `getPhotosNearId` CTE/row_number round-trip, `$1=ANY(tags)`, ILIKE) must exist and pass against **current** code, and **run in CI** for this milestone (not skipped) — else the off-by-one it removes can silently return.
- `src/db/query.ts`: `ParamBuilder` encapsulating `$N` (`pb.add(value)→'$3'`), removing the mutable `valuesIndex/lastValuesIndex` hand-threading contract; collapse the two coexisting parameterization schemes into one documented convention.
- `src/photo/query.ts`: refactor `_getPhotos`, `getPhotosNearId` (the fragile CTE), `getPhotosMeta` to compose ONE wheres/select fragment through the shared builder.
- **Oracle:** unit suite green + binding unchanged (a query returning N photos still returns N); integration suite passes (round-trip + `ANY(tags)` + ILIKE) and asserts the indexes exist; `EXPLAIN` on the consolidated CTE still index-scans.

### PLOG-14 — Split `PhotoForm` + auth-gate the admin layout + typed `StorageAdapter` `[deps: PLOG-12, PLOG-13]`
- `PhotoForm.tsx` (732 lines): extract the 5 sync `useEffect`s → `useFormSync`; `accessory/footer/isFieldHidden` → `fieldRenderers`; the ~280-line per-key switch → a `renderField` map / small components; thumbnail → `FormThumbnail`. **Public props IDENTICAL** + a **render-smoke/e2e assertion** that both call sites (`PhotoEditPageClient.tsx:85`, `UploadPageClient.tsx:74`) behave identically (review must-fix — don't assert "still works" by hand).
- `app/layout.tsx:110-142`: gate the admin subtree (`SelectPhotosProvider`, `AdminUploadPanel`, `AdminBatchEditPanel`, modals) behind `isUserSignedIn` so anonymous visitors (~80% of traffic) don't mount admin JS or trigger `AdminBatchEditPanel`'s albums+tags fetch.
- `AppStateProvider.tsx`: peel AUTH/UPLOAD/DEBUG out of the ~290-line mega-context into concern-scoped providers behind an API-compatible `useAppState` facade.
- `CommandK.tsx:7-16`: make the 8-aggregation block non-blocking for first paint (hydrate via the existing SWR path / Suspense, not an awaited `Promise.all` in the root layout).
- **Grafted (review):** introduce a typed `StorageAdapter` interface + single `ADAPTERS` lookup replacing the 5 duplicated `switch` statements in `storage/index.ts`; add the missing `console.error` to the `.catch(()=>[])` swallowed storage-list errors.
- **Oracle:** anonymous homepage load → network panel shows **no** AdminBatchEditPanel fetch + no admin JS chunks; create+edit both work (render-smoke assertion); no extracted file >800 lines; `chrome-devtools` confirms CommandK no longer gates first paint.

---

## Dependency graph (corrected)
```
PLOG-1 ─┬─ PLOG-3(runner) ── PLOG-4(indexes) ── PLOG-11 ─┐
        ├─ PLOG-5(edit)                                   ├─ PLOG-13 ── PLOG-14
        └─ PLOG-9(AI) ── PLOG-10(backfill)                │
PLOG-2 ─┴─ PLOG-6(images) ── PLOG-7(prefetch/ISR)         │
PLOG-8(infra) — independent, run anytime          PLOG-12 ┘ (deps PLOG-9, PLOG-11)
```
First user-visible relief lands at **PLOG-5 + PLOG-6** (the edit-page fix + image delivery) — week 1–2, before any structural refactor. Phases B-pain (PLOG-5/6/7) and C (9→10, 11→12→13→14) are the included structural tier per the quiet-upstream steer.

## Open items to confirm (calibrate; cheap)
- Library size (>1000 → detail SSR; raises PLOG-4/7/8 priority). DB was unreachable from the research sandbox — confirm via the admin dashboard.
- `pg_trgm` available on the Supabase tier (PLOG-4).
- Vercel region + Supabase non-pausing tier (PLOG-8, human-gated).
