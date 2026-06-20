// AI prompt + tag-hygiene constants (PLOG-9). Kept separate from the query
// builders so both the prompt and the post-processor (normalizeAiResult)
// consume ONE deny-list — a tag the model is told to avoid is also stripped
// deterministically by code, never trusted to the model alone.

// Over-generic tags that add no search/browse value on a photo blog. Lowercase,
// matched after normalization. Extend freely.
export const GENERIC_TAG_DENY_LIST: string[] = [
  'nature',
  'travel',
  'architecture',
  'sky',
  'photo',
  'photograph',
  'photography',
  'image',
  'picture',
  'art',
  'beautiful',
  'view',
  'scene',
  'scenery',
  'landscape',
  'outdoor',
  'outdoors',
  'indoor',
  'color',
  'colour',
];

// Tag count bounds enforced by the schema AND normalizeAiResult.
export const AI_TAGS_MIN = 4;
export const AI_TAGS_MAX = 10;

// PLOG-15: max free-form `subject` tags allowed alongside the controlled facet
// tags (genre/mood/color/tonality/light). Facets give clustering; 1-2 subjects
// add specificity.
export const AI_SUBJECT_TAGS_MAX = 2;
