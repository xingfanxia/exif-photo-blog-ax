import { parseFormNumber, parseFormInt } from '@/photo/form';

describe('form numeric coercion (PLOG-12, NaN-safe)', () => {
  it('parses valid numbers', () => {
    expect(parseFormNumber('1.5')).toBe(1.5);
    expect(parseFormInt('42')).toBe(42);
    expect(parseFormInt('42.9')).toBe(42); // truncates to int
  });
  it('returns undefined for empty / absent (not 0)', () => {
    expect(parseFormNumber('')).toBeUndefined();
    expect(parseFormNumber(undefined)).toBeUndefined();
    expect(parseFormInt('')).toBeUndefined();
  });
  it('returns undefined (never NaN) for non-numeric input', () => {
    expect(parseFormNumber('abc')).toBeUndefined();
    expect(parseFormInt('xyz')).toBeUndefined();
    expect(parseFormNumber('NaN')).toBeUndefined();
    expect(parseFormNumber('12abc')).toBeUndefined();
  });
  it('rejects non-finite values', () => {
    expect(parseFormNumber('Infinity')).toBeUndefined();
    expect(parseFormNumber('-Infinity')).toBeUndefined();
  });
});
