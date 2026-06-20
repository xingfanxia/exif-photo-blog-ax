# PLOG-15 — Faceted controlled-vocabulary tag redesign (design)

> Design-first doc for goal task 4 (`docs/overhaul/10-polish-and-tag-redesign-goal.md`).
> Implemented after this doc; see the same PR's commits.

## Problem & root cause

The PLOG-9 AI tagger emits **free-form** keywords (4–10 per photo, each "highly
specific … not redundant" by prompt design). Root cause of the browse problem:
the prompt **optimizes for uniqueness**, so tags are near-unique per photo. With
51 photos that yields a long tail of singletons — tags don't cluster, so
`/tag/<slug>` pages each hold ~1 photo and tag-browse is useless.

## Decision — replace free-form with a controlled facet vocabulary (+ 1–2 free subjects)

Replace the free-form generation with a **fixed bilingual vocabulary**. The model
**classifies** each photo into a small set of facets (hard-constrained by
`z.enum`), guaranteeing every photo draws from the same shared vocabulary →
tags cluster. Keep **0–2 free-form `subject`** keywords for specificity (the one
place uniqueness is still wanted).

Why replace, not augment: augmenting keeps the singleton tail that caused the
problem. The controlled set is what makes browse work.

### Data model — reuse `tags` / `tags_zh`, NO migration

Facet values are stored as ordinary tag **slugs** in the existing `tags TEXT[]`
column; their Chinese labels go in the aligned `tags_zh VARCHAR(255)[]` column.
Nothing about routing (`/tag/<slug>`), `PhotoTag` display, the content-language
toggle, or the DB schema changes — facet values are just tags drawn from a fixed
set instead of free text.

**Improvement over status quo:** the zh label for a facet tag now comes from the
**vocabulary (code)**, not the model — deterministic, no translation drift. Only
free `subject` tags still rely on model zh (with slug fallback).

Facet membership is recoverable from a slug via a `facetForSlug()` lookup, so the
UI can order/group by facet **without** prefixing slugs (`genre-street`) — bare
slugs keep URLs and the existing tag system clean.

## Taxonomy (`src/photo/ai/tagVocabulary.ts` is the source of truth)

Five facets. genre / mood / color / tonality are **required** (always classified
→ ≥4 clustering tags/photo); light is **nullable** (not every frame has a
distinct light/time); subject is **free-form, 0–2**.

| Facet | key | zh | cardinality |
|---|---|---|---|
| Genre | `genre` | 题材 | 1 (required enum) |
| Mood | `mood` | 氛围 | 1 (required enum) |
| Color style | `color` | 色彩 | 1 (required enum) |
| Tonality | `tonality` | 影调 | 1 (required enum) |
| Light / time | `light` | 光线 | 0–1 (nullable enum) |
| Subject | `subject` | 主题 | 0–2 (free-form) |

Slugs are globally unique across facets (so `facetForSlug` is unambiguous). The
full value lists with zh labels live in `tagVocabulary.ts`.

## AI pipeline changes

The orchestration boundary stays intact: `model(facetSchema)` →
`normalizeAiResult` → `schema.parse` → server collapses facets → `tags`/`tags_zh`.

1. **`getAiImageQuerySchema` (tags branch)** — emit one `z.enum` per required
   facet, a nullable `z.enum` for light, and `subject` / `subject_zh` free arrays
   (`.max(2)`), instead of the old `tags` / `tags_zh` arrays. The query text
   describes each facet + lists allowed values to steer classification.
2. **`normalizeAiResult`** — unchanged for title/caption/semantic and for the
   legacy free-form `tags` path (keeps existing tests green). Adds **pass-through**
   of facet enum fields + hygiene on `subject` (reuses the slug/deny guards). It
   does NOT collapse — the schema still validates facets post-normalize.
3. **`facetsToTags()` (new, in `normalizeAiResult.ts` — co-located with the tag
   hygiene + deny-list it reuses)** — deterministic collapse:
   ordered `[genre, mood, color, tonality, light, …subject]` → `{ tags, tagsZh }`,
   zh from the vocabulary for facets, model-zh-or-slug for subjects, deduped +
   capped at `AI_TAGS_MAX`. Facet slugs bypass the generic deny-list (they are
   controlled & meaningful, e.g. `architecture` which the free-form deny-list
   bans); only `subject` runs the deny-list.
4. **`server.ts generateAiImageQueries`** — when the result carries facet fields,
   call `facetsToTags` and return the CSV `tags` / `tagsZh` callers already expect.

### Both generators share one path (no drift)

Tags previously had TWO generators: the batch/backfill **object** path
(`generateAiImageQueries`) and the interactive admin "generate tags" button's
**text-stream** path (`streamOpenAiImageQuery` + `getAiImageQuery('tags')`). A
structured facet classification can't stream as free text, so the interactive
button now calls a NON-streaming object-path action (`generateAiImageTagsAction`
→ `generateAiImageQueries(['tags'])` → `facetsToTags`) via `useAiImageTagsQuery`,
and `useSyncAiContentToForm` syncs both `tags` and `tagsZh` into the form. Both
generators now flow through the SAME `generateAiImageQueries`/`facetsToTags`, so
the form and the backfill can't diverge — and the interactive button gained
bilingual tags it never had before. (title/caption/semantic still stream.)

## Browse UX

- **Clustering (core win)** comes for free: a controlled vocabulary means many
  photos share `street` / `serene` / `warm`, so `/tag/<slug>` pages fill up and
  the tag overview becomes a real index.
- **Facet-ordered display**: a photo's tags render in facet order
  (genre → mood → color → tonality → light → subject) instead of count-sorted, so
  the detail view reads as a faceted descriptor. Implemented by sorting via
  `facetForSlug` rank in `PhotoLarge` before handing tags to `PhotoTags`.
- A dedicated faceted-**filter** page (AND-across-facets) is a future enhancement;
  the controlled vocabulary is the prerequisite this lands.

## Re-tag all 51 photos

Extend the existing idempotent `ai:backfill` worker (PLOG-10) rather than a new
script:
- Persist the `_zh` columns too (`title_zh` / `caption_zh` / `semantic_description_zh`
  / `tags_zh`) — the worker previously dropped them (pre-bilingual gap).
- Bump `AI_PROMPT_VERSION` → every photo's `input_hash` changes → all 51 re-tag
  on the next `npm run ai:backfill`; a second run is a no-op.

## Tests

- `tagVocabulary`: slug uniqueness across facets; `facetForSlug` / `zhForSlug`;
  `facetsToTags` ordering, dedupe, cap, deny-list bypass for facets, subject
  hygiene + zh fallback.
- `normalizeAiResult`: existing free-form tests stay green; add facet
  pass-through + subject-hygiene cases.
