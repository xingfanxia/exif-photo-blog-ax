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
