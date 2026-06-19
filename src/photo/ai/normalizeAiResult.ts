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
}

export interface AiResult {
  title?: string;
  caption?: string;
  semantic?: string;
  tags?: string[];
}

const DENY = new Set(GENERIC_TAG_DENY_LIST.map(t => t.toLowerCase()));

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
    if (!norm || DENY.has(norm) || seen.has(norm)) { return; }
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

export const normalizeAiResult = (
  raw: AiResultRaw,
  existingTags: string[] = [],
): AiResult => ({
  ...(raw.title !== undefined &&
    { title: cleanUpAiTextResponse(raw.title) }),
  ...(raw.caption !== undefined &&
    { caption: cleanUpAiTextResponse(raw.caption) }),
  ...(raw.semantic !== undefined &&
    { semantic: cleanUpAiTextResponse(raw.semantic) }),
  ...(raw.tags !== undefined &&
    { tags: normalizeTags(raw.tags, existingTags) }),
});
