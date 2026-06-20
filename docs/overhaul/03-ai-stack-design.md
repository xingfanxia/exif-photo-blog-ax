# AI Generation Stack — Target Design

> Architecture/prompt/reliability design from direct code evidence + engineering principles (AI is a subroutine the deterministic code wraps). **Model choice + 2026 pricing comes from the `AIStackResearch` agent → fills the table in §2.**

## Current state (recap from `01-codebase-evidence.md`)
- `src/platforms/openai.ts`: single `createOpenAI` client, model default `gpt-5.2`, structured output via `generateText({ output: Output.object({schema}) })`.
- Already supports `OPENAI_BASE_URL` + `OPENAI_MODEL` → OpenAI-compatible endpoints reachable today.
- Prompts are weak one-liners; `cleanUpAiTextResponse` does light string cleanup; **no code-enforced invariants** (tag count, punctuation, length).

## Design principles applied (per engineering rules)
1. **LLM is a wrapped subroutine, not the driver.** Deterministic code builds the prompt, calls the model, validates, post-processes, retries — and owns every branch.
2. **Inject hard invariants by code, never trust the model.** Tag count, "no punctuation", title word-count, lowercase normalization, dedupe-against-existing-tags → enforced in TS after generation, not just asked for in the prompt.
3. **Provider indirection = test seam.** A single `getVisionModel()` factory returning an AI SDK `LanguageModel` makes the stack provider-agnostic AND offline-testable with a mock model (`MockLanguageModelV2`).
4. **Validate at the boundary** (Zod) — already done; keep and tighten.

## 1. Provider-agnostic via Vercel AI Gateway (the rewrite core)
**Decision (high confidence, independent of pricing):** route through **Vercel AI Gateway** using plain `"provider/model"` strings instead of hardcoding `@ai-sdk/openai`.
- Why: zero-egress data path on Vercel, built-in fallbacks + observability + cost tracking, swap providers via env without code change, no per-provider SDK packages. (Vercel knowledge-update: "prefer plain `provider/model` strings through the gateway by default".)
- Keep `OPENAI_BASE_URL`/`OPENAI_SECRET_KEY` path as an **escape hatch** for self-hosted/OpenAI-compatible endpoints (back-compat for existing deployers).
- New env: `AI_MODEL` (e.g. `google/gemini-2.x-flash`), `AI_MODEL_FALLBACK`, `AI_GATEWAY_API_KEY`. Factory resolves: Gateway model string → else legacy OpenAI client.

## 2. Model selection — RESOLVED (AIStackResearch, sourced 2026-06-19)
**Recommended default: `google/gemini-3.1-flash-lite`** ($0.25/$1.50 per 1M in/out). Cheapest *current-gen* strong vision model, Google-positioned for "high-volume, retry-friendly" workloads = bulk photo tagging. The repo's current `gpt-5.2` default is a **~10–15× overspend** for this task. `media_resolution` lever halves image cost when fine detail isn't needed.
**Gateway fallback chain:** `['openai/gpt-5-mini','anthropic/claude-haiku-4-5']` — spreads across all three labs so no single outage blocks uploads. (Capability mismatch / refusal / invalid-structure auto-advances the chain.)

Cost model: 1000 photos ≈ 1.5M input tok + 0.2M output tok. Batch = 50% off (all three providers, ≤24h).

| Model ID | In $/1M | Out $/1M | /1000 photos (std → batch) | Note |
|---|---|---|---|---|
| **google/gemini-3.1-flash-lite ⭐ default** | $0.25 | $1.50 | **$0.68 → $0.34** | current-gen, cheapest strong vision |
| google/gemini-2.5-flash-lite | $0.10 | $0.40 | $0.23 → $0.12 | older gen, even cheaper |
| openai/gpt-5-mini ⭐ fallback | $0.25 | $2.00 | $0.78 → $0.39 | OpenAI budget current-gen |
| openai/gpt-5.4-nano | $0.20 | $1.25 | $0.55 → $0.28 | cheapest OpenAI |
| openai/gpt-4o-mini | $0.15 | $0.60 | $0.35 → $0.18 | prev-gen, still fine |
| anthropic/claude-haiku-4-5 ⭐ fallback | $1.00 | $5.00 | $2.50 → $1.25 | strong, pricier |
| openai/gpt-5.2 (current repo default) | ~$1.25 | ~$10.00 | ~$3.88 → $1.94 | **10–15× overspend — replace** |

**Cost takeaway:** re-tagging the entire library is **sub-dollar** ($0.34 batch on the recommended model). Cost is a non-issue at blog scale → optimize for correctness/consistency, not price.

Sources: `ai.google.dev/gemini-api/docs/pricing`, `costgoat.com/pricing/gemini-api`, `aipricing.guru/openai-pricing`, `anthropic.com/news/claude-haiku-4-5`, context7 `/websites/ai-sdk_dev`, `vercel.com/docs/ai-gateway`, `vercel.com/changelog/model-fallbacks-now-available-in-vercel-ai-gateway`.

### Confirmed architecture details (AIStackResearch)
- v6 ships the Gateway provider **inside the `ai` package — no new dependency**; pass `"creator/model"` to `model:`. Tokens cost the same as direct (no markup), $5/mo free credit.
- Fallback via `providerOptions.gateway.models: [...]`.
- Schema: **`tags: z.array(z.string()).min(4).max(10)`** (NOT a CSV string), plus `.max()` length caps on title/caption/semantic — constrained decoding enforces counts.
- Stay on `generateText` + `Output.object` (v6-recommended for multimodal+structured); `streamObject` only for progressive UI (not needed).
- Prompts: dimension-driven system prompt (subject entity/light quality/composition/etc.), **positive specificity** over negation (keep a short 3–5 term deny-list as secondary guard), 2–4 few-shot image+tag pairs, **soft** existing-tag bias (never closed vocab; for 1000+ tags use pgvector to inject only top-~20 relevant), light internal CoT kept OUT of the persisted schema.
- Batch backfill: 50%-off Batch APIs from a **standalone worker script** (NOT a Vercel serverless invocation — 60s/4.5MB caps), `custom_id=photo-{id}`, sha256 `input_hash` idempotency + `metadata_status` column, annotate-and-continue per item, resubmit only failed sub-batch. Per-upload stays real-time with `p-limit(5)` + `Retry-After` backoff.

## 3. Structured output + reliability
- Keep `generateObject`/`Output.object` with a Zod schema, but make the schema **typed per requested field set** (already dynamic — good).
- **Tags as `z.array(z.string())`** not a comma-joined `z.string()` → removes brittle string-splitting. Enforce `.min(1).max(N)` and post-filter.
- **Code-enforced post-processing pipeline** (`normalizeAiResult`): trim, strip punctuation, lowercase tags, dedupe, drop banned generic tags (extend the current "nature/travel/sky" list into a real stop-list constant), cap counts, merge with existing tags by similarity.
- **Failure-as-value**: each field generation returns `{value, error}`; one failed field never aborts the batch (matches the existing `{error}` return shape).
- **Tolerant retry on uncertainty**: on schema-parse failure, one retry with a stricter "respond ONLY with valid JSON matching: …" suffix appended by code.

## 4. Prompt quality
- Replace one-liners with a structured system+user prompt: role ("expert photo cataloguer"), explicit output contract, the existing-tags controlled vocabulary passed in for **consistency** (already partially done for tags — extend to enforce reuse when semantically close), and 1–2 few-shot exemplars of good vs bad tags.
- Make "specific not generic" a code-checked rule (stop-list) rather than a prompt hope.

## 5. Batch / cost control for re-generating an existing library
- For bulk re-gen across ~N photos: prefer provider **Batch API** (OpenAI Batch / Gemini batch) where the Gateway/SDK supports it → ~50% cost cut, async.
- Idempotency: only regenerate fields that are empty OR explicitly forced; store a `ai_generated_at`/version marker to skip already-done photos.
- Keep Upstash rate-limit guard; widen batch token budget.
- Cost-to-regenerate-1000-photos estimate → from agent.

## Scope verdict
This is a **targeted rewrite of `src/platforms/openai.ts` → `src/platforms/ai.ts`** (provider-agnostic) + a new `normalizeAiResult` post-processor + prompt constants. ~2 files changed, 1 added. Not a from-scratch system. Back-compatible via env.
