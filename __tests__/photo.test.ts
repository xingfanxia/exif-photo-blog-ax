import { descriptionForPhoto, parsePhotoFromDb, Photo } from '@/photo';

// Minimal raw pg row (snake_case) — parsePhotoFromDb camelCases then validates.
const rawRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'abc12345',
  url: 'https://photos.xiax.xyz/photo-x.jpg',
  extension: 'jpg',
  aspect_ratio: 1.5,
  taken_at: new Date('2025-01-01T12:00:00Z'),
  taken_at_naive: '2025-01-01 12:00:00',
  updated_at: new Date('2025-01-01T12:00:00Z'),
  created_at: new Date('2025-01-01T12:00:00Z'),
  tags: ['a', 'b'],
  ...overrides,
});

describe('parsePhotoFromDb (PLOG-11 typed boundary)', () => {
  it('parses a valid row', () => {
    const photo = parsePhotoFromDb(rawRow() as any);
    expect(photo.id).toBe('abc12345');
    expect(photo.tags).toEqual(['a', 'b']);
  });
  it('coerces null tags to an empty array', () => {
    const photo = parsePhotoFromDb(rawRow({ tags: null }) as any);
    expect(photo.tags).toEqual([]);
  });
  it('parses legacy string-encoded recipeData JSON', () => {
    const photo = parsePhotoFromDb(
      rawRow({ recipe_data: '{"foo":"bar"}' }) as any,
    );
    expect(photo.recipeData).toEqual({ foo: 'bar' });
  });
  it('throws loudly on malformed colorData (scalar)', () => {
    expect(() => parsePhotoFromDb(rawRow({ color_data: 123 }) as any))
      .toThrow();
  });
  it('throws a field-named error on a missing required column', () => {
    const { url, ...withoutUrl } = rawRow();
    expect(() => parsePhotoFromDb(withoutUrl as any)).toThrow(/url/);
  });
});

const PHOTO: Partial<Photo> = {
  takenAt: new Date('2025-01-01 12:00:00'),
};

const PHOTO_SEMANTIC: Partial<Photo> = {
  ...PHOTO,
  semanticDescription: 'Semantic Description',
};

const PHOTO_CAPTION: Partial<Photo> = {
  ...PHOTO_SEMANTIC,
  caption: 'Caption',
};

describe('Should generate photo description', () => {
  it('with caption', () => {
    expect(descriptionForPhoto(PHOTO_CAPTION as Photo))
      .toBe('Caption');
  });
  it('with semantic description (disabled)', () => {
    expect(descriptionForPhoto(PHOTO_SEMANTIC as Photo))
      .toBe('01 JAN 2025 12:00PM');
  });
  it('with semantic description (enabled)', () => {
    expect(descriptionForPhoto(PHOTO_SEMANTIC as Photo, true))
      .toBe('Semantic Description');
  });
  it('with date', () => {
    expect(descriptionForPhoto(PHOTO as Photo))
      .toBe('01 JAN 2025 12:00PM');
  });
});
