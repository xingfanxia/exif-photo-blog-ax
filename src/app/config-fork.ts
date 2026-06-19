/**
 * Fork-only configuration surface (PLOG-2 scaffold).
 *
 * `src/app/config.ts` MUST stay byte-identical to sambecker/main (fork
 * contract — see CLAUDE.md / UPSTREAM.md). AX-specific config that would
 * otherwise force an edit to config.ts lives HERE instead. Because this
 * module re-exports all of upstream config below, a call site can switch a
 * single import (`@/app/config` → `@/app/config-fork`) and get the upstream
 * values plus the fork-only ones — no edit to config.ts required.
 *
 * Landing this scaffold in PLOG-2 also breaks the PLOG-8 ↔ PLOG-12 ordering
 * cycle: PLOG-8 writes its AI Gateway vars here, PLOG-12 expands it.
 *
 * Populated incrementally:
 *  - PLOG-8  → AI Gateway vars (AI_MODEL, AI_MODEL_FALLBACK, AI_GATEWAY_API_KEY,
 *              AI_CONTENT_GENERATION_ENABLED)
 *  - PLOG-12 → PHOTO_ID_FORWARDING_TABLE, ADMIN_EMAIL/PASSWORD,
 *              reconciled IMAGE_QUALITY
 */

// Re-export the entire upstream config so `@/app/config-fork` is a strict
// superset of `@/app/config`. config.ts has no default export, so `export *`
// is complete.
export * from '@/app/config';

// ── Fork-only configuration ────────────────────────────────────────────────

// PLOG-9 Part 2 — AI Gateway. Model IDs are ENV-DRIVEN (never hardcoded from a
// plan/doc): set AI_MODEL / AI_MODEL_FALLBACK to current Vercel AI Gateway
// catalog ids (e.g. "openai/gpt-4o", "google/gemini-2.5-flash") — verify
// against the LIVE catalog. The default below is a stable, currently-available
// placeholder; override it in env for production. AI_GATEWAY_API_KEY enables
// the gateway path (no per-provider key needed).
export const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-4o';
export const AI_MODEL_FALLBACK = process.env.AI_MODEL_FALLBACK;
export const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;

// AI is enabled by either a direct OpenAI key OR an AI Gateway key. (Upstream's
// AI_CONTENT_GENERATION_ENABLED keys only on OPENAI_SECRET_KEY; this fork-only
// flag also accepts the gateway. Consumers that need gateway-only enablement
// import this from config-fork; the rest still see the upstream flag.)
export const AI_CONTENT_GENERATION_ENABLED_FORK = Boolean(
  process.env.OPENAI_SECRET_KEY || process.env.AI_GATEWAY_API_KEY,
);
