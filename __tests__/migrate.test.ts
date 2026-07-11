/* eslint-disable max-len */
import { runMigrations } from '@/db/migrate';
import { query } from '@/platforms/db';
import { MIGRATIONS } from '@/db/migration';
import { createPhotosTable } from '@/photo/query';
import { createAlbumsTable, createAlbumPhotoTable } from '@/album/query';
import { createAboutTable } from '@/about/query';

jest.mock('@/platforms/db', () => ({
  query: jest.fn(),
}));
jest.mock('@/photo/query', () => ({ createPhotosTable: jest.fn() }));
jest.mock('@/album/query', () => ({
  createAlbumsTable: jest.fn(),
  createAlbumPhotoTable: jest.fn(),
}));
jest.mock('@/about/query', () => ({ createAboutTable: jest.fn() }));
jest.mock('@/db/migration', () => ({
  MIGRATIONS: [
    { label: '01: A', fields: [], run: jest.fn() },
    { label: '02: B', fields: [], run: jest.fn() },
    { label: '03: C', fields: [], run: jest.fn() },
  ],
}));

const mockQuery = query as jest.Mock;

// `query` is called for: the CREATE TABLE schema_migrations DDL, the SELECT of
// applied labels, and an INSERT per applied migration. Only the SELECT must
// return rows; everything else returns an empty result.
const wireQuery = (appliedLabels: string[]) => {
  mockQuery.mockImplementation((text: string) => {
    if (/SELECT label FROM schema_migrations/i.test(text)) {
      return Promise.resolve({ rows: appliedLabels.map(label => ({ label })) });
    }
    return Promise.resolve({ rows: [] });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runMigrations (PLOG-3 ordered idempotent runner)', () => {
  it('ensures base tables in FK-safe order before migrating', async () => {
    wireQuery([]);
    await runMigrations();
    expect(createPhotosTable).toHaveBeenCalledTimes(1);
    expect(createAlbumsTable).toHaveBeenCalledTimes(1);
    expect(createAlbumPhotoTable).toHaveBeenCalledTimes(1);
    expect(createAboutTable).toHaveBeenCalledTimes(1);
    // photos must precede album_photo (which FKs it)
    const photosOrder = (createPhotosTable as jest.Mock).mock.invocationCallOrder[0];
    const albumPhotoOrder = (createAlbumPhotoTable as jest.Mock).mock.invocationCallOrder[0];
    expect(photosOrder).toBeLessThan(albumPhotoOrder);
  });

  it('applies all pending migrations in order on a fresh DB', async () => {
    wireQuery([]);
    const result = await runMigrations();
    expect(result.applied).toEqual(['01: A', '02: B', '03: C']);
    expect(result.skipped).toEqual([]);
    for (const m of MIGRATIONS) {
      expect(m.run).toHaveBeenCalledTimes(1);
    }
    // each applied label is recorded via an ON CONFLICT-guarded INSERT
    const inserts = mockQuery.mock.calls.filter(([t]) =>
      /INSERT INTO schema_migrations/i.test(t));
    expect(inserts).toHaveLength(3);
    expect(inserts.map(([, params]) => params?.[0]))
      .toEqual(['01: A', '02: B', '03: C']);
  });

  it('is a no-op when all migrations are already recorded (idempotent)', async () => {
    wireQuery(['01: A', '02: B', '03: C']);
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual(['01: A', '02: B', '03: C']);
    for (const m of MIGRATIONS) {
      expect(m.run).not.toHaveBeenCalled();
    }
    const inserts = mockQuery.mock.calls.filter(([t]) =>
      /INSERT INTO schema_migrations/i.test(t));
    expect(inserts).toHaveLength(0);
  });

  it('ensures all indexes after migrating (PLOG-4, SQLite dialect)',
    async () => {
      wireQuery([]);
      const result = await runMigrations();
      expect(result.indexes.length).toBeGreaterThanOrEqual(12);
      const ran = (re: RegExp) =>
        mockQuery.mock.calls.some(([t]) => re.test(t));
      // expression index inlines the normalization (nested REPLACE over
      // LOWER(TRIM(…))) — no Postgres IMMUTABLE function wrapper anymore
      expect(ran(/idx_photos_make_param.*REPLACE\(.*LOWER\(TRIM\(make\)\)/is))
        .toBe(true);
      // partial feed index bakes in the hidden predicate
      expect(ran(/idx_photos_feed_taken_at.*WHERE hidden IS NOT TRUE/is))
        .toBe(true);
      // Postgres-only DDL must be gone
      expect(ran(/pg_trgm|USING GIN|photo_normalize_field/i)).toBe(false);
    });

  it('throws loudly (aggregate) if any index fails, after attempting all',
    async () => {
      wireQuery([]);
      // Fail one index DDL; the loop must still attempt the rest then throw.
      mockQuery.mockImplementation((text: string) => {
        if (/SELECT label FROM schema_migrations/i.test(text)) {
          return Promise.resolve({ rows: [] });
        }
        if (/idx_photos_feed_taken_at/i.test(text)) {
          return Promise.reject(new Error('boom-feed'));
        }
        return Promise.resolve({ rows: [] });
      });
      await expect(runMigrations()).rejects.toThrow(/Index creation failed/i);
      // later indexes were still attempted despite the earlier failure
      expect(mockQuery.mock.calls.some(([t]) =>
        /idx_photos_lens_model_param/i.test(t))).toBe(true);
    });

  it('applies only the unrecorded migrations (partial state)', async () => {
    wireQuery(['01: A']);
    const result = await runMigrations();
    expect(result.applied).toEqual(['02: B', '03: C']);
    expect(result.skipped).toEqual(['01: A']);
    expect(MIGRATIONS[0].run).not.toHaveBeenCalled();
    expect(MIGRATIONS[1].run).toHaveBeenCalledTimes(1);
    expect(MIGRATIONS[2].run).toHaveBeenCalledTimes(1);
  });
});
