import { query, sql } from '@/platforms/db';

interface Migration {
  label: string
  table?: 'photos' | 'albums'
  fields: string[]
  run: () => ReturnType<typeof sql> | ReturnType<typeof query>
}

// TURSO-1 (2026-07-11): the Turso (libSQL) database was created FRESH from the
// full current schema — `createPhotosTable` et al. fold in every column the
// historical Postgres migrations 01–12 used to add — so the ledger starts
// empty. Future schema changes append entries here exactly as before (each
// individually idempotent, SQLite dialect: `ALTER TABLE … ADD COLUMN` — note
// SQLite has no `ADD COLUMN IF NOT EXISTS`; the schema_migrations ledger is
// what makes re-runs safe). Labels are immutable identifiers — never edit a
// shipped label or it will re-run under a new identity.
export const MIGRATIONS: Migration[] = [];
