import { query } from '@/platforms/db';
import { MIGRATIONS } from '@/db/migration';
import { PHOTO_INDEXES } from '@/db/indexes';
import { createPhotosTable } from '@/photo/query';
import { createAlbumsTable, createAlbumPhotoTable } from '@/album/query';
import { createAboutTable } from '@/about/query';

// Explicit, ordered, idempotent migration runner (PLOG-3).
//
// Replaces the JIT-DDL-from-read-errors path that used to live inside
// `safelyQuery`: migrations no longer run as a side-effect of a failed read.
// `schema_migrations` is the applied-label ledger so a second run is a no-op.
//
// Safe to run repeatedly:
//  - base-table DDL is `CREATE TABLE IF NOT EXISTS`;
//  - every MIGRATIONS[] entry must be individually idempotent;
//  - applied labels are recorded and skipped on subsequent runs.
//
// Concurrency (TURSO-1): the Postgres advisory lock is gone — SQLite/libSQL
// serializes writers at the database level, and every step is idempotent, so
// two racing runners converge on the same end state.

const SCHEMA_MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    label TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`;

export interface MigrationRunResult {
  applied: string[]; // labels applied this run
  skipped: string[]; // labels already applied (recorded in schema_migrations)
  indexes: string[]; // index names ensured (PLOG-4)
}

// Order matters for FK dependencies: photos first; album_photo FKs both
// photos and albums; about FKs photos. So photos → albums → album_photo →
// about all resolve.
export const ensureBaseTables = async (): Promise<void> => {
  await createPhotosTable();
  await createAlbumsTable();
  await createAlbumPhotoTable();
  await createAboutTable();
};

export const runMigrations = async (): Promise<MigrationRunResult> => {
  await ensureBaseTables();
  await query(SCHEMA_MIGRATIONS_TABLE_DDL);

  const { rows } = await query<{ label: string }>(
    'SELECT label FROM schema_migrations ORDER BY label',
  );
  const alreadyApplied = new Set(rows.map(({ label }) => label));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of MIGRATIONS) {
    if (alreadyApplied.has(migration.label)) {
      skipped.push(migration.label);
      continue;
    }
    console.log(`Applying migration ${migration.label} ...`);
    await migration.run();
    await query(
      `INSERT INTO schema_migrations (label) VALUES ($1)
       ON CONFLICT (label) DO NOTHING`,
      [migration.label],
    );
    applied.push(migration.label);
  }

  // Indexes (PLOG-4): applied after columns exist; all idempotent. Each index
  // is isolated so one failure can't prevent the rest being created, but any
  // failure still surfaces loudly via an aggregate throw.
  const indexFailures: string[] = [];
  for (const idx of PHOTO_INDEXES) {
    try {
      await query(idx.ddl);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Index ${idx.name} failed: ${message}`, { error: e });
      indexFailures.push(`${idx.name}: ${message}`);
    }
  }
  if (indexFailures.length > 0) {
    throw new Error(
      `Index creation failed for ${indexFailures.length} index(es): ` +
      indexFailures.join('; '),
    );
  }

  return { applied, skipped, indexes: PHOTO_INDEXES.map(i => i.name) };
};
