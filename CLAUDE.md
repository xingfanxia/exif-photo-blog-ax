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

## Fork model — `main` IS the product (changed 2026-06-20)

`ax/overhaul` was **merged into `main`** (PR #17): `main` now carries the full
overhaul + bilingual work and **intentionally diverges** from `sambecker/main`.

- ⚠️ The old "**main byte-identical to upstream**" invariant is **RETIRED**. Do
  **NOT** reset / `--ff-only` / hard-reset `main` to `sambecker/main` — it would
  wipe the product. `git diff sambecker/main...main` is now EXPECTED to be large.
- **Discipline that still holds** (keeps upstream pulls manageable):
  - **Additive over edits** — prefer new files to editing upstream "hot" files;
    log every unavoidable hot-file edit in **`UPSTREAM.md`** with a reconcile note.
  - **Config** — keep `src/app/config.ts` close to upstream; fork-only config
    goes in `src/app/config-fork.ts` (re-exports config + adds AX vars); switch a
    call site's import `@/app/config` → `@/app/config-fork`.
  - New feature work lands on `ax/*` branches → PR → merge to `main`.

### Upstream sync procedure (post-divergence — `main` is no longer a mirror)

```bash
git fetch sambecker
git log --oneline main..sambecker/main      # what's new upstream
# MERGE upstream in and resolve conflicts (consult UPSTREAM.md for hot files).
# Do NOT ff-only / reset — main carries product commits upstream doesn't have.
git checkout -b sync/upstream-YYYYMMDD main
git merge sambecker/main
# resolve conflicts, test (npm run test:ci + npm run build), then PR sync/* → main
```

### Expected hot-file divergences

- `next.config.ts` — **diverged in PLOG-6**: custom Cloudflare image loader
  (`images.loader:'custom'` + `loaderFile` + `imageSizes` from the shared
  module). The one unavoidable next.config divergence; logged in `UPSTREAM.md`.
- `jest.config.ts`, `package.json`, `src/platforms/redis.ts` — diverged in
  PLOG-1 (honest test signal). See `UPSTREAM.md`.
- `vercel.json` — AX-only addition (region pin `hnd1`, Tokyo; co-located with
  the Turso `aws-ap-northeast-1` DB). Additive, no upstream equivalent.
- **The entire DB layer** — diverged in TURSO-1 (2026-07-11): the engine is
  **Turso libSQL (SQLite)**, upstream is Postgres. `src/platforms/db.ts`
  replaces `postgres.ts`; every query file is SQLite-dialect. Upstream changes
  to `src/photo/query.ts`, `src/db/*`, `src/album/query.ts`,
  `src/about/query.ts` must be **re-dialected** on merge — full conversion
  table in `UPSTREAM.md` → TURSO-1.

## Module map — `src/platforms/`

Two distinct kinds of module live here; do not confuse them:

- **Infra clients** (swappable backends / external services): `db.ts` (Turso
  libSQL — replaced `postgres.ts` in TURSO-1), `redis.ts`, `rate-limit.ts`,
  `storage/` (4-backend adapter), `vercel.ts`, `github.ts`, `ai.ts`
  (provider-agnostic, PLOG-9), `next-image.ts`, `google-places.ts`.
- **Camera/EXIF decoders** (per-vendor makernote parsing): `apple.ts`,
  `fujifilm/`, `nikon/`, `sony.ts`, `google-pixel.ts`. These are the dormant,
  hard-won upstream value (heic/raw/orientation) — never rewrite them.

## Keep-as-is assets (do not "improve")

- **Four-backend storage adapter** (`src/platforms/storage/*`) — best-factored
  module. The image loader slots *in front* of it (PLOG-6), never edits it.
- **Per-domain sibling taxonomy** (`photo/tag/album/film/camera/lens/recipe/
  focal/year`) — most agent-legible convention. New taxonomy = new sibling dir.
- **Raw SQL, no ORM** — still an asset. Since TURSO-1 the dialect is
  **SQLite (Turso libSQL)**: JSON-text arrays via `json_each`, strftime dates,
  `LOWER(…) LIKE`. Zod row-parsing at the DB→domain boundary stays (PLOG-11).
  Storage conventions (ISO-text timestamps, JSON arrays, 0/1 booleans) are
  enforced by `src/platforms/db.ts` — see `UPSTREAM.md` → TURSO-1. (The old
  "Turso ruled out" verdict assumed keeping the PG dialect untouched; AX chose
  the dialect migration on 2026-07-11 to drop the Supabase bill.) Redis is
  still cache/rate-limit only.
- **The photo grid is deliberately NOT de-cliented.** Its client-component
  bundle is accepted; the win is gating the *admin* subtree (PLOG-14), not the
  grid.

## DB migration mechanism (caveat)

- `MIGRATIONS[]` in `src/db/migration.ts` is the ordered source of truth (labels
  are **dynamic** — never hardcode a label number). Since TURSO-1 it starts
  **empty**: the Turso DB was created fresh from the full base DDL (historical
  Postgres migrations 01–12 folded in). New entries use SQLite `ALTER TABLE` —
  there is no `ADD COLUMN IF NOT EXISTS`; the `schema_migrations` ledger is
  what makes re-runs safe.
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
