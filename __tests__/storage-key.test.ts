import { StorageKeySchema } from '@/platforms/storage/key';

describe('StorageKeySchema (PLOG-12 presigned-url key validation)', () => {
  it('accepts valid flat storage keys', () => {
    expect(StorageKeySchema.safeParse('photo-abc123.jpg').success).toBe(true);
    expect(StorageKeySchema.safeParse('upload-xyz.png').success).toBe(true);
  });
  it('rejects path traversal', () => {
    expect(StorageKeySchema.safeParse('../secret.jpg').success).toBe(false);
    expect(StorageKeySchema.safeParse('a/../../b.jpg').success).toBe(false);
  });
  it('rejects unsafe characters and empties', () => {
    expect(StorageKeySchema.safeParse('').success).toBe(false);
    expect(StorageKeySchema.safeParse('photo abc.jpg').success).toBe(false);
    expect(StorageKeySchema.safeParse('photo;rm.jpg').success).toBe(false);
    expect(StorageKeySchema.safeParse('a'.repeat(257)).success).toBe(false);
  });
});
