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
// (none yet — added by PLOG-8 / PLOG-12)
