# Code/Architecture/Package-Level Slowdown Deep-Dive

> Firsthand code reads (2026-06-19), answering the owner's directive: "find architecture/package/lib-level slowdown causes; it feels like a code problem." Confirms it largely IS a code problem. Pairs with PerfAudit's deep pass.

## A. Edit photo-info page — the worst path (CODE, not infra)

`app/admin/photos/[photoId]/edit/page.tsx` + `src/photo/PhotoEditPageClient.tsx` + `src/photo/form/`:

1. **Two blocking full-image downloads + sharp passes, server-side, on EVERY edit-page open** (`edit/page.tsx:55-65`):
   - `resizeImageFromUrl(...)` → AI thumbnail base64 — computed even though AI only runs on button click (`useAiImageQueries` is called with default `textFieldsToAutoGenerate=[]`, so the auto-run `useEffect` is a no-op — `useAiImageQueries.ts:101-107`). **Pure waste until you click AI.**
   - `blurImageFromUrl(...)` → regenerates blur — **even though `photos.blur_data` is already stored** and there's an on-demand `UpdateBlurDataButton`. **Pure waste.**
   - Net: a multi-MB original fetched twice + sharp-processed before the page can render.
2. **`imageThumbnailBase64` + `blurData` shipped as base64 props** through the RSC payload (`PhotoEditPageClient.tsx:30-31, 90`) → bloats the payload the browser must download/parse.
3. **732-line monolithic client form** (`src/photo/form/PhotoForm.tsx`) — one giant `'use client'` component importing color generation (`generateColorDataFromString`), image, recipes/films/albums/tags converters, fujifilm platform, icons, etc. Heavy hydration + parse on open.

**Fix (all code, low risk):** read `photo.blur_data` instead of `blurImageFromUrl`; generate the AI thumbnail lazily in a route handler on AiButton click (not on page load); split PhotoForm into server shell + client islands.

## B. Homepage → click photo → open (CODE/architecture)

`src/photo/PhotoGrid.tsx` → `PhotoMedium.tsx` → `LinkWithStatus` → navigates to `/p/[photoId]`:
- **Prefetch is config-gated** `prefetch = SHOULD_PREFETCH_ALL_LINKS` (`PhotoMedium.tsx:23`). If off (default), clicking does a **cold navigation** → fetch the detail route + render → the `LinkWithStatus` spinner you see. If the photo is beyond `GENERATE_STATIC_PARAMS_LIMIT=1000`, the detail is dynamic SSR (DB + heavy render).
- **The destination is heavy:** large image via Vercel `/_next/image` (cache-miss transform), related-photos grid, plus a framer-motion `nextPhotoAnimation` set on click (`PhotoLink.tsx:43-47`).
- **Fix:** enable link prefetch for in-viewport cards; make the detail image serve direct from R2/Cloudflare (Workstream C); ensure detail pages are statically generated or fast-dynamic.

## C. Architecture/package-level drag (the "lib" question)

1. **The photo grid is entirely client-side + framer-motion per tile.** `PhotoGrid`, `PhotoMedium`, `PhotoLink`, `ImageWithFallback` are all `'use client'`; `AnimateItems.tsx:119-136` wraps **every** grid item in a `motion.div` with staggered entrance. A 60-image grid = 60+ motion nodes mounting/animating + full hydration. **⚠️ Moderation (PerfAudit bundle quantification):** the resulting JS bundle is only **~65–80 KB (framer-motion 40–50 KB + cmdk 25–30 KB), rated acceptable.** So this is a *runtime/animation* nicety, **not a bundle weight problem and NOT the main cause of slow photo-open.** The dominant open-photo levers are **link prefetch (off today) + detail-page ISR + image delivery**, not de-clienting. **Optional fix:** replace the per-tile framer-motion entrance with CSS (or first-load-only via `animateOnFirstLoadOnly`); full server-rendering of the grid is low ROI given the acceptable bundle.
2. **`LinkWithStatus` on every card** subscribes each link to navigation status (`useLinkStatus`) — extra per-card client hooks ×60.
3. **Root layout always mounts the full provider stack + `CommandK` + modals + admin panels** for every visitor (`app/layout.tsx:108-159`), and `CommandK` is a **server component awaited in the layout** running 8 category aggregations (`src/cmdk/CommandK.tsx:7-16`) — at build time for static pages, but on cold cache / dynamic pages it gates render, amplified by the missing DB indexes.
4. **Package weight:** `ol`+`react-openlayers` (~230–300 KB) eager on `/about` (defer with `dynamic()`); `framer-motion` used broadly (grid + transitions); `viewerjs` already lazy. Redis (`@upstash/redis`) is dormant beyond rate-limit/health.

### Top architecture/package changes by interaction-latency payoff
1. **De-client the grid + drop per-tile framer-motion** → faster homepage interactivity + fewer JS nodes.
2. **Bypass Vercel image optimization (serve R2/Cloudflare direct) + enable prefetch** → faster card load + faster photo-open.
3. **Lazy thumbnail/blur on the edit page + split PhotoForm** → fixes the #1 pain.
4. (supporting) DB indexes + defer OpenLayers.

## D. PerfAudit deep-dive — additional confirmed findings (2026-06-19)
New code-level items beyond A–C, all low-risk code fixes:
- **Admin trees mount for ALL visitors (incl. logged-out) with no auth gate** (`app/layout.tsx:110-142`): `SelectPhotosProvider`, `AdminUploadPanel`, `AdminBatchEditPanel`. **`AdminBatchEditPanel` fetches albums + unique tags on every page render even for anonymous visitors** (`src/admin/select/AdminBatchEditPanel.tsx`). Fix: gate the whole admin subtree behind `isUserSignedIn`. (Wastes cache/DB for ~80% of traffic + ships admin JS to everyone.)
- **Photo-open path, precise fixes:** `SHOULD_PREFETCH_ALL_LINKS` is `undefined`/off (`config.ts`) → enable prefetch; **sequential data waterfall** `getPhotoCached` → `getPhotosNearIdCached` (`app/p/[photoId]/page.tsx:20-36`) → `Promise.all`; **entrance animation 600ms** (`AnimateItems.tsx:39` duration 0.6) → reduce to ~0.3; `LinkWithStatus` flicker threshold 400ms can feel "stuck."
- **Grid re-staggers on every navigation** (back-to-grid replays the staggered entrance, feels like still-loading) — pass `staggerOnFirstLoadOnly` / `animateOnFirstLoadOnly` on the grid usage.
- **`viewerjs` (60–80 KB) imported eagerly** in `useImageZoomControls.ts` (earlier thought lazy) → dynamic-import on first zoom. `ol`/OpenLayers (~250–300 KB) eager on `/about` → `dynamic({ssr:false})`.
- **SWR global config untuned** (`src/swr/SwrConfigClient.tsx`) — minor; consider `revalidateOnFocus` per-query.

PerfAudit reaffirms: all three slow paths are **code-level, not infra** — not Postgres, not bundle size, not architecture-class. Verdict echoed: fix in focused PRs, ~40–60% faster perceived performance.

## Verdict on "rewrite vs. modify the fork"
**Modify the fork. A rewrite is not warranted.** Every cause above is a *local code change* in a modern codebase (Next 16 RSC, AI SDK v6, abstracted storage). None is a structural dead-end. A rewrite would reproduce the same grid/form/image decisions and forfeit upstream maintenance. The fastest path to "not 卡" is 3–4 targeted PRs on this fork, not a new project.
