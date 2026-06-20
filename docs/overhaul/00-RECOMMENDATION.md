# exif-photo-blog Overhaul — Final Recommended Path

> Decision memo, 2026-06-19. Evidence: direct code/`.env.local` reads (`01`), DB+egress research (`02`), AI stack research (`03`), performance design + PerfAudit (`04`). Repo is at `sambecker/main` latest (0/0 with upstream — step "checkout upstream main" already satisfied).

---

## TL;DR — the verdict

1. **DO NOT rewrite the project.** The fork is already on the modern architecture a rewrite would target (Next 16 / React 19 / RSC, AI SDK v6, fully-abstracted storage with R2 live, static optimization ON, Supabase pooled). Every reported problem is a **targeted fix inside the existing codebase**, not an architecture flaw. A rewrite throws away a well-maintained upstream you can keep pulling from and re-introduces every one of these same issues.
2. **"Postgres too slow → Redis/Turso?" → Keep Postgres (Supabase).** Redis **cannot** serve these relational queries (it stays a cache/rate-limit layer). Turso/SQLite would force rewriting the entire Postgres-dialect SQL layer for edge-read latency you don't need. The real slowness is **missing indexes + cold-start + an expensive edit-page code path**, not the engine.
3. **The "卡" and the "egress cost" are largely the SAME fix:** stop routing images through Vercel Image Optimization; serve them straight from **R2 via Cloudflare** (already your origin). This cuts both perceived latency and the bill (~$16–55/mo → ~$1–3/mo at 100 GB).
4. **AI stack: targeted rewrite** — route through **Vercel AI Gateway**, default model **`google/gemini-3.1-flash-lite`** (your `gpt-5.2` default is a ~10–15× overspend), typed Zod schema + code-enforced invariants, better prompts, batch backfill.

---

## Your three symptoms → root causes (answering "你确定吗")

My earlier "pages are static so they're fast" was only half right: **static optimization renders the HTML skeleton, not the image bytes, and does not cover admin/edit pages** — which is exactly where you clicked.

| Your symptom | Root cause (with evidence) | Severity |
|---|---|---|
| **编辑图片信息巨慢** (edit photo info) | `app/admin/photos/[photoId]/edit/page.tsx:55-65` — every edit-page open does **two blocking full-image downloads + sharp passes** server-side: `resizeImageFromUrl` (AI thumbnail) + `blurImageFromUrl` (blur regen) — *even though `blur_data` is already stored in the DB.* Multi-MB original, fetched twice, before render. | 🔴 #1 |
| **load image card 巨慢** | Grid cards use `next/image` → **Vercel `/_next/image`** (no custom loader; R2 host in `remotePatterns`). Each new size is transformed on Vercel on first hit (cache-miss latency), no `sizes` prop, plus ~60 images/page. | 🔴 #2 |
| **图片详情最慢** | Same Vercel-optimization hop on the largest display variant (`IMAGE_WIDTH_LARGE=1000`), plus related-photos grid + (for photos beyond the 1000 static-gen limit) dynamic SSR + cold-cache category aggregations gating the layout. | 🔴 #3 |

Cross-cutting amplifier confirmed by **both** my read and the perf audit: the `photos` table has **only a primary key — no index on `(hidden, taken_at)`, no GIN on `tags`, no trigram on the ILIKE search**. These slow the build-time static generation, every dynamic/admin/search query, and the 8-aggregation `CommandK` block awaited in the root layout (`src/cmdk/CommandK.tsx:7-16`) on cold cache.

---

## Workstream A — AI generation stack (your ask #1)

**Targeted rewrite of `src/platforms/openai.ts` → `src/platforms/ai.ts`** (~2 files changed + 1 prompt file + 1 migration + 1 backfill script). Back-compatible via env.

- **Vercel AI Gateway, provider-agnostic.** v6 ships the Gateway in the `ai` package (no new dep). Pass `"creator/model"` to `model:`; tokens cost the same as direct; built-in fallback chain, observability, cost tracking. Keep `OPENAI_BASE_URL`/`OPENAI_SECRET_KEY` as a self-hosted escape hatch.
- **Default model `google/gemini-3.1-flash-lite`** ($0.25/$1.50 per 1M); fallback `['openai/gpt-5-mini','anthropic/claude-haiku-4-5']`. Backfilling the whole library is **sub-dollar** (~$0.34 batch). Current `gpt-5.2` default = ~10–15× overspend.
- **Type the schema:** `tags: z.array(z.string()).min(4).max(10)` (not a CSV string), `.max()` length caps on title/caption/semantic; **enforce invariants in code** (normalize/dedupe/kebab-case/deny-list) — don't trust the model. Stay on `generateText` + `Output.object`.
- **Better prompts:** dimension-driven system prompt, positive specificity over negation, 2–4 few-shot image+tag pairs, **soft** existing-tag bias (for large libraries, retrieve top-~20 via pgvector instead of dumping all tags), light internal CoT kept out of the persisted schema.
- **Batch backfill** via 50%-off Batch APIs from a **standalone worker script** (not a Vercel function), with `sha256` `input_hash` idempotency + a `metadata_status` column + annotate-and-continue; per-upload stays real-time with `p-limit(5)` + `Retry-After` backoff.

Full detail + sourced pricing table: `03-ai-stack-design.md`.

---

## Workstream B — Performance (your ask #2)

Ordered by **your pain × effort**:

1. **Fix the edit page (biggest UX win, lowest risk — owner's #1 pain).** In `app/admin/photos/[photoId]/edit/page.tsx:55-65`: (a) use the stored `photo.blur_data` instead of `blurImageFromUrl`; (b) generate the AI thumbnail **lazily** on "AI generate" click (a route handler), not on page load. Removes **2 blocking full-image downloads + sharp passes** per edit open. Then split the 732-line `src/photo/form/PhotoForm.tsx` into a server shell + small client islands (stop shipping color/recipe/film/album logic as one client blob) and stop passing `imageThumbnailBase64`/`blurData` as base64 RSC props.
2. **Serve images directly from R2/Cloudflare — bypass Vercel Image Optimization** (this is also the egress fix, Workstream C). Add a custom `next.config` `images.loader` returning the **absolute** Cloudflare-domain URL (optionally Cloudflare Image Resizing). **Sub-1-hr quick wins even before the loader:** add a `sizes=` prop to `ImageWithFallback` (no `sizes` today → cards request 640px for a 300px slot), set `imageSizes:[200,300]` (300 = card width, stops upscaling to 640px), and serve the **already-generated `-md`/`-lg` variants** instead of the raw `photo.url`. Removes the cache-miss transform latency on cards + detail. (Precise diffs in `04` §4.5.)
3. **Speed up "首页点图打开慢" — the real levers are prefetch + detail ISR + image delivery, NOT bundle size.** PerfAudit quantified the grid/detail client bundle at **~65–80 KB (framer-motion + cmdk), rated acceptable** (viewerjs lazy; OpenLayers only on `/about`; color libs server-only). So the slow open is the **cold navigation** (`SHOULD_PREFETCH_ALL_LINKS` off → enable prefetch for in-viewport cards) landing on a **SSR/transform-heavy detail page** (fixed by ISR in #7 + image delivery in #2). *Optional polish:* de-client the grid / replace the per-tile framer-motion stagger (`AnimateItems.tsx:119-136`, 60+ motion nodes) with CSS or first-load-only — runtime nicety, not a bundle problem.
4. **Add the 3 indexes** (migration + `createPhotosTable`): `CREATE INDEX … ON photos (hidden, taken_at DESC)`, `… USING gin(tags)`, and a `pg_trgm` GIN on the title/caption/semantic search expression. Speeds build-time static gen, the `CommandK` layout aggregations, search, and all category/tag pages.
5. **⚠️ Set the Vercel function region to `hnd1` (Tokyo)** — the DB moved to AWS Tokyo `ap-northeast-1` (2026-06-19, new Supabase project), so the default `iad1` (US-East) is now a trans-Pacific hop on every dynamic/admin/build query. Also **confirm Supabase isn't auto-pausing**. (Add `regions:['hnd1']` via `vercel.json`/`vercel.ts`, or set in dashboard.)
6. **Defer OpenLayers on `/about`** with `dynamic(() => import('./PlaceMap'), { ssr: false })` — removes ~230–300 KB eager JS on that route.
7. **Detail page (cheap wins):** add `export const revalidate = 3600` (no ISR today → photos beyond the 1000 static limit are SSR every request), parallelize the photo→nearby-photos data waterfall in `app/p/[photoId]/page.tsx`, and raise `GENERATE_STATIC_PARAMS_LIMIT` toward the real library size.
8. **Minor:** scope `revalidateAllKeysAndPaths` to the affected entity instead of invalidating the whole site per edit; Redis is currently dormant (caching already works via Vercel Data Cache) — leverage or leave as-is.

Full detail: `04-performance-design.md` (infra/ranking) + `05-code-level-deep-dive.md` (edit form / photo-open / grid architecture, the "it's a code problem" findings).

---

## Workstream C — Storage + DB + egress (your ask #3, "stay on Vercel, minimize egress")

- **Blob → R2: already done** (`photos.xiax.xyz` Cloudflare custom domain). The remaining leak is the Vercel Image Optimization layer (B-2). Fixing that makes R2's free egress actually count: **~$16–55/mo → ~$1–3/mo at 100 GB, and flat instead of traffic-scaling.** Then drop the leftover Vercel Blob token once fully migrated.
- **DB: keep Postgres on Supabase.** It runs your relational SQL (`ANY(tags)`, ILIKE, EXTRACT, INTERVAL, JOINs) verbatim, you're already integrated, pooled string already in use. Fixes = indexes (B-3) + non-pausing tier + region check (B-4).
  - **Redis = cache/rate-limit only** (KV physically can't answer these queries). **Turso = rejected** (full SQL-layer rewrite, no payoff at this scale + co-located).
  - *Optional optimization, not required:* Neon Postgres (HTTP driver, scale-to-zero that stays reachable) if you ever hit the Supabase free-tier pause problem or want lowest serverless handshake latency. Not worth a migration today if Supabase is on a non-pausing tier.

Full detail + sourced pricing: `02-db-egress-research.md`.

---

## Rewrite vs. fix — the explicit call

**Fix, don't rewrite.** Rationale:
- The architecture is already what a "performant rewrite" would produce. Nothing here is a structural dead-end.
- Every issue is local and high-leverage: one edit-page change, one image-loader change, one index migration, one AI-provider swap.
- Staying on the fork keeps you able to `git pull` upstream improvements (sambecker is actively maintained).
- A rewrite is months of risk for zero architectural gain over these targeted fixes.

---

## Suggested execution order (each shippable independently)
1. **DB indexes migration** (1 file, instant build + query speedup, zero behavior change).
2. **Edit-page fix** — stored blur + lazy AI thumbnail + split PhotoForm (your #1 pain).
3. **Image loader → R2/Cloudflare direct + `sizes`** (perf #2/#3 + egress, ~2 files).
4. **Enable link prefetch for in-viewport cards** (homepage open-photo speed; pairs with detail ISR in #7). De-client/framer-motion is optional polish — bundle is already acceptable (~65–80 KB).
5. **AI stack → Gateway + gemini-3.1-flash-lite + typed schema + prompts** (~3 files + migration).
6. **Batch backfill script** to re-tag the existing library on the new stack.
7. **Polish:** defer OpenLayers, scope revalidation, drop Vercel Blob token.

## Open items to confirm (cheap, calibrate the plan)
- Vercel project **function region** set to `hnd1` (Tokyo) to match the new `ap-northeast-1` DB? (default `iad1` = trans-Pacific)
- Supabase **tier** — non-pausing? (a paused free project would itself explain cold slowness)
- **Library size** (# photos) — >1000 means detail pages fall to dynamic SSR (raises the index/region priority); DB was unreachable from this sandbox to count.
