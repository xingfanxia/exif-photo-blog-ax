# Overhaul — Direct Codebase Evidence

> Gathered 2026-06-19 by reading the repo at HEAD (== `sambecker/main`, 0/0 with upstream).
> This file = ground truth from the code + the live `.env.local`. External research lives in `02-*`, `03-*`. Synthesis in `00-RECOMMENDATION.md`.

## Stack baseline (package.json)

- **Next.js 16.2.6 / React 19.2.6** — already on the latest major. Turbopack configured.
- **AI: Vercel AI SDK v6** (`ai@^6`, `@ai-sdk/openai@^3`, `@ai-sdk/rsc`). Already modern.
- **Storage adapters: ALL FOUR already implemented** — `vercel-blob`, `aws-s3`, `cloudflare-r2`, `minio` (`src/platforms/storage/*`). R2 uses the S3 SDK (`@aws-sdk/client-s3`).
- **DB: raw `pg` Pool** (`src/platforms/postgres.ts`) — no ORM, hand-built SQL.
- **Cache/limit: Upstash Redis** (`@upstash/redis`, `@upstash/ratelimit`).
- Heavy client libs present: `ol`+`react-openlayers` (maps), `framer-motion`, `viewerjs`, `extract-colors`/`fast-average-color`/`culori` (color), `cmdk`, `sharp` (server).

## What the user's `.env.local` actually shows (decisive)

| Setting | Value | Implication |
|---|---|---|
| `NEXT_PUBLIC_STATICALLY_OPTIMIZE_PHOTOS` | `1` | **Static optimization is ON.** Public browsing pages are pre-rendered. Jank is NOT dynamic-SSR-per-request on public pages. |
| `NEXT_PUBLIC_STATICALLY_OPTIMIZE_PHOTO_CATEGORIES` | `1` | Category pages pre-rendered too. |
| `POSTGRES_URL` | `...pooler.supabase.com:6543...` | **Supabase Postgres, us-east-1, transaction pooler (Supavisor :6543).** Pooled string already in use. |
| `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN` | `photos.xiax.xyz` | **R2 already live**, served via Cloudflare custom domain → origin egress already free. |
| `BLOB_READ_WRITE_TOKEN` | set | Vercel Blob token still present → dual config / mid-migration. |
| (no `vercel.json`/`vercel.ts`) | — | **Function region = Vercel default `iad1` (us-east-1)** = co-located with the DB → DB↔fn latency minimal. |

### Consequence for the user's three asks
- **"Postgres feels slow"** — it is NOT cross-region (co-located iad1↔us-east-1) and NOT SSR-on-every-public-page (static is on). Real Postgres cost is concentrated in: (a) **build time** — `generateStaticParams` fans out a query per photo/category for the whole library; (b) **dynamic/admin/search paths** (ILIKE search, admin dashboards); (c) **Supabase compute tier** (free/small tier pauses + limited CPU). See `02-db-egress-research.md`.
- **"Site is laggy (卡)"** — with static pages, prime suspects shift to **client JS weight** (openlayers/framer-motion/viewerjs/color libs), **image payload/optimization latency**, **view-transition/animation jank**, and **build/revalidation lag** after edits. Awaiting `PerfAudit` agent quantification.
- **Egress** — already mostly mitigated at the R2 origin. The remaining Vercel egress is the **Image Optimization layer**: `next.config.ts remotePatterns` includes the R2 host, so `<Image>` routes R2 images through Vercel `/_next/image` (Vercel bandwidth + transform cost). See `02-*`.

## AI stack (`src/photo/ai/*`, `src/platforms/openai.ts`)

- Entry: `generateAiImageQueries` → `generateOpenAiImageObjectQuery(imageBase64, query, zodSchema, isBatch)`.
- Uses AI SDK v6 `generateText({ model, output: Output.object({schema}) })` — structured output with a Zod schema built dynamically from the requested fields (`title`/`caption`/`tags`/`semantic`).
- **Model default `gpt-5.2`** (`src/platforms/openai.ts:14`), `gpt-4o` as "compatible" fallback.
- **Already supports `OPENAI_BASE_URL` + `OPENAI_MODEL`** (`config.ts:272-274`) → any OpenAI-compatible endpoint reachable today (Gateway/OpenRouter/local). True multi-provider (Claude/Gemini native) is the rewrite target.
- Prompts (`src/photo/ai/index.ts:62-76`) are weak one-liners. `cleanUpAiTextResponse` strips quotes/newlines — minimal post-processing; no hard-invariant enforcement (tag count, punctuation) by code.
- `semantic` field feeds full-text ILIKE search (`db/query.ts:107-110`).
- Rate-limited via Upstash (`checkRateLimitAndThrow`), batch mode tightens limits.

## DB layer (`src/platforms/postgres.ts`, `src/db/*`, `src/photo/query.ts`)

- `new Pool({ connectionString })` over node-pg/TCP. `query()` does `pool.connect()` per call then `client.release()`.
- `safelyQuery` wraps queries with **JIT migration** (catches up to 3 missing-migration errors and runs them inline) + table auto-create. Clever but adds try/catch overhead and surprise writes on cold paths.
- **`photos` table has ONLY `id` PRIMARY KEY — zero secondary indexes** (`src/photo/query.ts:43-80`). No index on `taken_at`, `created_at`, `hidden`, `make/model`, and no **GIN index on `tags VARCHAR(255)[]`** despite `$N = ANY(tags)` queries (`db/query.ts:151`). Fine at hundreds of rows (seq scan cheap); a real latent cost as the library grows and at build-time fan-out.
- Query builder is **Postgres-dialect-specific**: `REGEXP_REPLACE`, `ANY(array)`, `ILIKE`, `EXTRACT(YEAR FROM ...)`, `INTERVAL`, array columns, JSONB. → Any move off Postgres (Turso/SQLite) requires rewriting this layer.

## Storage layer (`src/platforms/storage/*`)

- Clean adapter pattern: `putFile`/`copyFile`/`deleteFile`/`getSignedUrlForKey` switch on `CURRENT_STORAGE`.
- R2: client uploads go via **presigned URL** (`uploadFromClientViaPresignedUrl`), public reads via `CLOUDFLARE_R2_BASE_URL_PUBLIC` (the custom domain).
- `CURRENT_STORAGE` auto-selected from configured creds (`config.ts:228`).

## Bottom line from direct evidence
The fork is **already modern and already does most of the "hard" infra moves** (R2 live, static optimization on, AI SDK v6, pooled Supabase). The overhaul is therefore **less "rewrite from scratch" and more "finish + sharpen"**: provider-agnostic AI, kill the Vercel image-optimization egress, add DB indexes + right-size Supabase, trim client JS. A full greenfield rewrite is likely NOT justified — to be confirmed against the perf-audit + research agents.
