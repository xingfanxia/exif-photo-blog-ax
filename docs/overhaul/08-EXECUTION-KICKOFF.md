# Execution Kickoff Prompt — paste into a fresh session

> How to use: start a clean Claude Code session in this repo **with the `ax/overhaul` branch checked out** (the `docs/overhaul/` package lives here; `main` is byte-identical to `sambecker/main` and does NOT have it). Paste the block below as the first message. Run in **normal mode (not full auto-accept)** so the Critical Decision Trigger confirmations reach you — the plan applies DB migrations.

---

```
You are executing a fully-researched overhaul of this Next.js 16 photo blog (a fork of
sambecker/exif-photo-blog). All research, the fork-vs-rewrite decision, and a corrected
14-milestone implementation plan are already committed in docs/overhaul/ on this branch
(ax/overhaul).

READ FIRST, in order:
  1. docs/overhaul/07-IMPLEMENTATION-PLAN.md       ← the master plan, PLOG-1..PLOG-14
  2. docs/overhaul/06-DECISION-fork-vs-rewrite.md  ← why fork-refactor (not rewrite)
  Skim 00–05 for evidence as needed.

GOAL: Implement ALL 14 milestones (PLOG-1 → PLOG-14) end-to-end, in the dependency order
in the plan — the full plan, including the architecture tier (PLOG-9..14), not just the
foundations.

LOCKED DECISIONS (do NOT re-litigate — they are settled in 02/06):
- Storage/DB stays Postgres on Supabase. Do NOT switch the data layer to Upstash Redis
  (a KV store — it physically cannot run the app's relational SQL: ANY(tags), ILIKE,
  EXTRACT, INTERVAL, JOINs, GROUP BY) or Turso/SQLite (would force rewriting the entire
  Postgres-dialect query layer for edge latency a region-co-located app does not need).
  Redis stays cache/rate-limit ONLY. "Postgres feels slow" is missing indexes + the
  edit-page code waste + possible Supabase free-tier auto-pause + an untuned pool + a
  REGION MISMATCH — all fixed within this stack (PLOG-3/4/5/8), never by swapping engines.
- REGION (2026-06-19): the DB is now AWS Tokyo `ap-northeast-1` (Supabase project
  `mhivudssocofqzujqbxa`). In PLOG-8, SET the Vercel function region to `hnd1` (Tokyo) to
  co-locate; the default `iad1` is a trans-Pacific hop on every dynamic/admin/build query.
- Fix the fork; do NOT rewrite the app. AI is the ONE scoped module rewrite (PLOG-9).
- Keep raw `pg` (no ORM); keep the four-backend storage adapter and the per-domain
  sibling taxonomy layout as-is.

FORK DISCIPLINE (non-negotiable):
- main MUST stay byte-identical to sambecker/main. Do ALL work on ax/* branches
  (commit per milestone on ax/overhaul, or branch ax/plog-N-<slug> per milestone).
  NEVER commit to main.
- Prefer additive/new files over editing upstream hot files; when a hot-file edit is
  unavoidable, record it in UPSTREAM.md (you create this in PLOG-2).

PER-MILESTONE PROCESS:
  1. Read the milestone in 07 (goal / changes / verify oracle / deps).
  2. Implement exactly the listed changes. For PLOG-9/11/12/13, write the specified
     tests FIRST (TDD), then make them pass.
  3. Run the milestone's VERIFY oracle and paste the real output (jest, npm run build,
     EXPLAIN ANALYZE, chrome-devtools network trace) — evidence, never claims.
  4. Multipass review: code-reviewer always; security-reviewer for auth/input/presigned
     URL (PLOG-12); database-reviewer for schema/migrations (PLOG-3/4/10/11). Fix all
     findings.
  5. Commit (conventional commit) on the ax/* branch; tick the milestone in 07; continue
     to the next unblocked milestone.

DO THIS FIRST — PLOG-1: `jest` currently prints green while 6 of 16 suites crash at import
(eager `@upstash/redis` in src/platforms/redis.ts:1 leaking through the module graph).
Fix the 1-line lazy import + add __tests__/imports-smoke.test.ts BEFORE anything else —
every later verification gate is meaningless until the test signal is honest.

CRITICAL DECISION TRIGGERS — STOP and ask the owner (do NOT proceed unattended):
- Applying ANY migration/schema change to the PROD Supabase DB. Test on a Supabase BRANCH
  database first; get explicit confirmation before touching prod (PLOG-3/4/10).
- PLOG-8 dashboard checks (Vercel function region, Supabase non-pausing tier) need owner
  dashboard access — surface them as a checklist; don't loop trying to read a dashboard.
- PLOG-9 model IDs: verify the default + fallback IDs LIVE against the Vercel AI Gateway
  catalog (vercel:ai-gateway skill) at implementation time — never copy IDs from the plan
  text (they drift; gpt-5.2 in the repo is already stale).
- Deleting the 11 stale ax/*/feature branches (PLOG-2): print the list and confirm first.
- Any force-push / data-dropping / irreversible op.

LOOP SETUP: set a goal + pair it with autonomous-grind, and run in NORMAL mode (not full
auto-accept) so the Critical Decision Trigger confirmations actually reach the owner:
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
- **Normal mode, not full auto-accept** — PLOG-3/4/10 apply DB migrations; the confirm-before-prod gates only work if approvals reach you.
- The docs are on `ax/overhaul`. Keeping them on `ax/*` (not `main`) is what the fork contract — and the plan's own PLOG-2 — prescribe.
- Turn cap 80 is a backstop, not a target; the loop ends when the predicate's evidence (0 failed suites + green build + all oracles) is real.
