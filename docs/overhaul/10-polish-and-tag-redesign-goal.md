# Next-session goal — i18n/theme/full-res polish + faceted tag redesign

> Self-contained kickoff for a fresh session. Read this + the repo; the bilingual
> overhaul is already shipped — these are the follow-ups.

## Where things are

- **Repo:** `~/projects/portfolio/exif-photo-blog-ax` · **Branch:** `ax/overhaul`
  (a few commits ahead of `origin/main`).
- **`main` IS the product** (PR #17 merged): it **intentionally diverges** from
  `sambecker/main`. Do **NOT** reset/ff `main` to upstream — it would wipe the
  product. `git diff sambecker/main...main` is expected to be large.
- **Read first:** `.../memory/MEMORY.md` →
  `overhaul-executed`, `ai-gateway-setup`, `pending-polish-and-tag-redesign`,
  `r2-storage-for-plog6`. Plus `CLAUDE.md` (fork model) and `UPSTREAM.md`.

**Shipped + verified (do NOT redo):** full PLOG-1..14 overhaul; bilingual AI
photo fields (`title/caption/tags/semantic` + `*_zh`); an **EN/中 toggle that
switches the WHOLE site** (UI chrome via AppText + photo content) — plain-text in
the nav; **51 portfolio photos live** (Tokyo Supabase + R2 custom domain
`photo-storage.ax0x.ai`), all bilingual + `color_sort`; strict-slug tag guard
killing reasoning-leakage/CJK in en tags. Gate green: `npx jest --ci`
(23 suites / 99 tests), `npm run build` exit 0.

## Tasks — in order; each: implement → jest + build green → browser-verify

### 1. Move the theme switcher into the nav (in-flight, ~2 edits)
Light theme **already works** (next-themes + full light/dark utilities); it was
just undiscoverable in the footer. In `src/app/NavClient.tsx` (~L118-121) the
`<ContentLanguageSwitcher/>` sits in a `shrink-0` div — add `<ThemeSwitcher/>`
(import `@/app/ThemeSwitcher`) beside it; remove `<ThemeSwitcher/>` + its import
from `src/app/Footer.tsx` (~L75). Verify the nav doesn't crowd on mobile
(`chrome-devtools` emulate iPhone); truncate the title if needed.

### 2. i18n completeness audit — "确保所有页面元素都支持"
Full-site i18n is wired (`AppTextProviderClient` selects `en-us`/`zh-cn` from
`contentLanguage`). Grep `src` for user-facing strings **not** routed through
`useAppText()`/`appText.*` and fix them; toggle EN/中 on every page type (grid,
photo detail, tag/album/camera/lens/film/recipe/focal/year, about, admin) and
confirm all chrome switches. **By design**, OG-image text + RSS +
`generateMetadata` stay canonical English (external consumers have no cookie) —
that's correct, don't "fix" it.

### 3. Full-resolution images — "点开放大时加载原图"
The fullscreen/zoom (1:1) view loads a soft resized variant. Make it load the R2
**original**. Investigate `src/photo/PhotoLarge.tsx` (zoom/expand control), the
custom Cloudflare image loader (`next.config.ts` `loaderFile` + `imageSizes`),
`getOptimizedPhotoUrl`, and `convertUploadToPhoto` (confirm `photo-<id>.jpg` is
the true full-res original, not recompressed). Consider the
`cloudflare-r2-setup` skill.

### 4. Tag system redesign — faceted controlled vocabulary (DESIGN FIRST)
The current free-form AI tags are **too sparse/scattered** — unique per photo, so
they don't cluster and are useless for browsing. Replace with **FIXED enums** the
AI classifies into, one (or 1–2) value per facet:

- **genre** — portrait / landscape / street / wildlife / wedding / architecture /
  still-life / documentary / …
- **mood** — serene / dramatic / melancholic / joyful / intimate / mysterious / …
- **色彩风格 color-style** — warm / cool / muted / vibrant / monochrome / pastel /
  earthy / …
- **影调 tonality** — high-key / low-key / high-contrast / soft / balanced / …
- *(consider)* **lighting/time** — golden-hour / blue-hour / night / overcast / …
- *(optional)* keep 1–2 free-form **subject** tags for specificity.

Constrain the model via structured output (`z.enum` per facet) so output is
consistent + clusterable. Each enum value is **bilingual** (en slug + zh label) —
fits the existing `tags`/`tags_zh` + the content-language toggle. Decide
replace-vs-augment, design the taxonomy + browse UX **before coding**, then
re-tag all 51 photos (extend `scripts/batch-upload` or a re-tag script). This is
the largest task — think it through first.

## Gotchas

- **AI** = ComputeLabs new-api gateway, model `gpt-5.5-standard`,
  `AI_REASONING_EFFORT=low` (reasoning model: 133s→~3s). DeepSeek can't do vision.
  `.env.local`: `OPENAI_SECRET_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`.
- **`contentLanguage`** (AppState, cookie `content-language`) drives BOTH UI text
  AND photo content. Helpers `titleForPhoto/descriptionForPhoto/captionForPhoto/
  altTextForPhoto` take a `lang` param; tag labels via `PhotoTag` `displayLabel`.
- **Tags:** en `tags` = ASCII slugs (routing); zh in `tags_zh` (display, aligned).
  Guard `isValidTag` (strict slug) in `src/photo/ai/normalizeAiResult.ts`.
- **Dev:** `npm run dev` (:3000). Temp local admin creds in `.env.local`
  (`admin@local.test` / `localtest123`) for browser sign-in.
- **Browser-verify** with the `claude-in-chrome` MCP. (`chrome-devtools` MCP had
  a stale profile lock — `pkill -f chrome-devtools-mcp/chrome-profile` if it errors.)
- **SECURITY:** rotate the new-api gateway key + the R2 admin `cfat_` token pasted
  in the prior session (only the R2 *S3* keys in `.env.local` are needed ongoing).
- **Done:** push `ax/overhaul`; PR→merge or fast-forward `main` (main is the
  product). jest + build must be green.
