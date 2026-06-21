/* eslint-disable no-console */
// Headless batch upload — mirrors the addUpload server flow (src/photo/
// actions.ts) for a local directory of images, with bilingual (en+zh) AI.
// Per file: putFile(original) → EXIF/blur/resized → bilingual AI →
// convertUploadToPhoto (sm/md/lg variants) → insertPhoto.
//
// Run:
//   npm run batch:upload -- <image-dir> [maxCount]
// e.g. npm run batch:upload -- ~/Pictures/Portofolio 3   # first 3 only
//
// ⚠️ NO DEDUP: this inserts EVERY image in <dir>. Pointed at a folder that
// overlaps the DB it duplicates those photos. First audit + stage only the
// NEW files (e.g. into a separate dir):
//   npm run batch:dedup -- <image-dir>   # lists NEW (safe) vs DUP (skip)
//
// ⚠️ CACHE: runs OUTSIDE Next, so it cannot revalidate. New photos do NOT
// appear on the public site until an admin clicks "Clear cache" (清除缓存)
// in the admin nav (/admin/insights). Then run `npm run backfill:color`.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { pool } from '@/platforms/postgres';
import { runMigrations } from '@/db/migrate';
import { putFile } from '@/platforms/storage';
import {
  extractImageDataFromBlobPath,
  convertFormDataToPhotoDbInsertAndLookupRecipeTitle,
} from '@/photo/server';
import { generateAiImageQueries } from '@/photo/ai/server';
import { getAiTextFieldsToGenerate } from '@/photo/ai';
import { convertUploadToPhoto } from '@/photo/storage/server';
import { getUniqueTags, insertPhoto } from '@/photo/query';
import { AI_TEXT_AUTO_GENERATED_FIELDS } from '@/app/config';
import { generateNanoid } from '@/utility/nanoid';
import { PhotoFormData } from '@/photo/form';
import { Tags } from '@/tag';

const CONCURRENCY = Number(process.env.BATCH_UPLOAD_CONCURRENCY ?? 3);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

const mapWithLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const processFile = async (filePath: string, uniqueTags: Tags) => {
  const ext = extname(filePath).slice(1).toLowerCase() || 'jpg';
  const buffer = readFileSync(filePath);

  // 1. upload the original so EXIF/AI/optimize steps have a fetchable URL
  const uploadUrl = await putFile(buffer, `upload-${generateNanoid()}.${ext}`);

  // 2. EXIF + blur + 200px base64 (the AI input)
  const {
    formDataFromExif,
    imageResizedBase64,
    shouldStripGpsData,
    fileBytes,
  } = await extractImageDataFromBlobPath(uploadUrl, {
    includeInitialPhotoFields: true,
    generateBlurData: true,
    generateResizedImage: true,
    // Color extraction fetches via the Next /_next/image optimizer, which is
    // unreliable from a standalone script (and redundant — we already have the
    // resized base64). Skip it; color_sort can be backfilled separately.
    updateColorFields: false,
  });
  if (!formDataFromExif) { throw new Error('no EXIF/form data extracted'); }

  // 3. bilingual AI (title/caption/tags/semantic + *_zh siblings)
  const ai = await generateAiImageQueries({
    imageBase64: imageResizedBase64,
    textFieldsToGenerate:
      getAiTextFieldsToGenerate(AI_TEXT_AUTO_GENERATED_FIELDS),
    uniqueTags,
    isBatch: true,
  });
  if (ai.error) { throw new Error(`AI: ${ai.error}`); }

  const nowIso = new Date().toISOString();
  const form: Partial<PhotoFormData> = {
    ...formDataFromExif,
    title: formDataFromExif.title || ai.title,
    caption: formDataFromExif.caption || ai.caption,
    tags: formDataFromExif.tags || ai.tags,
    semanticDescription: ai.semantic,
    // FORK: bilingual siblings
    titleZh: ai.titleZh,
    captionZh: ai.captionZh,
    tagsZh: ai.tagsZh,
    semanticDescriptionZh: ai.semanticZh,
    takenAt: formDataFromExif.takenAt || nowIso,
    takenAtNaive: formDataFromExif.takenAtNaive || nowIso.replace('Z', ''),
  };

  // 4. move upload → photo-<id> + generate sm/md/lg variants
  const updatedUrl = await convertUploadToPhoto({
    uploadUrl,
    fileBytes,
    shouldStripGpsData,
  });
  if (!updatedUrl) { throw new Error('convertUploadToPhoto returned no url'); }

  // 5. insert
  const photo = await convertFormDataToPhotoDbInsertAndLookupRecipeTitle(form);
  photo.url = updatedUrl;
  await insertPhoto(photo);
  return { id: photo.id, title: ai.title, titleZh: ai.titleZh };
};

const main = async () => {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — load .env.local first.');
    process.exit(1);
  }
  const dir = process.argv[2];
  if (!dir || !statSync(dir).isDirectory()) {
    console.error('usage: npm run batch:upload -- <image-dir> [maxCount]');
    process.exit(1);
  }
  const maxCount = process.argv[3] ? Number(process.argv[3]) : Infinity;

  const files = readdirSync(dir)
    .filter(f => IMAGE_EXT.has(extname(f).toLowerCase()))
    .sort()
    .slice(0, maxCount)
    .map(f => join(dir, f));

  console.log(
    `Found ${files.length} image(s) in ${dir} — concurrency ${CONCURRENCY}`,
  );

  try {
    await runMigrations(); // ensure the zh columns exist
    const uniqueTags = await getUniqueTags();
    let done = 0;
    const outcomes = await mapWithLimit(files, CONCURRENCY, async file => {
      try {
        const r = await processFile(file, uniqueTags);
        done += 1;
        console.log(
          `[${done}/${files.length}] ✓ ${basename(file)} → ` +
          `"${r.title}" / "${r.titleZh ?? '—'}"`,
        );
        return { file, ok: true as const };
      } catch (e: any) {
        done += 1;
        console.error(`[${done}/${files.length}] ✗ ${basename(file)}: ` +
          `${e.message}`);
        return { file, ok: false as const, error: e.message };
      }
    });
    const ok = outcomes.filter(o => o.ok).length;
    console.log(`\nDone: ${ok}/${files.length} inserted, ` +
      `${files.length - ok} failed.`);
  } finally {
    await pool.end().catch(() => {});
  }
};

main();
