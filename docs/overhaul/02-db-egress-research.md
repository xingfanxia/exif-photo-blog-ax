# DB Selection + R2 Egress Minimization — Research (sourced)

> External research (DBEgressResearch agent, web-sourced, 2026-06-19). Cross-checked against direct code evidence in `01-codebase-evidence.md`. URLs inline.

## A. "Postgres feels slow on Vercel" — root cause + fix (NOT the engine)
Priority-ordered causes:
1. **Per-invocation connection setup (dominant).** Serverless = fresh TCP+TLS+auth handshake per cold invocation → +50–200 ms first request; without a pooler, bursts exhaust the ~100-conn limit. ([dev.to](https://dev.to/mahdi_benrhouma_fe1c6005/supabase-connection-pooling-with-pgbouncer-on-vercel-serverless-1o33))
2. **No pooler.** PgBouncer/managed pooler cut avg connection time ~50 ms → ~5 ms. Fix: **pooled string (Supabase :6543 / Neon pooled) for app queries; direct :5432 only for migrations; disable prepared statements in transaction-pooling mode.**
3. **DB region ≠ function region (silent killer).** This workload's JOINs/`ANY(tags)`/ILIKE/GROUP BY are multi-round-trip; each pays the fn↔DB distance. Vercel: co-locate function region with data source. ([Vercel region docs](https://vercel.com/docs/functions/configuring-functions/region))

**Neon HTTP driver** (`@neondatabase/serverless`) runs `pg` over HTTP/WebSockets w/ pipelining — lowest serverless handshake latency; prod test cold ~800 ms → warm ~80 ms. ([Neon benchmarking](https://neon.com/docs/guides/benchmarking-latency), [driver docs](https://neon.com/docs/serverless/serverless-driver))

**Fix order:** (1) co-locate fn region w/ DB region; (2) pooled string everywhere except migrations; (3) Fluid Compute ON (warm fns reuse connections); (4) optionally Neon HTTP driver. No SQL rewrite, no engine change.

### ⚠️ Cross-check vs THIS deployment (from `.env.local` + repo)
- DB = Supabase, **pooled string :6543 already in use** ✅ (cause #2 handled). ⚠️ **Region (2026-06-19): DB recreated in `ap-northeast-1` (Tokyo)** — was us-east-1.
- **No `vercel.json`/`vercel.ts` → function region = Vercel default `iad1` (US-East)** ⇒ now a **trans-Pacific mismatch** with the Tokyo DB (cause #3 is LIVE, not ruled out). **ACTION: set the Vercel function region to `hnd1` (Tokyo)** via `vercel.json`/`vercel.ts` `regions:['hnd1']` or the dashboard.
- **OPEN RISK — Supabase auto-pause:** free tier pauses after 7 days idle; first request after pause is very slow / errors. A direct connection attempt during this research returned `tenant/user … not found` (consistent with a paused/unreachable project OR sandbox network block). **If the blog is low-traffic on Supabase free tier, the 7-day pause + cold resume is a prime "卡" cause.** ACTION: confirm Supabase tier is non-pausing, or move to Neon (scale-to-zero but stays reachable, faster cold).
- App uses raw node-pg unnamed/parameterized queries → transaction-pooler prepared-statement caveat likely already satisfied.

## B. DB options for this read-heavy relational workload

| Option | Fit for the SQL | Latency | 2026 pricing | Free tier | Verdict |
|---|---|---|---|---|---|
| **Neon Postgres** (Vercel Mktpl) | Native PG — `ANY()`, ILIKE, EXTRACT, INTERVAL, GROUP BY, JOINs **verbatim** | HTTP driver = lowest handshake; scale-to-zero +300–800 ms cold (keep-warm configurable) | Launch ~$15–19/mo; storage **$0.35/GB-mo**; compute −15–25% | 100 CU-h/mo, 0.5 GB, scale-to-zero, **stays reachable** | **Best serverless-PG fit;** HTTP driver fixes A; Vercel-native ([vela.simplyblock](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026)) |
| **Supabase Postgres** *(current)* | Native PG — same zero-rewrite; bundles auth/storage/realtime; built-in PgBouncer | 16 AWS regions → co-locatable | Flat **$25/mo Pro** (8 GB DB, 250 GB egress); no scale-to-zero on paid | 500 MB, **pauses after 7 days idle** | **STRONG / already integrated.** Flat predictable billing; free-tier pause hostile to low-traffic blog ([getautonoma](https://getautonoma.com/blog/supabase-vs-neon)) |
| **Turso/libSQL** (SQLite) | **NOT PG** — `ANY()`, REGEXP_REPLACE, EXTRACT, INTERVAL, ILIKE, arrays, CONCAT-FTS **all need rewrite** | Edge replicas, sub-ms reads | $4.99 Dev / $29 Pro | 5–9 GB | **NO** — only if rewriting whole SQL layer for edge-read latency unneeded at this scale |
| **Upstash Redis** *(current cache)* | **KV — cannot run relational SQL at all** | sub-ms HTTP | per-request | generous | **CACHE ONLY** — keep for query-result cache + rate limit; not a DB |

**Verdict:** **Keep Postgres.** Redis stays cache-only (physically can't serve these queries). Turso rejected (full SQL rewrite, no payoff here). **Pragmatic: stay on Supabase + fix config/tier; Neon only if you want the HTTP-driver + scale-to-zero optimization or hit the Supabase pause problem.**

## C. R2 + egress minimization (#1 priority — CONFIRMED by direct code evidence)
**C1. R2 egress = $0** for all classes incl. public bucket + custom domain. Buried cost = **Class B reads $0.36/M (10M free)**; CDN caching absorbs most. ([R2 pricing](https://developers.cloudflare.com/r2/pricing))

**C2. THE TRAP (this repo is currently in it):** `next/image` pointed at R2 with Vercel optimization ON → on cache MISS, Vercel **fetches from R2, transforms on Vercel, serves every byte from Vercel** = **Fast Data Transfer $0.15/GB + transforms**, erasing R2's free egress. *Direct evidence:* `next.config.ts` adds the R2 host to `remotePatterns` and sets **no custom `loader`** → all display images go through `/_next/image`. ([Vercel image-opt docs](https://vercel.com/docs/image-optimization), [limits/pricing](https://vercel.com/docs/image-optimization/limits-and-pricing))

**C3. Recommended serving architecture (bytes never touch Vercel):**
1. R2 public bucket on Cloudflare **custom domain** (already: `photos.xiax.xyz`) — enables CDN caching (the `r2.dev` URL does not).
2. Optional **Cloudflare Image Resizing** `/cdn-cgi/image/...` — 5K transforms/mo free, then $0.50/1K.
3. **Custom Next.js `images.loader`** returning the **absolute** Cloudflare-domain URL (⚠️ gotcha: Cloudflare's sample loader returns a relative `/cdn-cgi/image/...` path that breaks on Vercel — must be absolute). `next/image` keeps lazy-load/srcset; Vercel never proxies bytes. ([zenn](https://zenn.dev/yama_1998/articles/cb25697511305f), [rampatra](https://blog.rampatra.com/three-ways-to-disable-image-optimization-in-vercel))
4. Or simplest: `images.unoptimized:true` + serve pre-sized originals from R2+CDN (sharp `resizeImageToBytes` already exists for pre-sizing).

**C4. $ at 100 GB/mo:**

| Path | Storage | Deliver 100 GB | Transforms/ops | ≈ /mo |
|---|---|---|---|---|
| Vercel Blob + Vercel Image Opt | ~$1.15 | $15 (FDT @$0.15) | + transforms + cache r/w + edge req | **~$16–55+, scales w/ traffic** |
| **R2 public + Cloudflare CDN/Images** | ~$0.75 | **$0** | inside 5K-free / $0.50/1K | **~$1–3, flat** |

**Net: ~$16–55/mo → ~$1–3/mo, and decoupled from traffic — ONLY if you bypass Vercel's optimizer (C2/C3).**

## 2026 pricing reference
- Vercel **Fast Data Transfer**: 100 GB free Hobby / 1 TB free Pro, then **$0.15/GB**. ([CDN pricing](https://vercel.com/docs/manage-cdn-usage))
- Vercel **Image Optimization**: transforms 5K free then $0.05–$0.0812/1K; cache reads 300K free; cache writes 100K free — billed every MISS/STALE; + FDT + Edge Requests on delivery. ([limits/pricing](https://vercel.com/docs/image-optimization/limits-and-pricing))
- **R2**: storage $0.015/GB-mo, Class A $4.50/M, Class B $0.36/M, **egress $0**; free 10 GB + 1M A + 10M B. ([R2 pricing](https://developers.cloudflare.com/r2/pricing))
- **Cloudflare Image Resizing**: 5K/mo free then $0.50/1K; delivery $1/100K.

## TL;DR
- **A:** Don't migrate off PG. **Set Vercel region to `hnd1` to co-locate with the new Tokyo `ap-northeast-1` DB** (was assumed co-located; now a real mismatch), keep pooled string, Fluid Compute on, fix Supabase pause/tier. Optionally Neon HTTP driver.
- **B:** Keep Postgres (stay Supabase or move to Neon). Redis = cache only. Turso = no.
- **C:** Serve images from R2 via Cloudflare with a **custom Next image loader (absolute URL)** or `unoptimized` — **turn OFF Vercel Image Optimization for R2 sources.** ~$16–55→~$1–3/mo at 100 GB. Files: `next.config.ts` + new `imageLoader.ts`.
