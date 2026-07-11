import { parameterize } from '@/utility/string';
import { ParamBuilder } from '@/db/query';
import { PhotoSetCategory } from '@/category';
import { Camera } from '@/camera';
import { Lens } from '@/lens';
import { APP_DEFAULT_SORT_BY, SortBy } from '@/photo/sort';
import { Album } from '@/album';
import { getPathComponents } from '@/app/path';
import { getAlbumFromSlug } from '@/album/query';
import { isTagPrivate } from '@/tag';
import { getPhotoCount } from '@/photo/query';

export const GENERATE_STATIC_PARAMS_LIMIT = 1000;
export const PHOTO_DEFAULT_LIMIT = 100;

// These must mirror utility/string.ts parameterization
const CHARACTERS_TO_REMOVE = [',', '/'];
const CHARACTERS_TO_REPLACE = ['+', '&', '|', ':', '_', ' '];

// Raw normalization SQL, kept in lockstep with utility/string.ts parameterize.
// SQLite has no REGEXP_REPLACE, so the per-character regex classes unroll into
// nested REPLACE calls — same per-character semantics, and (unlike the old
// Postgres IMMUTABLE-function workaround) deterministic built-ins that SQLite
// accepts directly in expression indexes (TURSO-1). Generated from the SAME
// char arrays as the JS `parameterize`, so slug logic can't desync.
const normalizeSql = (value: string) => {
  let expression = `LOWER(TRIM(${value}))`;
  for (const c of CHARACTERS_TO_REMOVE) {
    expression = `REPLACE(${expression}, '${c}', '')`;
  }
  for (const c of CHARACTERS_TO_REPLACE) {
    expression = `REPLACE(${expression}, '${c}', '-')`;
  }
  return expression;
};

export const parameterizeForDb = (field: string) =>
  normalizeSql(field);

// Single source of truth for the full-text search expression. Searched with
// LOWER(…) LIKE against a lowercased pattern (SQLite has no ILIKE; its LIKE
// is only ASCII-case-insensitive, so the explicit LOWER keeps behavior
// obvious). At this catalog's scale a sequential scan is sub-millisecond —
// the old pg_trgm GIN index has no SQLite equivalent and isn't needed.
export const PHOTO_SEARCH_EXPRESSION =
  '(COALESCE(title, \'\') || \' \' || COALESCE(caption, \'\') || ' +
  '\' \' || COALESCE(semantic_description, \'\'))';

export type PhotoQueryOptions = {
  sortBy?: SortBy
  sortWithPriority?: boolean
  limit?: number
  offset?: number
  query?: string
  maximumAspectRatio?: number
  takenBefore?: Date
  takenAfterInclusive?: Date
  updatedBefore?: Date
  excludeFromFeeds?: boolean
  hidden?: 'exclude' | 'include' | 'only'
} & Omit<PhotoSetCategory, 'camera' | 'lens' | 'album'> & {
  camera?: Partial<Camera>
  lens?: Partial<Lens>
  album?: Album
  photoIds?: string[]
};

export const areOptionsSensitive = (options: PhotoQueryOptions) =>
  options.hidden === 'include' || options.hidden === 'only';

export const getJoinsFromOptions = (options: PhotoQueryOptions) =>
  options.album
    ? 'JOIN album_photo ap ON ap.photo_id = p.id'
    : undefined;

export const getWheresFromOptions = (
  options: PhotoQueryOptions,
  initialValuesIndex = 1,
) => {
  const {
    hidden = 'exclude',
    excludeFromFeeds,
    takenBefore,
    takenAfterInclusive,
    updatedBefore,
    query,
    maximumAspectRatio,
    recent,
    year,
    album,
    tag,
    camera,
    lens,
    film,
    recipe,
    focal,
    photoIds,
  } = options;

  const wheres = [] as string[];
  // PLOG-13: one ParamBuilder owns the $N sequence; `pb.add(v)` records the
  // value AND returns its placeholder, replacing the mutable valuesIndex +
  // parallel wheresValues hand-threading (the off-by-one source).
  const pb = new ParamBuilder(initialValuesIndex);

  switch (hidden) {
    case 'exclude':
      wheres.push('hidden IS NOT TRUE');
      break;
    case 'only':
      wheres.push('hidden IS TRUE');
      break;
  }

  if (excludeFromFeeds) {
    wheres.push('exclude_from_feeds IS NOT TRUE');
  }
  if (takenBefore) {
    wheres.push(`taken_at < ${pb.add(takenBefore.toISOString())}`);
  }
  if (takenAfterInclusive) {
    wheres.push(`taken_at >= ${pb.add(takenAfterInclusive.toISOString())}`);
  }
  if (updatedBefore) {
    wheres.push(`updated_at < ${pb.add(updatedBefore.toISOString())}`);
  }
  if (query) {
    wheres.push(
      `LOWER(${PHOTO_SEARCH_EXPRESSION}) LIKE ${pb.add(`%${query.toLocaleLowerCase()}%`)}`,
    );
  }
  if (maximumAspectRatio) {
    wheres.push(`aspect_ratio <= ${pb.add(maximumAspectRatio)}`);
  }
  if (recent) {
    // Timestamps are stored as ISO-8601 UTC text ('…T…Z'), so strftime with
    // the matching format yields lexicographically comparable strings.
    // Newest upload must be within past 2 weeks
    // eslint-disable-next-line max-len
    wheres.push('(SELECT MAX(created_at) FROM photos) >= strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\', \'-14 days\')');
    // Selects must be within 1 week of newest upload
    // eslint-disable-next-line max-len
    wheres.push('created_at >= (SELECT strftime(\'%Y-%m-%dT%H:%M:%fZ\', MAX(created_at), \'-7 days\') FROM photos)');
  }
  if (year) {
    // CASTs on both sides: strftime returns TEXT and SQLite comparisons are
    // type-strict, so an INTEGER (or TEXT) bound param must be normalized.
    // eslint-disable-next-line max-len
    wheres.push(`CAST(strftime('%Y', taken_at) AS INTEGER) = CAST(${pb.add(year)} AS INTEGER)`);
  }
  if (camera?.make) {
    wheres.push(`${parameterizeForDb('make')}=${pb.add(parameterize(camera.make))}`);
  }
  if (camera?.model) {
    wheres.push(`${parameterizeForDb('model')}=${pb.add(parameterize(camera.model))}`);
  }
  if (lens?.make) {
    wheres.push(`${parameterizeForDb('lens_make')}=${pb.add(parameterize(lens.make))}`);
  }
  if (lens?.model) {
    wheres.push(`${parameterizeForDb('lens_model')}=${pb.add(parameterize(lens.model))}`);
    // Ensure unique queries for lenses missing makes
    if (!lens.make) { wheres.push('lens_make IS NULL'); }
  }
  if (album) {
    wheres.push(`album_id=${pb.add(album.id)}`);
  }
  if (tag) {
    // Tags live as a JSON text array; membership via json_each. Seq scan —
    // fine at this catalog's scale (no GIN equivalent in SQLite).
    // eslint-disable-next-line max-len
    wheres.push(`EXISTS (SELECT 1 FROM json_each(COALESCE(tags, '[]')) WHERE json_each.value = ${pb.add(tag)})`);
  }
  if (film) {
    wheres.push(`film=${pb.add(film)}`);
  }
  if (recipe) {
    wheres.push(`recipe_title=${pb.add(recipe)}`);
  }
  if (focal) {
    wheres.push(`focal_length=${pb.add(focal)}`);
  }
  if (photoIds && photoIds.length > 0) {
    // eslint-disable-next-line max-len
    wheres.push(`id IN (SELECT value FROM json_each(${pb.add(JSON.stringify(photoIds))}))`);
  }

  return {
    wheres: wheres.length > 0
      ? `WHERE ${wheres.join(' AND ')}`
      : '',
    wheresValues: pb.values,
    lastValuesIndex: pb.nextIndex,
  };
};

export const getOrderByFromOptions = (options: PhotoQueryOptions) => {
  const {
    sortBy = APP_DEFAULT_SORT_BY,
    sortWithPriority,
  } = options;

  switch (sortBy) {
    case 'takenAt':
      return sortWithPriority
        ? 'ORDER BY priority_order ASC, taken_at DESC'
        : 'ORDER BY taken_at DESC';
    case 'takenAtAsc':
      return sortWithPriority
        ? 'ORDER BY priority_order ASC, taken_at ASC'
        : 'ORDER BY taken_at ASC';
    case 'createdAt':
      return sortWithPriority
        ? 'ORDER BY priority_order ASC, created_at DESC'
        : 'ORDER BY created_at DESC';
    case 'createdAtAsc':
      return sortWithPriority
        ? 'ORDER BY priority_order ASC, created_at ASC'
        : 'ORDER BY created_at ASC';
      // Add date sort to account for photos with same color sort
    case 'color':
      return sortWithPriority
        ? 'ORDER BY priority_order ASC, color_sort DESC, taken_at DESC'
        : 'ORDER BY color_sort DESC, taken_at DESC';
    case 'colorAsc':
      return sortWithPriority
        ? 'ORDER BY priority_order ASC, color_sort ASC, taken_at ASC'
        : 'ORDER BY color_sort ASC, taken_at ASC';
  }
};

export const getLimitAndOffsetFromOptions = (
  options: PhotoQueryOptions,
  initialValuesIndex = 1,
) => {
  const {
    limit = PHOTO_DEFAULT_LIMIT,
    offset = 0,
  } = options;

  let valuesIndex = initialValuesIndex;

  return {
    limitAndOffset: `LIMIT $${valuesIndex++} OFFSET $${valuesIndex++}`,
    limitAndOffsetValues: [limit, offset],
  };
};

// Arrays (formerly Postgres `varchar[]`) are stored as JSON text (TURSO-1).
export const convertArrayToJson = (array?: string[]) =>
  array ? JSON.stringify(array) : null;

export const generateManyToManyValues = (idsA: string[], idsB: string[]) => {
  const pairs: string[][] = [];

  for (const idA of idsA) {
    for (const idB of idsB) {
      pairs.push([idA, idB]);
    }
  }
  const valueString = 'VALUES ' + pairs.map((_, index) =>
    `($${index * 2 + 1},$${index * 2 + 2})`).join(',');

  const values = pairs.flat();
  
  return {
    valueString,
    values,
  };
};

export const getPhotoOptionsCountForPath = async (
  path: string,
): Promise<{ options: PhotoQueryOptions, count: number }> => {
  const { album: albumSlug, tag, ...components } = getPathComponents(path);

  let album: Album | undefined;
  if (albumSlug) {
    album = await getAlbumFromSlug(albumSlug);
  }

  const options: PhotoQueryOptions = {
    album,
    ...isTagPrivate(tag) ? { hidden: 'only' } : { tag },
    ...components,
  };

  const count = await getPhotoCount(options);

  return {
    options: {
      ...options,
      limit: count,
    },
    count,
  };
};
