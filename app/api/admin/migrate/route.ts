import { auth } from '@/auth/server';
import { runMigrations } from '@/db/migrate';
import { NextResponse } from 'next/server';

// Admin-gated migration runner endpoint (PLOG-3).
// POST to apply pending migrations explicitly (ordered, idempotent) instead of
// the removed JIT-DDL-from-read path. A standalone CLI/predeploy step can call
// `runMigrations()` directly; this route is the in-app, post-deploy entry.
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    );
  }
  try {
    const result = await runMigrations();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Migration failed';
    console.error(`Migration runner error: ${message}`, { error: e });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
