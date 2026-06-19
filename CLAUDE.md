# CLAUDE.md — fork contract & conventions

This repo is a **fork** of [`sambecker/exif-photo-blog`](https://github.com/sambecker/exif-photo-blog)
(Next.js 16 photo blog). Read this before any change.

## Verdict: fix the fork, don't rewrite

A 9-agent adversarial decision (`docs/overhaul/06-DECISION-fork-vs-rewrite.md`)
chose **disciplined fork-refactor (strangler)** over a rewrite. Rewrite loses
even with upstream removed (no clean shell/core seam: `@/photo` is imported by
~100 files, `@/app/config` by ~77, `@/app/path` by ~103). The one scoped module
rewrite is the AI subsystem (PLOG-9). The full overhaul plan is
`docs/overhaul/07-IMPLEMENTATION-PLAN.md` (PLOG-1..14).

## Fork discipline (non-negotiable)

- **`main` stays byte-identical to `sambecker/main`.** All AX work lands on
  `ax/*` branches. Verify: `git diff --stat sambecker/main...main` MUST be empty.
- **Additive over edits.** Prefer new files to editing upstream "hot" files.
  Every unavoidable hot-file edit is logged in **`UPSTREAM.md`** with a
  pull-reconcile note. Quiet upstream ≠ dead — keep pulls cherry-pickable.
- **Config:** `src/app/config.ts` MUST stay byte-identical to upstream. Fork-only
  config goes in `src/app/config-fork.ts` (re-exports all of config + adds AX
  vars). Switch a call site's import `@/app/config` → `@/app/config-fork`; never
  edit config.ts.

### Upstream sync procedure

```bash
git fetch sambecker
git log --oneline main..sambecker/main      # what's new upstream
git checkout main && git merge --ff-only sambecker/main   # main is a mirror
# Reconcile ax/* against new main; consult UPSTREAM.md for each hot-file entry.
git checkout ax/overhaul && git rebase main
```

### Expected hot-file divergences

- `next.config.ts` — currently **byte-identical**; PLOG-6 adds the custom
  Cloudflare image loader (`images.loader:'custom'` + `loaderFile`) and
  `imageSizes`. That is the one unavoidable next.config divergence; log it in
  `UPSTREAM.md` when it lands.
- `jest.config.ts`, `package.json`, `src/platforms/redis.ts` — diverged in
  PLOG-1 (honest test signal). See `UPSTREAM.md`.
- `vercel.json` — AX-only addition (region pin `hnd1`, Tokyo; co-located with
  the Supabase `ap-northeast-1` DB). Additive, no upstream equivalent.

## Module map — `src/platforms/`

Two distinct kinds of module live here; do not confuse them:

- **Infra clients** (swappable backends / external services): `postgres.ts`,
  `redis.ts`, `rate-limit.ts`, `storage/` (4-backend adapter), `vercel.ts`,
  `github.ts`, `openai.ts` (→ `ai.ts` in PLOG-9), `next-image.ts`,
  `google-places.ts`.
- **Camera/EXIF decoders** (per-vendor makernote parsing): `apple.ts`,
  `fujifilm/`, `nikon/`, `sony.ts`, `google-pixel.ts`. These are the dormant,
  hard-won upstream value (heic/raw/orientation) — never rewrite them.

## Keep-as-is assets (do not "improve")

- **Four-backend storage adapter** (`src/platforms/storage/*`) — best-factored
  module. The image loader slots *in front* of it (PLOG-6), never edits it.
- **Per-domain sibling taxonomy** (`photo/tag/album/film/camera/lens/recipe/
  focal/year`) — most agent-legible convention. New taxonomy = new sibling dir.
- **Raw `pg` PG-dialect SQL** — an asset (no ORM). Only *add* Zod row-parsing at
  the DB→domain boundary (PLOG-11), never swap the engine. The relational
  queries (`ANY(tags)`, ILIKE, `EXTRACT`, `INTERVAL`, JOINs, GROUP BY) rule out
  Redis/Turso as the primary store; Redis is cache/rate-limit only.
- **The photo grid is deliberately NOT de-cliented.** Its client-component
  bundle is accepted; the win is gating the *admin* subtree (PLOG-14), not the
  grid.

## DB migration mechanism (caveat)

- `MIGRATIONS[]` in `src/db/migration.ts` is the ordered source of truth (labels
  are **dynamic** — never hardcode a label number).
- `createPhotosTable` is one `sql` tagged-template — it can't hold
  `CREATE TABLE + N CREATE INDEX`. Indexes/columns are applied by the explicit
  ordered runner (PLOG-3), each as its own statement. JIT-DDL-from-read-errors
  is removed (PLOG-3) — migrations run via the runner, not a query catch.

## Conventions

- ESLint: `max-len` 80, single quotes, semicolons (`eslint.config.mjs`).
- Tests live in `__tests__/` (jest + jsdom). Gate = `npm run test:ci`
  (`jest --ci`); it must report **0 failed suites**. Live-network suites
  (`github.test.ts`) are excluded from the gate. ESM-only deps need allow-listing
  in `jest.config.ts`'s `transformIgnorePatterns` (see `imports-smoke.test.ts`).
- All user-facing strings go through the existing i18n system.
- Work-tracking names: `PLOG-<N>` (see the plan); never stack two letter axes.
</content>
