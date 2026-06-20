import {
  normalizeAiResult,
  normalizeTags,
} from '@/photo/ai/normalizeAiResult';
import { AI_TAGS_MAX } from '@/photo/ai/prompts';

describe('normalizeAiResult / normalizeTags (PLOG-9 code-enforced invariants)', () => {
  it('lowercases + kebab-cases + dedupes CSV tags', () => {
    expect(normalizeTags('Golden Gate, golden gate, Fog'))
      .toEqual(['golden-gate', 'fog']);
  });
  it('accepts a tag array', () => {
    expect(normalizeTags(['Sunset', 'Pier'])).toEqual(['sunset', 'pier']);
  });
  it('drops generic deny-list tags', () => {
    expect(normalizeTags('nature, bridge, sky, travel')).toEqual(['bridge']);
  });
  it('caps at AI_TAGS_MAX', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`).join(',');
    expect(normalizeTags(many).length).toBe(AI_TAGS_MAX);
  });
  it('soft-merges existing tags without duplicating', () => {
    expect(normalizeTags('fog', ['fog', 'pier'])).toEqual(['fog', 'pier']);
  });
  it('strips markdown/quotes/trailing-period from text fields', () => {
    expect(normalizeAiResult({ title: '"**Hello**"', caption: 'A caption.' }))
      .toEqual({ title: 'Hello', caption: 'A caption' });
  });
  it('only includes fields that were provided', () => {
    expect(normalizeAiResult({ tags: 'fog' })).toEqual({ tags: ['fog'] });
  });
});

describe('normalizeAiResult bilingual (zh) siblings (FORK)', () => {
  it('forwards zh text fields cleaned, alongside en', () => {
    expect(normalizeAiResult({
      title: 'Sunset', title_zh: '"日落"', semantic_zh: '一张照片.',
    })).toEqual({ title: 'Sunset', title_zh: '日落', semantic_zh: '一张照片' });
  });
  it('keeps tags_zh index-aligned to tags when an en tag is dropped', () => {
    // 'sky' is deny-listed → dropped from en AND its zh partner (天空) drops too
    expect(normalizeAiResult({
      tags: 'fog, sky, pier',
      tags_zh: ['雾', '天空', '码头'],
    })).toEqual({ tags: ['fog', 'pier'], tags_zh: ['雾', '码头'] });
  });
  it('falls back to the en slug when a zh tag is missing', () => {
    expect(normalizeAiResult({
      tags: ['Golden Gate', 'fog'],
      tags_zh: ['金门'],
    })).toEqual({ tags: ['golden-gate', 'fog'], tags_zh: ['金门', 'fog'] });
  });
  it('omits tags_zh entirely when the model supplied none', () => {
    expect(normalizeAiResult({ tags: 'fog', title_zh: '雾' }))
      .toEqual({ tags: ['fog'], title_zh: '雾' });
  });
});
