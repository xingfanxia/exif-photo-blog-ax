# Execution Kickoff Prompt — paste into a fresh session

> How to use: start a clean Claude Code session in this repo **with the `ax/overhaul` branch checked out** (the `docs/overhaul/` package lives here; `main` is byte-identical to `sambecker/main` and does NOT have it). Run in **normal mode (not full auto-accept)** so the Critical Decision Trigger confirmations reach you — the plan applies DB migrations. Paste the block below as the first message.

---

```
You are executing a fully-researched overhaul of this Next.js 16 photo blog (a fork of
sambecker/exif-photo-blog). All research, the fork-vs-rewrite decision, and a corrected
14-milestone plan are committed in docs/overhaul/ on this branch (ax/overhaul).

READ FIRST, in order:
  1. docs/overhaul/07-IMPLEMENTATION-PLAN.md       ← master plan, PLOG-1..PLOG-14
  2. docs/overhaul/06-DECISION-fork-vs-rewrite.md  ← why fork-refactor (not rewrite)
  Skim 00–05 for evidence as needed.

GOAL: Implement ALL 14 milestones (PLOG-1 → PLOG-14) end-to-end, in dependency order —
the full plan including the architecture tier (PLOG-9..14), not just the foundations.

CURRENT STATE (2026-06-19):
- DB was recreated fresh in Supabase AWS Tokyo (ap-northeast-1) — it is EMPTY, no photos,
  no `photos` table yet. PLOG-3's migration runner creates the schema; the owner re-uploads
  photos afterward (each upload runs the new AI stack live). PLOG-10 batch backfill is a
  no-op until a library exists — implement it, but note there's nothing to backfill yet.
- vercel.json already pins regions:["hnd1"] (Tokyo) to co-locate functions with the DB,
  so PLOG-8's region work is done — just CONFIRM in the dashboard after deploy.
- .env.local already has the new DB URL + keys (local). Vercel env is linked to the new DB.

LOCKED DECISIONS (do NOT re-litigate — settled in 02/06):
- Storage/DB stays Postgres on Supabase. Do NOT switch to Upstash Redis (KV — cannot run
  the app's relational SQL: ANY(tags), ILIKE, EXTRACT, INTERVAL, JOINs, GROUP BY) or
  Turso/SQLite (would force rewriting the whole PG-dialect query layer). Redis = cache/
  rate-limit ONLY.
- Fix the fork; do NOT rewrite the app. AI is the ONE scoped module rewrite (PLOG-9).
- Keep raw `pg` (no ORM); keep the four-backend storage adapter + per-domain taxonomy as-is.

FORK DISCIPLINE (non-negotiable):
- main MUST stay byte-identical to sambecker/main. Do ALL work on ax/* branches; NEVER
  commit to main. Prefer additive/new files over editing upstream hot files; log any
  unavoidable hot-file edit in UPSTREAM.md (you create it in PLOG-2).

PER-MILESTONE PROCESS:
  1. Read the milestone in 07 (goal / changes / verify oracle / deps).
  2. Implement exactly the listed changes. For PLOG-9/11/12/13, write the tests FIRST (TDD).
  3. Run the milestone's VERIFY oracle; paste the REAL output (jest, npm run build,
     EXPLAIN, chrome-devtools network/trace) — evidence, never claims.
  4. Multipass review: code-reviewer always; security-reviewer for auth/input/presigned
     URL (PLOG-12); database-reviewer for schema/migrations (PLOG-3/4/10/11). Fix findings.
  5. Commit (conventional commit) on the ax/* branch; tick the milestone in 07; continue.

DO THIS FIRST — PLOG-1: `jest` currently prints green while 6 of 16 suites crash at import
(eager `@upstash/redis` in src/platforms/redis.ts:1 leaking through the module graph). Fix
the 1-line lazy import + add __tests__/imports-smoke.test.ts BEFORE anything else — every
later verification gate is meaningless until the test signal is honest.

CRITICAL DECISION TRIGGERS — STOP and ask the owner (do NOT proceed unattended):
- Applying ANY migration/schema change to the Supabase DB beyond initial table creation:
  test on a Supabase BRANCH database first; confirm before touching the live DB (PLOG-3/4/10).
- PLOG-8 dashboard confirm (functions running in hnd1; Supabase non-pausing tier) needs
  owner dashboard access — surface as a checklist, don't loop on it.
- PLOG-9 model IDs: verify the default + fallback IDs LIVE against the Vercel AI Gateway
  catalog (vercel:ai-gateway skill) at implementation time — never copy IDs from plan text.
- Deleting the 11 stale ax/*/feature branches (PLOG-2): print the list and confirm first.
- Any force-push / data-dropping / irreversible op.

LOOP SETUP (run in NORMAL mode, not full auto-accept, so the gates above reach the owner):
  /goal All PLOG-1..14 in docs/overhaul/07-IMPLEMENTATION-PLAN.md are implemented on ax/*
  branches with each milestone's VERIFY oracle passing (pasted evidence), `npx jest --ci`
  reports 0 failed suites, and `npm run build` succeeds — pausing at the Critical Decision
  Triggers; or stop after 80 turns.
Then invoke: Skill(autonomous-grind, args="start <the same predicate>").

Work autonomously through the entire plan, pausing only at the Critical Decision Triggers.
Keep docs/overhaul/07 updated (check off milestones) as you go.
```

---

## Notes
- **Normal mode, not full auto-accept** — PLOG-3/4/10 apply DB migrations; the confirm-before-live gates only work if approvals reach you.
- The docs are on `ax/overhaul`. Keeping AX work on `ax/*` (not `main`) is what the fork contract — and the plan's own PLOG-2 — prescribe.
- Turn cap 80 is a backstop, not a target; the loop ends when the predicate's evidence (0 failed suites + green build + all oracles) is real.
- New DB is empty (fresh Tokyo Supabase project); `vercel.json` already pins `hnd1`; `.env.local` already updated.
