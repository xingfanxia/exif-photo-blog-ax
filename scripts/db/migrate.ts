/**
 * Standalone migration runner — the predeploy / fresh-DB bootstrap entry
 * (PLOG-3). Applies the schema explicitly (ordered, idempotent) so the app
 * never has to JIT-create tables on a failed read.
 *
 * Run:
 *   npm run db:migrate            # loads .env.local automatically
 *
 * Or directly:
 *   node --env-file=.env.local \
 *     -r ts-node/register -r tsconfig-paths/register \
 *     scripts/db/migrate.ts
 *   (with TS_NODE_PROJECT=tsconfig.scripts.json)
 *
 * Alternative (post-deploy, in-app): authenticated POST to
 * /api/admin/migrate. Both call the same `runMigrations()`.
 */
import { runMigrations } from '@/db/migrate';

(async () => {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — load .env.local first.');
    process.exit(1);
  }
  try {
    console.log('Running migrations ...');
    const { applied, skipped } = await runMigrations();
    console.log('Migrations complete.');
    console.log(`  applied (${applied.length}):`, applied);
    console.log(`  skipped (${skipped.length}):`, skipped);
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
