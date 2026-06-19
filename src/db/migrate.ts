import { pool, query } from '@/platforms/postgres';
import { MIGRATIONS } from '@/db/migration';
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
//  - every MIGRATIONS[] entry is individually idempotent
//    (`ADD COLUMN IF NOT EXISTS` / guarded `DO` blocks / `DROP … IF EXISTS`);
//  - applied labels are recorded and skipped on subsequent runs.

const SCHEMA_MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    label TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

// Arbitrary stable key so two runner invocations (e.g. parallel deploy
// instances) can't both read an empty ledger and double-apply DDL. The lock
// is held on ONE dedicated client for the whole run; the migration DDL itself
// still uses the pooled helpers — safe because the lock serializes runners so
// only one proceeds at a time. NOTE: labels in `schema_migrations` are
// immutable identifiers — never edit a shipped MIGRATIONS[] label or it will
// re-run under a new identity.
const MIGRATION_ADVISORY_LOCK_KEY = 4_771_001;

export interface MigrationRunResult {
  applied: string[]; // labels applied this run
  skipped: string[]; // labels already applied (recorded in schema_migrations)
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
  // Hold a session-level advisory lock on a dedicated client for the whole
  // run so concurrent invocations serialize (see lock-key note above).
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [
      MIGRATION_ADVISORY_LOCK_KEY,
    ]);

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

    return { applied, skipped };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [
        MIGRATION_ADVISORY_LOCK_KEY,
      ]);
    } catch {
      // Lock is released on connection release regardless; ignore.
    }
    client.release();
  }
};
