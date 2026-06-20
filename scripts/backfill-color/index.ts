/* eslint-disable no-console */
// Backfill color_data / color_sort for photos missing it (e.g. uploaded by the
// batch worker, which skipped color). Now that color extraction fetches the
// image directly (no /_next/image), this works headless.
//   npm run backfill:color
import { pool } from '@/platforms/postgres';
import { getColorFieldsForPhotoDbInsert } from '@/photo/color/server';

const CONCURRENCY = Number(process.env.BACKFILL_COLOR_CONCURRENCY ?? 4);

const mapWithLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i]);
      }
    },
  ));
  return results;
};

const main = async () => {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — load .env.local first.');
    process.exit(1);
  }
  const { rows } = await pool.query<{ id: string; url: string }>(
    'SELECT id, url FROM photos WHERE color_sort IS NULL',
  );
  console.log(`Backfilling color for ${rows.length} photo(s) ` +
    `(concurrency ${CONCURRENCY})`);
  let ok = 0;
  let done = 0;
  await mapWithLimit(rows, CONCURRENCY, async ({ id, url }) => {
    try {
      const fields = await getColorFieldsForPhotoDbInsert(url, undefined, true);
      done += 1;
      if (fields?.colorData !== undefined && fields?.colorSort !== undefined) {
        await pool.query(
          'UPDATE photos SET color_data=$1, color_sort=$2 WHERE id=$3',
          [fields.colorData, fields.colorSort, id],
        );
        ok += 1;
        console.log(`[${done}/${rows.length}] ✓ ${id} ` +
          `(sort ${fields.colorSort})`);
      } else {
        console.log(`[${done}/${rows.length}] ✗ ${id}: no color fields`);
      }
    } catch (e: any) {
      done += 1;
      console.error(`[${done}/${rows.length}] ✗ ${id}: ${e.message}`);
    }
  });
  console.log(`\nDone: ${ok}/${rows.length} updated.`);
  await pool.end().catch(() => {});
};

main();
