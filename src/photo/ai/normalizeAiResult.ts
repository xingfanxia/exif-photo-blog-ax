import { parameterize } from '@/utility/string';
import { cleanUpAiTextResponse } from '@/photo/ai';
import { GENERIC_TAG_DENY_LIST, AI_TAGS_MAX } from './prompts';

// Pure, code-enforced post-processing of AI output (PLOG-9). The model is
// asked for clean tags, but the invariants (lowercase / kebab / dedupe /
// deny-list / cap / soft-merge with existing) are enforced by code, never
// trusted to the model. Text fields are stripped of markdown/quotes.

export interface AiResultRaw {
  title?: string;
  caption?: string;
  semantic?: string;
  tags?: string | string[]; // CSV (legacy) or array
  // FORK: bilingual (Simplified-Chinese) siblings. null = model declined to
  // translate (OpenAI strict mode requires the key present, so it's nullable).
  title_zh?: string | null;
  caption_zh?: string | null;
  semantic_zh?: string | null;
  tags_zh?: string | string[] | null;
}

export interface AiResult {
  title?: string;
  caption?: string;
  semantic?: string;
  tags?: string[];
  title_zh?: string;
  caption_zh?: string;
  semantic_zh?: string;
  tags_zh?: string[];
}

const DENY = new Set(GENERIC_TAG_DENY_LIST.map(t => t.toLowerCase()));

// Tags (en + zh) are VARCHAR(255); guard per-tag so a stray long phrase from the
// model can't overflow the column and abort the insert.
const TAG_MAX_LENGTH = 255;

const normalizeTag = (tag: string): string =>
  parameterize(tag).toLowerCase();

export const normalizeTags = (
  tags: string | string[] | undefined,
  existingTags: string[] = [],
): string[] => {
  const raw = Array.isArray(tags) ? tags : (tags ?? '').split(',');
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (value: string) => {
    const norm = normalizeTag(value);
    // length guard: tags are VARCHAR(255); the model can occasionally emit a
    // whole phrase as a "tag" — drop it rather than overflow the column.
    if (!norm || norm.length > TAG_MAX_LENGTH || DENY.has(norm) ||
      seen.has(norm)) { return; }
    if (result.length >= AI_TAGS_MAX) { return; }
    seen.add(norm);
    result.push(norm);
  };

  raw.forEach(add);
  // Soft-merge existing tags (deduped, still capped) so AI generation never
  // silently drops tags the photo already had.
  existingTags.forEach(add);

  return result;
};

// FORK: normalize en + zh tags AS PAIRS so tags_zh stays index-aligned to the
// canonical tags. normalizeTags filters/dedupes/caps independently, so running
// it twice would desync the two arrays; here, dropping an en tag drops its zh
// partner too. zh falls back to the en slug when a translation is missing, so
// tags_zh.length always equals tags.length.
export const normalizeTagPairs = (
  tagsEn: string | string[] | undefined,
  tagsZh: string | string[] | null | undefined,
  existingTags: string[] = [],
): { tags: string[]; tagsZh: string[] } => {
  const en = Array.isArray(tagsEn) ? tagsEn : (tagsEn ?? '').split(',');
  const zh = Array.isArray(tagsZh) ? tagsZh : (tagsZh ?? '').split(',');
  const seen = new Set<string>();
  const tags: string[] = [];
  const tagsZhOut: string[] = [];

  const add = (value: string, zhLabel?: string) => {
    const norm = normalizeTag(value);
    if (!norm || norm.length > TAG_MAX_LENGTH || DENY.has(norm) ||
      seen.has(norm)) { return; }
    if (tags.length >= AI_TAGS_MAX) { return; }
    seen.add(norm);
    tags.push(norm);
    // zh label must also fit VARCHAR(255); fall back to the en slug if it's
    // missing or too long, keeping the two arrays index-aligned.
    const zh = (zhLabel ?? '').trim();
    tagsZhOut.push(zh && zh.length <= TAG_MAX_LENGTH ? zh : norm);
  };

  en.forEach((value, i) => add(value, zh[i]));
  existingTags.forEach(value => add(value));

  return { tags, tagsZh: tagsZhOut };
};

export const normalizeAiResult = (
  raw: AiResultRaw,
  existingTags: string[] = [],
): AiResult => {
  const tagPairs = raw.tags !== undefined
    ? normalizeTagPairs(raw.tags, raw.tags_zh, existingTags)
    : undefined;
  return {
    ...(raw.title !== undefined &&
      { title: cleanUpAiTextResponse(raw.title) }),
    ...(raw.caption !== undefined &&
      { caption: cleanUpAiTextResponse(raw.caption) }),
    ...(raw.semantic !== undefined &&
      { semantic: cleanUpAiTextResponse(raw.semantic) }),
    ...(tagPairs && { tags: tagPairs.tags }),
    // zh siblings — forwarded only when non-null (null = model declined). Empty
    // strings are dropped too so a blank translation doesn't shadow the en
    // fallback at display time.
    ...(raw.title_zh != null && raw.title_zh !== '' &&
      { title_zh: cleanUpAiTextResponse(raw.title_zh) }),
    ...(raw.caption_zh != null && raw.caption_zh !== '' &&
      { caption_zh: cleanUpAiTextResponse(raw.caption_zh) }),
    ...(raw.semantic_zh != null && raw.semantic_zh !== '' &&
      { semantic_zh: cleanUpAiTextResponse(raw.semantic_zh) }),
    // Emit tags_zh ONLY when the model actually supplied Chinese tags — a
    // tags-only (or null) result stays {tags} (display falls back to en), and
    // when zh IS present the paired normalizer guarantees alignment to tags.
    ...(tagPairs && raw.tags_zh != null && { tags_zh: tagPairs.tagsZh }),
  };
};
