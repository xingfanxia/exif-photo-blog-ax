// One-off pre-upload audit: which local files are already in the DB?
// Fingerprints each local image by EXIF DateTimeOriginal (+ camera model) and
// compares against existing photos' taken_at_naive (the wall-clock string), so
// batch:upload only adds the genuinely-new ones. Prints a NEW list (safe to
// upload) and a DUP list (already present, skip). Read-only; moves no files.
//
//   npm run batch:dedup -- <image-dir>
import { readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import exifr from 'exifr';
import { pool } from '@/platforms/postgres';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

// Match on the WALL-CLOCK string only — no timezone math. The DB stores
// taken_at_naive ("YYYY-MM-DD HH:MM:SS", camera local time); EXIF
// DateTimeOriginal is the same wall clock ("YYYY:MM:DD HH:MM:SS"). Normalise
// both to "YYYY-MM-DDTHH:MM:SS" + camera model so timezone never enters.
const wallKey = (raw?: string | null, model?: string | null) => {
  if (!raw) { return undefined; }
  const s = String(raw).trim()
    .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') // EXIF date sep → dashes
    .replace(' ', 'T')
    .slice(0, 19);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) { return undefined; }
  return `${s}|${(model ?? '').trim().toLowerCase()}`;
};

const main = async () => {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set — load .env.local first.');
    process.exit(1);
  }
  const dir = process.argv[2];
  if (!dir || !statSync(dir).isDirectory()) {
    console.error('usage: npm run batch:dedup -- <image-dir>');
    process.exit(1);
  }

  try {
    // 1. existing photos → wall-clock+model key set. Both sides normalise an
    // empty model to '', so an empty-model photo still matches via this map;
    // requiring model agreement biases an uncertain file toward NEW (the safe
    // direction for an advisory tool — a stray dup is visible in the NEW list,
    // a wrongly-skipped real photo is silent). CAVEAT: two distinct frames at
    // the same wall-clock second from the same camera model (bursts) collide —
    // spot-check the DUP list if the source has burst sequences.
    const { rows } = await pool.query<{
      id: string, taken_at_naive: string | null, model: string | null,
    }>('SELECT id, taken_at_naive, model FROM photos');
    const existing = new Map<string, string>(); // wall-clock+model -> photo id
    for (const r of rows) {
      const k = wallKey(r.taken_at_naive, r.model);
      if (k) { existing.set(k, r.id); }
    }
    console.log(`DB has ${rows.length} photos ` +
      `(${existing.size} with usable taken_at_naive)`);

    // 2. local files
    const files = readdirSync(dir)
      .filter(f => IMAGE_EXT.has(extname(f).toLowerCase()))
      .sort()
      .map(f => join(dir, f));

    const NEW: string[] = [];
    const DUP: { file: string, id: string }[] = [];
    const NOEXIF: string[] = [];

    for (const file of files) {
      let parsed: any;
      try {
        // reviveValues:false → raw EXIF strings ("2024:03:15 14:30:22"), no tz.
        parsed = await exifr.parse(file, {
          pick: ['DateTimeOriginal', 'CreateDate', 'Model'],
          reviveValues: false,
        });
      } catch {
        parsed = undefined;
      }
      const raw = parsed?.DateTimeOriginal ?? parsed?.CreateDate;
      const key = wallKey(raw, parsed?.Model);
      const dupId = key && existing.get(key);

      if (!raw) {
        NOEXIF.push(basename(file));
        NEW.push(basename(file)); // no wall-clock date → NEW (review)
      } else if (dupId) {
        DUP.push({ file: basename(file), id: dupId });
      } else {
        NEW.push(basename(file));
      }
    }

    console.log(`\n=== ALREADY IN DB (${DUP.length}) — will be SKIPPED ===`);
    for (const d of DUP) { console.log(`  dup  ${d.file}  (photo ${d.id})`); }
    console.log(`\n=== NEW (${NEW.length}) — safe to upload ===`);
    for (const f of NEW) { console.log(`  new  ${f}`); }
    if (NOEXIF.length) {
      console.log(`\n=== NO EXIF date (${NOEXIF.length}) — counted as NEW, ` +
        'verify manually ===');
      for (const f of NOEXIF) { console.log(`  ?    ${f}`); }
    }
    console.log(`\nSummary: ${DUP.length} dup, ${NEW.length} new, ` +
      `${rows.length} in DB.`);
  } finally {
    await pool.end().catch(() => {});
  }
};

main().catch(e => { console.error(e); process.exit(1); });
