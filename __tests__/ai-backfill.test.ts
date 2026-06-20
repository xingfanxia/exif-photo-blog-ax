import { computeInputHash, shouldSkipBackfill } from '@/photo/ai/backfill';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('AI backfill idempotency (PLOG-10)', () => {
  it('is deterministic for the same input', () => {
    expect(computeInputHash(bytes('img'), 'v1', 'm1'))
      .toBe(computeInputHash(bytes('img'), 'v1', 'm1'));
  });
  it('changes when image / prompt-version / model changes', () => {
    const base = computeInputHash(bytes('img'), 'v1', 'm1');
    expect(computeInputHash(bytes('img2'), 'v1', 'm1')).not.toBe(base);
    expect(computeInputHash(bytes('img'), 'v2', 'm1')).not.toBe(base);
    expect(computeInputHash(bytes('img'), 'v1', 'm2')).not.toBe(base);
  });
  it('avoids the field-boundary collision (a|b vs ab)', () => {
    // Without the \0 separators these would collide.
    expect(computeInputHash(bytes('a'), 'b', 'm'))
      .not.toBe(computeInputHash(bytes('ab'), '', 'm'));
  });
  it('skips only when done AND the hash matches', () => {
    const h = computeInputHash(bytes('img'), 'v1', 'm1');
    expect(shouldSkipBackfill('done', h, h)).toBe(true);
    expect(shouldSkipBackfill('done', 'other', h)).toBe(false); // changed input
    expect(shouldSkipBackfill('pending', h, h)).toBe(false);
    expect(shouldSkipBackfill('failed', h, h)).toBe(false);
    expect(shouldSkipBackfill(null, null, h)).toBe(false);
  });
});
