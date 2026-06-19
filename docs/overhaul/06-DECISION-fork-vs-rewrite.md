# Decision: Fork-Refactor vs Rewrite vs Hybrid-Strangler

> Output of a 9-agent adversarial decision workflow (2026-06-19): ideal-architecture yardstick → 3 steelmanned paths → per-subsystem gap analysis → adversarial cross-examination of each → scored matrix. Verdict survives the adversarial round.

## Verdict: **Disciplined fork-refactor (strangler sequence) toward the FULL ideal** (not a rewrite)

Keep the fork; harden the 7 ideal subsystems **seam-by-seam** (independent shippable PRs, each with its own machine oracle), retire old code module-by-module, with AI as the one scoped module rewrite.

### ⚙️ Owner input (2026-06-19): "upstream seems quiet" → refinement
Confirmed by the data (trailing-90d upstream = mostly dep-bumps; heic/raw/orient = 0 commits/365d). This **weakens the case for merge-fencing, NOT the case against rewriting**:
- **Rewrite still loses with upstream removed entirely** — re-scored without the upstreamLeverage column: rewrite ~4.8 vs fork ~7.8 vs hybrid ~8.2. Its killers (riskControl 2, timeToValue 2, effort 2, and the no-clean-shell/core-seam import-coupling fact) are upstream-independent. **Don't rewrite.**
- **Quiet upstream makes STEP 7 (config→Zod, barrel splits, migrations-as-truth) cheap → promote it from "opt-in/defer" to INCLUDE.** You reach the full clean architecture without a real merge tax.
- **Relax the "new-files-over-edits" constraint** — edit hot files directly where it's cleaner; optimize for the artifact, not a low-value merge link.
- **Keep cheap insurance only:** an `UPSTREAM.md` + no *gratuitous* divergence, so a future upstream fix can still be cherry-picked. Quiet ≠ dead.

So the operative plan = the STEP 0–7 strangler sequence below **with STEP 7 included and fencing relaxed**.

### Scored matrix (0–10, weightedTotal)
| Path | AgentMaint | Perf | RiskControl | TimeToValue | UpstreamLeverage | Effort(inv) | **Total** |
|---|---|---|---|---|---|---|---|
| clean-rewrite | 9 | 9 | 2 | 2 | **0** | 2 | **3.5** |
| fork-refactor | 8 | 9 | 7 | 8 | 8 | 7 | **7.7** |
| **hybrid-strangler** | 9 | 9 | 9 | 8 | 9 | 6 | **8.4** |

Reachable % of ideal: hybrid **97%** · fork-refactor 90% · rewrite **75%**.

## Why rewrite is refuted (not just "not preferred")
1. **The "verbatim lift" thesis is false at the import boundary.** The supposedly-portable hard core imports the very modules a rewrite replaces: the `@/photo` barrel is imported by ~100 files, `@/app/config` by ~77, `@/app/path` by ~103. There is **no clean shell/core seam** — rebuilding the shell forces touching nearly every "portable" module.
2. **Zero divergence today = a rewrite forfeits a free asset for nothing.** `git rev-list --count sambecker/main...HEAD` = **0/0**. The fork is byte-identical to a live upstream (only an uncommitted `.env.local` differs). A rewrite trades that away and re-litigates every solved EXIF/RAW/HEIC/orientation/color/recipe/OG/feed/i18n/taxonomy edge case.
3. **~80% of rewrite effort re-derives existing, upstream-maintained value;** only ~20% buys the architecture delta — and that 20% is *also* required on the fork path, where it's cheaper (rides existing seams additively).

## Honest corrections the adversarial round forced (so we don't over-sell the fork either)
- **Upstream value is real but OVERSTATED.** Trailing 90d = 17 commits, 7 of them "Bump deps"; the expensive long-tail is **dormant** (heic=0, raw=0, orient=0 commits/365d; exif=5, color=9). So upstream = "keep inheriting *already-solved* edge cases + dep/security maintenance," **not** an active firehose of new correctness fixes. → pay merge-discipline tax only where it's cheap.
- **The perf edits land on the HOTTEST upstream files** (ImageWithFallback, PhotoForm, config.ts, layout.tsx, PhotoGrid — and upstream just shipped #390 masonry reworking PhotoGrid +118 lines). "Additive/fenced, zero merge risk" is true only for genuinely NEW files. → route wins through NEW/cold files where possible; log every hot-file in-place edit in `UPSTREAM.md` from PR #1.
- **The 0/0 mergeability score decays as you execute** — the strangler's discipline (additive-over-edit + per-seam oracle) is what keeps the erosion minimal; a sloppy in-place refactor silently kills the upstream asset.

## Keep-as-is assets (all reviewers agree)
- **Four-backend storage adapter** (`src/platforms/storage/*`) — best-factored module; the image loader slots *in front*, never touches it.
- **Per-domain sibling taxonomy layout** (`photo/tag/album/film/camera/lens/recipe/focal/year`) — the most agent-legible convention; "new taxonomy = new sibling dir."
- **Raw `pg` PG-dialect SQL** — an asset (no ORM); only *add* Zod row-parsing at the DB→domain boundary.

## The ONE true module rewrite: AI (quality 3/10)
`src/platforms/openai.ts` → provider-agnostic `src/platforms/ai.ts` is a scoped **~2-file fenced rewrite, NOT app-level**. (Hardcoded `gpt-5.2` ~10–15× overspend, non-injectable client → no offline tests, `tags` as a CSV `z.string()`, zero code-enforced invariants.)

## Per-subsystem gap (current quality vs ideal → verdict)
| Subsystem | Quality | Verdict | Fork effort | Rewrite effort |
|---|---|---|---|---|
| Data layer (schema-truth split + JIT-DDL-from-reads + no indexes) | 4 | refactor-in-place | M | XL |
| Rendering / RSC islands (123 `use client`, admin trees ungated, per-tile motion) | 5 | refactor-in-place | L | XL |
| Module boundaries + config (607-line config, fat barrels) | 5 | refactor-in-place | M | L |
| Storage + image delivery (Vercel `/_next/image` hop, no `sizes`, edit-page double-fetch) | 6 | refactor-in-place | M | XL |
| **AI subsystem** | **3** | **rewrite-this-module** | M | M |
| Type-safety + tests (double-cast `parsePhotoFromDb`, no CI at all) | 3 | refactor-in-place (additive) | L | L |
| Repo conventions + upstream sync (no ARCHITECTURE.md/UPSTREAM.md) | 4 | refactor-in-place | S | S |

## When a DIFFERENT path wins (the genuinely owner-only call)
- **Clean-rewrite wins ONLY IF** you make an explicit, irreversible decision to **abandon upstream** — i.e. firm, heavy, upstream-incompatible product direction that will diverge past the conflict-free threshold anyway. (Timing kernel: a future rewrite gets strictly more expensive as AX code accretes — but that only fires once divergence is a *committed plan*.) OR if your real frustration is *"I want a codebase that's mine,"* a **values** question, not an engineering one.
- **Minimal slice wins IF** you want pain relief now and are indifferent to the legibility ceiling: ~2 weeks = edit-page fix + Cloudflare image loader + 3 indexes + AI swap; defer all structure-only seams.
- **DB-engine swap (Redis/Turso) is rejected under ALL paths** (Redis can't serve the relational queries; Turso = full SQL-builder rewrite for latency a co-located app doesn't need).

## Strangler sequence (each step = independent PR(s), main stays green + pull-able, ships its own oracle)
- **STEP 0 — Conventions + upstream contract** (S, pure-new files): `docs/ARCHITECTURE.md` (load-bearing invariants) + `docs/UPSTREAM.md` (divergent-file registry) + headless `test`/`typecheck` scripts + **a CI workflow (none exists today)**. Oracle: CI green on a no-op PR.
- **STEP 1 — Data layer** (M): forward-only `db/migrations/` as schema truth; replace JIT-DDL-from-reads with idempotent migrate-on-boot (test on a CLEAN Supabase project); add 3 indexes `(hidden,taken_at DESC)`, `GIN(tags)`, `pg_trgm` search; make `parsePhotoFromDb` a total Zod parse. Oracle: forward-only migrate on clean DB + `\d photos` shows indexes + row-shape regression test. (DB-reviewer pass before apply.)
- **STEP 2 — Image delivery** (M): custom `next.config` Cloudflare loader (bytes bypass `/_next/image`) + `sizes` props + `imageSizes:[200,300]` + serve `-md`/`-lg` variants. Rebase onto post-#390 masonry first. Oracle: network trace shows bytes from `photos.xiax.xyz`, zero `/_next/image`.
- **STEP 3 — Edit-page fix** (M): read stored `blur_data`, defer AI thumbnail to on-click route; split the 732-line PhotoForm into server-shell + islands. Oracle: edit-open trace shows zero full-image fetch + device sweep clean.
- **STEP 4 — AI module rewrite** (M): `ai.ts` via AI Gateway (`google/gemini-3.1-flash-lite` default, cross-lab fallback), typed array schema, `normalizeAiResult` code-enforced invariants, injectable client. Oracle: `MockLanguageModelV2` offline test + ~10–15× cost drop.
- **STEP 5 — Rendering discipline** (L): auth-gate the admin subtree out of the anonymous bundle; per-tile motion → first-load-only via the props that already exist. Oracle: anonymous bundle has no admin JS + device sweep.
- **STEP 6 — Batch backfill worker** (S, standalone script): re-tag library via 50%-off Batch APIs, `sha256` idempotency + `metadata_status`. Oracle: idempotent re-run is a no-op; sub-dollar.
- **STEP 7 — Config + barrels** (M, **OPT-IN, highest merge cost**): one Zod env schema (fail-loud at boot) + barrel splits. **Defer/skip if upstream pulls are frequent** — pure legibility, no user value, biggest mergeability eroder. Oracle: bad env fails loud at boot.

Steps 1–6 = high-confidence core (~5–7 wks); first user-visible win lands in STEP 2–3 (week 1–2). STEP 7 is the explicit values gate.
