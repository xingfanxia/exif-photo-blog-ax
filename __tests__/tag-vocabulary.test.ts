import {
  TAG_FACETS,
  facetForSlug,
  zhForSlug,
  slugsForFacet,
  tagDisplayRank,
} from '@/photo/ai/tagVocabulary';
import { facetsToTags } from '@/photo/ai/normalizeAiResult';
import { getAiImageQuerySchema } from '@/photo/ai';

describe('tagVocabulary (PLOG-15 controlled facet vocabulary)', () => {
  it('has globally-unique slugs across all facets', () => {
    const all = TAG_FACETS.flatMap(f => f.values.map(v => v.slug));
    expect(new Set(all).size).toBe(all.length);
  });
  it('gives every value a non-empty zh label', () => {
    TAG_FACETS.forEach(f =>
      f.values.forEach(v => expect(v.zh.length).toBeGreaterThan(0)));
  });
  // Locks the invariant the `slugsForFacet(key) as [string, ...string[]]` cast
  // in getAiImageQuerySchema depends on: z.enum([]) throws at schema build.
  it('gives every facet at least one value', () => {
    TAG_FACETS.forEach(f => expect(f.values.length).toBeGreaterThan(0));
  });
  it('maps slug → facet, undefined for unknown', () => {
    expect(facetForSlug('street')).toBe('genre');
    expect(facetForSlug('warm')).toBe('color');
    expect(facetForSlug('not-a-facet')).toBeUndefined();
  });
  it('returns the vocabulary zh label for a slug', () => {
    expect(zhForSlug('serene')).toBe('宁静');
    expect(zhForSlug('unknown')).toBeUndefined();
  });
  it('lists a facet\'s slugs', () => {
    expect(slugsForFacet('tonality')).toContain('high-key');
    expect(slugsForFacet('genre')).toContain('street');
  });
  it('ranks facets before subject tags, genre before mood', () => {
    expect(tagDisplayRank('portrait')).toBeLessThan(tagDisplayRank('serene'));
    expect(tagDisplayRank('street'))
      .toBeLessThan(tagDisplayRank('free-subject'));
  });
});

describe('facetsToTags (PLOG-15 collapse)', () => {
  it('collapses facets in order with vocabulary zh', () => {
    expect(facetsToTags({
      genre: 'street', mood: 'serene', color: 'warm',
      tonality: 'high-contrast', light: 'golden-hour',
    })).toEqual({
      tags: ['street', 'serene', 'warm', 'high-contrast', 'golden-hour'],
      tagsZh: ['街拍', '宁静', '暖色', '高反差', '黄金时刻'],
    });
  });
  it('skips a null light facet', () => {
    expect(facetsToTags({
      genre: 'portrait', mood: 'intimate', color: 'muted',
      tonality: 'low-key', light: null,
    }).tags).toEqual(['portrait', 'intimate', 'muted', 'low-key']);
  });
  it('keeps facet tags the free-form deny-list bans (architecture)', () => {
    expect(facetsToTags({
      genre: 'architecture', mood: 'solemn', color: 'neutral',
      tonality: 'balanced',
    }).tags).toContain('architecture');
  });
  it('appends hygiene-checked subjects with aligned zh', () => {
    expect(facetsToTags({
      genre: 'street', mood: 'serene', color: 'warm', tonality: 'balanced',
      subject: ['Red Bicycle', 'neon sign'],
      subject_zh: ['红色自行车', '霓虹灯'],
    })).toEqual({
      tags: [
        'street', 'serene', 'warm', 'balanced', 'red-bicycle', 'neon-sign',
      ],
      tagsZh: ['街拍', '宁静', '暖色', '均衡', '红色自行车', '霓虹灯'],
    });
  });
  it('drops deny-listed subjects + falls zh back to the slug', () => {
    expect(facetsToTags({
      genre: 'street', mood: 'serene', color: 'warm', tonality: 'balanced',
      subject: ['nature', 'pier'], // 'nature' deny-listed
      subject_zh: ['自然', ''],     // pier zh missing → slug fallback
    })).toEqual({
      tags: ['street', 'serene', 'warm', 'balanced', 'pier'],
      tagsZh: ['街拍', '宁静', '暖色', '均衡', 'pier'],
    });
  });
  it('ignores facet values outside the vocabulary', () => {
    expect(facetsToTags({
      genre: 'not-real', mood: 'serene', color: 'warm', tonality: 'balanced',
    }).tags).toEqual(['serene', 'warm', 'balanced']);
  });
  it('dedupes a subject that repeats a facet slug', () => {
    expect(facetsToTags({
      genre: 'street', mood: 'serene', color: 'warm', tonality: 'balanced',
      subject: ['street'],
    }).tags).toEqual(['street', 'serene', 'warm', 'balanced']);
  });
});

describe('getAiImageQuerySchema facet schema (PLOG-15)', () => {
  it('validates a well-formed facet classification', () => {
    const { schema } = getAiImageQuerySchema(['tags']);
    const parsed = schema.parse({
      genre: 'street', mood: 'serene', color: 'warm', tonality: 'balanced',
      light: null, subject: ['pier'], subject_zh: ['码头'],
    }) as { genre: string };
    expect(parsed.genre).toBe('street');
  });
  it('rejects an out-of-vocabulary genre', () => {
    const { schema } = getAiImageQuerySchema(['tags']);
    expect(() => schema.parse({
      genre: 'not-a-genre', mood: 'serene', color: 'warm',
      tonality: 'balanced', light: null, subject: [], subject_zh: null,
    })).toThrow();
  });
  it('accepts a null light facet', () => {
    const { schema } = getAiImageQuerySchema(['tags']);
    expect(() => schema.parse({
      genre: 'portrait', mood: 'intimate', color: 'muted',
      tonality: 'low-key', light: null, subject: [], subject_zh: null,
    })).not.toThrow();
  });
});
