# Performance Overhaul — Fix Design

> The *fix* plan, grounded in directly-verified code/config. Quantified bottleneck ranking + any new findings come from the `PerfAudit` agent and merge into §0.

## §0 Reframing the problem (from direct evidence)
The user's mental model ("Postgres slow → maybe rewrite in a more performant architecture") is **partly mis-targeted**, and the evidence changes the plan:
- **Static optimization is ON** → public pages are pre-rendered; visitors don't hit Postgres per request. So a from-scratch rewrite for "fast pages" buys little — the pages are already static.
- **DB and functions are co-located** (Supabase us-east-1 ↔ Vercel iad1) → "Postgres slow" is **not** latency/region. It's **build-time fan-out**, **dynamic/admin/search paths**, and **Supabase tier compute**.
- Therefore the "卡" (jank) is almost certainly **client-side + image delivery**, not server rendering.

→ **A greenfield rewrite is not justified.** The performant architecture the user wants is mostly reachable by *tuning the existing one*. (Final call in `00-RECOMMENDATION.md`.)

### 🔴 SMOKING GUN — owner's #1 complaint "编辑图片信息巨慢" (edit photo info is super slow)
`app/admin/photos/[photoId]/edit/page.tsx:55-65` — **before the edit page can render**, the server:
1. (L32-46) runs 6 parallel cached DB queries (OK).
2. (L55-59) `resizeImageFromUrl(getOptimizedPhotoUrlForManipulation(photo.url))` — **downloads the FULL-RES image and sharp-resizes it to a base64 thumbnail** (only because AI generation is enabled), every load.
3. (L61-65) `blurImageFromUrl(...)` — **downloads the FULL-RES image AGAIN and regenerates blur data**, every load — *even though `photos.blur_data` is already stored in the DB.*
→ **Two blocking full-image fetch + sharp passes per edit-page open** (multi-MB image, possibly via another Vercel-optimization hop). This is seconds of latency. **FIX (high impact, low risk):** (a) reuse stored `photo.blur_data` instead of `blurImageFromUrl`; (b) generate the AI thumbnail **lazily** (on "AI generate" click via a route handler), not on page load. Likely the single biggest UX win.

### Owner's #2/#3 complaints map to image delivery
- "load image card 巨慢" / "图片详情最慢" → grid/detail images go through Vercel `/_next/image` (cache-miss transforms + extra R2→Vercel→browser hop + no `sizes` + `imageSizes:[200]`). Detail = largest image = slowest. **Same fix as egress (§1): serve from R2 via Cloudflare, bypass Vercel optimizer.** The egress fix IS the perf fix here.
- Detail pages are statically generated only up to `GENERATE_STATIC_PARAMS_LIMIT = 1000` photos; beyond that → dynamic SSR (DB cold start). Confirm library size.

PENDING `PerfAudit`: client-bundle quantification (which heavy libs load on grid/detail) + final ranked list. Working order:
1. **Edit-page double full-image processing** (smoking gun above) — HIGH, owner's #1 pain.
2. **Image delivery via Vercel `/_next/image`** (cards + detail) — HIGH, owner's #2/#3 pain + the egress bill.
3. Client JS weight (openlayers map, framer-motion, viewerjs, cmdk, color — always mounted via root layout) — MED.
4. Supabase cold start / possible auto-pause on dynamic+admin paths — MED (see `02` §A).
5. No DB secondary indexes + coarse revalidation — LOW now, grows with library.

## §1 Image delivery — the biggest combined perf+egress win
Directly verified: no custom image `loader`; `remotePatterns` includes the R2 host; `imageSizes:[200]`; **no `sizes=` prop anywhere**; `minimumCacheTTL: 1yr`.
- **Problem:** every display image is fetched by Vercel from R2 (free) then **re-optimized + re-served through Vercel** → Vercel image-transform units + Vercel egress, and an extra hop of latency.
- **Fix (the lever the user is asking for):** serve optimized images **directly from Cloudflare**, bypassing `/_next/image`:
  - Option A (recommended pending §02 research): custom Next `images.loader` → Cloudflare Image Resizing/Transformations on `photos.xiax.xyz` (`/cdn-cgi/image/...`). Images never touch Vercel; egress + transform = Cloudflare (free egress, cheap transforms).
  - Option B: `unoptimized` + pre-generate a small set of widths at upload (sharp already in deps; `resizeImageToBytes` already exists) and store them in R2; serve via `srcset`.
- Add proper `sizes=` on grid/feed images so the browser requests right-sized variants.
- Quantified $ comparison (Vercel Blob+Optimization vs R2+Cloudflare for ~100GB/mo) → from `02-db-egress-research.md`.

## §2 Client JS weight
Directly verified: root `app/layout.tsx` always mounts `AppStateProvider`, `AppTextProvider`, `SelectPhotosProvider`, `ThemeProvider`, `SwrConfigClient`, `SharedHoverProvider`, plus `CommandK` (cmdk), `ShareModals`, `RecipeModal`, `AdminUploadPanel`, `AdminBatchEditPanel` — on every page, for every visitor (incl. logged-out).
- **Fix:** gate admin-only client trees (`AdminUploadPanel`, `AdminBatchEditPanel`, batch/select providers) behind an auth check so they don't ship to anonymous visitors; lazy-load (`next/dynamic`) the heavy, interaction-triggered pieces: **openlayers map** (only on photo-detail with location), **viewerjs** (only on zoom), **cmdk** (load on first keypress). PENDING `PerfAudit` for exact eager-load offenders + bundle sizes.

## §3 Revalidation strategy
Directly verified: `revalidateAllKeysAndPaths()` revalidates all tags + all `PATHS_TO_CACHE` on edits.
- **Fix:** scope invalidation to the affected entity (revalidate the changed photo's tag/category keys, not the whole site). Lower-priority (affects edit lag, not visitor jank).

## §4 Database
Directly verified: `photos` has PK only; queries use `ANY(tags)`, ILIKE, date extracts.
- **Fix (keep Postgres — see `02`):** add indexes — GIN on `tags`, btree on `taken_at`, `created_at`, `hidden`, `(make,model)`; consider `pg_trgm` GIN for the ILIKE search, or move search to a `tsvector` column. Add to `createPhotosTable` + a migration.
- Right-size Supabase compute / confirm it isn't auto-pausing. Provider verdict (stay Supabase vs Neon) → `02`.

## §4.5 PerfAudit cross-validation — precise low-effort fixes (added 2026-06-19)
Independent deep audit confirmed the edit-page smoking gun and image-delivery diagnosis, and pinned exact fixes:
- **Edit page:** the two image ops both fetch the **640px md image** via `getOptimizedPhotoUrlForManipulation` (not necessarily the raw original) — still 2 separate CDN fetches + 2 sharp passes, blocking. Fix: reuse `photo.blur_data`; defer the AI thumbnail to a route handler on button click; if both are ever needed, fetch once and split.
- **Grid cards — three concrete misconfigs:**
  1. `ImageWithFallback` (`src/components/image/ImageWithFallback.tsx:62`) has **no `sizes` prop** → `next/image` falls back to device sizes `[640…]` and requests 640px where ~300px suffices (2–3× oversized). Add e.g. `sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"`.
  2. `next.config.ts` `imageSizes:[200]` but card width is `IMAGE_WIDTH_MEDIUM=300` → Next has no 300px size, upscales to the 640px device size = a real-time transform instead of a cached variant. Add `300`: `imageSizes:[200,300]`.
  3. **Pre-optimized `-md`(640)/`-lg`(1080) variants already exist in storage but cards pass the raw `photo.url`** → forces on-the-fly Vercel transforms. Serve the `-md` variant directly (dovetails with the R2/Cloudflare custom-loader in §1 → skip the Vercel optimizer entirely).
- **Detail page:** add **`export const revalidate = 3600`** (no ISR today → photos beyond `GENERATE_STATIC_PARAMS_LIMIT=1000` are SSR on every request); **parallelize** the photo→nearby data waterfall in `app/p/[photoId]/page.tsx` (and filter `excludeFromFeeds` in the WHERE clause, not after fetch); consider raising the static limit toward the real library size.

PerfAudit estimate: ~40–60% faster perceived performance across the three paths after these + §1–§4.

## §5 What NOT to do
- Don't move the relational layer to Redis (KV can't serve these queries) or Turso (would force rewriting the entire PG-dialect SQL builder for marginal gain on a co-located, mostly-static app). Evidence in `02`.
- Don't greenfield-rewrite the app — the architecture is already modern (Next 16, RSC, static opt, AI SDK v6, abstracted storage).
