/**
 * Standalone batch AI-backfill worker (PLOG-10). Re-derives AI metadata
 * (title/caption/tags/semantic) for the photo library, idempotently:
 *
 *   - input_hash = sha256(image bytes + prompt version + model)
 *   - skip any photo already `metadata_status='done'` whose hash matches
 *   - annotate-and-continue: a per-photo failure marks `failed` and moves on
 *
 * A second run over an unchanged library is a no-op. Runs OUTSIDE Next (no
 * 60s / 4.5MB route caps). Reuses the same `generateAiImageQueries` /
 * `normalizeAiResult` stack as live upload — one impl, not two.
 *
 * Run:  npm run ai:backfill            (loads .env.local)
 *
 * NOTE: this uses the real-time per-photo path with a small concurrency limit.
 * The provider Batch API (50% off) is a future spend optimization; the
 * idempotency contract above is what makes either path safe to re-run.
 */
import { pool, query } from '@/platforms/postgres';
import { convertArrayToPostgresString } from '@/db';
import { runMigrations } from '@/db/migrate';
import { computeInputHash, shouldSkipBackfill } from '@/photo/ai/backfill';
import { generateAiImageQueries } from '@/photo/ai/server';
import { getAiTextFieldsToGenerate } from '@/photo/ai';
import { getImageBase64FromUrl } from '@/photo/server';
import { getOptimizedPhotoUrlForManipulation } from '@/photo/storage';
import { getUniqueTags } from '@/photo/query';
import { AI_TEXT_AUTO_GENERATED_FIELDS, IS_PREVIEW } from '@/app/config';

// PLOG-15: bumped from 'v1' (free-form tags) → faceted controlled vocabulary.
// The version is hashed into input_hash, so the bump re-tags every photo on the
// next run; a second run is still a no-op.
const PROMPT_VERSION = process.env.AI_PROMPT_VERSION ?? 'v2-facets';
const MODEL_ID =
  process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? 'unknown';
const CONCURRENCY = Number(process.env.AI_BACKFILL_CONCURRENCY ?? 5);

interface PhotoBackfillRow {
  id: string;
  url: string;
  metadata_status: string | null;
  input_hash: string | null;
}

// Tiny inline concurrency limiter (avoids a p-limit dependency).
const mapWithLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

const backfillPhoto = async (
  row: PhotoBackfillRow,
  uniqueTags: Awaited<ReturnType<typeof getUniqueTags>>,
): Promise<'skipped' | 'done' | 'failed'> => {
  try {
    const imageBase64 = await getImageBase64FromUrl(
      getOptimizedPhotoUrlForManipulation(row.url, IS_PREVIEW),
    );
    if (!imageBase64) { throw new Error('Could not load image'); }

    const inputHash = computeInputHash(
      Buffer.from(imageBase64, 'base64'),
      PROMPT_VERSION,
      MODEL_ID,
    );
    if (shouldSkipBackfill(
      row.metadata_status as 'done' | null,
      row.input_hash,
      inputHash,
    )) {
      return 'skipped';
    }

    const ai = await generateAiImageQueries({
      imageBase64,
      textFieldsToGenerate: getAiTextFieldsToGenerate(
        AI_TEXT_AUTO_GENERATED_FIELDS,
      ),
      uniqueTags,
      isBatch: true,
    });
    if (ai.error) { throw new Error(ai.error); }

    // PLOG-15: persist the bilingual `_zh` siblings too (the worker dropped them
    // before the bilingual era). CSV → Postgres array literal via the shared
    // helper the photo insert uses (the typed `query` wrapper takes primitives).
    const toPgArray = (csv?: string): string | null =>
      csv
        ? convertArrayToPostgresString(
          csv.split(',').map(s => s.trim()).filter(Boolean),
        )
        : null;
    await query(
      `UPDATE photos SET
         title = COALESCE($2, title),
         caption = COALESCE($3, caption),
         tags = COALESCE($4, tags),
         semantic_description = COALESCE($5, semantic_description),
         title_zh = COALESCE($6, title_zh),
         caption_zh = COALESCE($7, caption_zh),
         semantic_description_zh = COALESCE($8, semantic_description_zh),
         tags_zh = COALESCE($9, tags_zh),
         metadata_status = 'done',
         input_hash = $10,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        row.id,
        ai.title ?? null,
        ai.caption ?? null,
        toPgArray(ai.tags),
        ai.semantic ?? null,
        ai.titleZh ?? null,
        ai.captionZh ?? null,
        ai.semanticZh ?? null,
        toPgArray(ai.tagsZh),
        inputHash,
      ],
    );
    return 'done';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Backfill failed for ${row.id}: ${message}`);
    await query(
      `UPDATE photos SET metadata_status = 'failed' WHERE id = $1`,
      [row.id],
    ).catch(() => {});
    return 'failed';
  }
};

(async () => {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — load .env.local first.');
    process.exit(1);
  }
  try {
    await runMigrations(); // ensure metadata_status / input_hash columns exist
    const { rows } = await query<PhotoBackfillRow>(
      `SELECT id, url, metadata_status, input_hash FROM photos`,
    );
    if (rows.length === 0) {
      console.log('No photos to backfill (empty library).');
      process.exit(0);
    }
    const uniqueTags = await getUniqueTags();
    const outcomes = await mapWithLimit(rows, CONCURRENCY, r =>
      backfillPhoto(r, uniqueTags));
    const tally = outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o] = (acc[o] ?? 0) + 1; return acc;
    }, {});
    console.log('Backfill complete:', tally);
    process.exit(0);
  } catch (e) {
    console.error('Backfill worker failed:', e);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
