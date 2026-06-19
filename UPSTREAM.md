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

---

> Maintained per the overhaul plan (`docs/overhaul/07-IMPLEMENTATION-PLAN.md`).
> Conventions and the upstream-sync procedure live in `CLAUDE.md`.
