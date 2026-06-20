// PLOG-15: controlled, bilingual facet vocabulary for AI tagging.
//
// The free-form PLOG-9 tagger optimized for UNIQUE keywords, so tags never
// clustered (≈1 photo per /tag/<slug>). This vocabulary is the source of truth
// for a FIXED set the model classifies into (hard-constrained by z.enum in
// getAiImageQuerySchema) — every photo draws from the same shared vocabulary,
// so tags cluster and browse works.
//
// Each value is bilingual (en slug for routing/display + zh label). Facet zh
// labels are CODE-DEFINED here, NOT model-translated, so tags_zh for facet tags
// is deterministic (no translation drift). Only free-form `subject` tags still
// rely on model zh (slug fallback).
//
// Slugs MUST be globally unique across facets (asserted in tests) so
// `facetForSlug` is unambiguous and bare slugs need no `genre-`/`mood-` prefix.

export type FacetKey = 'genre' | 'mood' | 'color' | 'tonality' | 'light';

export interface FacetValue {
  slug: string;
  zh: string;
}

export interface Facet {
  key: FacetKey;
  zh: string;
  // required=true → required z.enum (always classified); false → nullable enum.
  required: boolean;
  values: readonly FacetValue[];
}

// Ordered: genre → mood → color → tonality → light. Drives both classification
// and the facet-ordered display of a photo's tags.
export const TAG_FACETS: readonly Facet[] = [
  {
    key: 'genre',
    zh: '题材',
    required: true,
    values: [
      { slug: 'portrait', zh: '人像' },
      { slug: 'landscape', zh: '风光' },
      { slug: 'street', zh: '街拍' },
      { slug: 'architecture', zh: '建筑' },
      { slug: 'wildlife', zh: '野生动物' },
      { slug: 'still-life', zh: '静物' },
      { slug: 'documentary', zh: '纪实' },
      { slug: 'travel', zh: '旅行' },
      { slug: 'nightscape', zh: '夜景' },
      { slug: 'abstract', zh: '抽象' },
      { slug: 'macro', zh: '微距' },
      { slug: 'minimalist', zh: '极简' },
    ],
  },
  {
    key: 'mood',
    zh: '氛围',
    required: true,
    values: [
      { slug: 'serene', zh: '宁静' },
      { slug: 'dramatic', zh: '戏剧性' },
      { slug: 'melancholic', zh: '忧郁' },
      { slug: 'joyful', zh: '欢快' },
      { slug: 'intimate', zh: '亲密' },
      { slug: 'mysterious', zh: '神秘' },
      { slug: 'nostalgic', zh: '怀旧' },
      { slug: 'energetic', zh: '充满活力' },
      { slug: 'contemplative', zh: '沉思' },
      { slug: 'tense', zh: '紧张' },
      { slug: 'dreamy', zh: '梦幻' },
      { slug: 'solemn', zh: '庄重' },
    ],
  },
  {
    key: 'color',
    zh: '色彩',
    required: true,
    values: [
      { slug: 'warm', zh: '暖色' },
      { slug: 'cool', zh: '冷色' },
      { slug: 'muted', zh: '柔和' },
      { slug: 'vibrant', zh: '鲜艳' },
      { slug: 'monochrome', zh: '单色' },
      { slug: 'pastel', zh: '粉彩' },
      { slug: 'earthy', zh: '大地色' },
      { slug: 'neutral', zh: '中性' },
      { slug: 'high-saturation', zh: '高饱和' },
      { slug: 'desaturated', zh: '低饱和' },
    ],
  },
  {
    key: 'tonality',
    zh: '影调',
    required: true,
    values: [
      { slug: 'high-key', zh: '高调' },
      { slug: 'low-key', zh: '低调' },
      { slug: 'high-contrast', zh: '高反差' },
      { slug: 'low-contrast', zh: '低反差' },
      { slug: 'balanced', zh: '均衡' },
    ],
  },
  {
    key: 'light',
    zh: '光线',
    required: false,
    values: [
      { slug: 'golden-hour', zh: '黄金时刻' },
      { slug: 'blue-hour', zh: '蓝调时刻' },
      { slug: 'harsh-sunlight', zh: '强光' },
      { slug: 'overcast', zh: '阴天' },
      { slug: 'night', zh: '夜晚' },
      { slug: 'indoor', zh: '室内' },
      { slug: 'backlit', zh: '逆光' },
      { slug: 'diffused', zh: '漫射光' },
      { slug: 'neon', zh: '霓虹' },
    ],
  },
];

// Free-form subject facet — its order rank, for display sorting only.
export const SUBJECT_FACET_RANK = TAG_FACETS.length;

const SLUG_TO_FACET = new Map<string, FacetKey>();
const SLUG_TO_ZH = new Map<string, string>();
TAG_FACETS.forEach(facet =>
  facet.values.forEach(({ slug, zh }) => {
    SLUG_TO_FACET.set(slug, facet.key);
    SLUG_TO_ZH.set(slug, zh);
  }),
);

const FACET_RANK = new Map<FacetKey, number>(
  TAG_FACETS.map((facet, i) => [facet.key, i]),
);

// The facet a slug belongs to, or undefined for free-form subject tags.
export const facetForSlug = (slug: string): FacetKey | undefined =>
  SLUG_TO_FACET.get(slug);

// Code-defined zh label for a facet slug, or undefined for free-form tags.
export const zhForSlug = (slug: string): string | undefined =>
  SLUG_TO_ZH.get(slug);

// All valid slugs for one facet (feeds z.enum + membership checks).
export const slugsForFacet = (key: FacetKey): string[] =>
  TAG_FACETS.find(facet => facet.key === key)?.values.map(v => v.slug) ?? [];

// Display-order rank for a tag slug: facet rank, else subject (last). Stable
// so a photo's tags read genre → mood → color → tonality → light → subject.
export const tagDisplayRank = (slug: string): number => {
  const facet = SLUG_TO_FACET.get(slug);
  return facet !== undefined
    ? FACET_RANK.get(facet) ?? SUBJECT_FACET_RANK
    : SUBJECT_FACET_RANK;
};
