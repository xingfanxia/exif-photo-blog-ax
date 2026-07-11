/* eslint-disable quotes */
import {
  sql,
  query,
} from '@/platforms/db';
import { convertArrayToJson } from '@/db';
import {
  PhotoDb,
  PhotoDbInsert,
  translatePhotoId,
  parsePhotoFromDb,
  Photo,
  PhotoDateRangePostgres,
} from '@/photo';
import { Cameras, createCameraKey } from '@/camera';
import { Tags } from '@/tag';
import { Films } from '@/film';
import {
  AI_TEXT_AUTO_GENERATED_FIELDS,
  AI_CONTENT_GENERATION_ENABLED,
  COLOR_SORT_ENABLED,
} from '@/app/config';
import {
  PhotoQueryOptions,
  getOrderByFromOptions,
  getLimitAndOffsetFromOptions,
  getWheresFromOptions,
  getJoinsFromOptions,
} from '../db';
import { FocalLengths } from '@/focal';
import { Lenses, createLensKey } from '@/lens';
import {
  UPDATE_QUERY_LIMIT,
  OUTDATED_UPDATE_AT_THRESHOLD,
} from '@/photo/update';
import { Recipes } from '@/recipe';
import { Years } from '@/year';
import { PhotoColorData } from '@/photo/color/client';
import { safelyQuery, ParamBuilder } from '@/db/query';

// SQLite/libSQL schema (TURSO-1). This is the FULL current schema: the Turso
// DB was created fresh from it, so the historical Postgres MIGRATIONS[] are
// folded in (lens/recipe/film/color/zh columns, AI-backfill idempotency) and
// the ledger starts empty. Storage conventions:
//  - timestamps: ISO-8601 UTC text ('…T…Z'), revived to Date by @/platforms/db
//  - arrays (tags, tags_zh) and JSONB (recipe_data, color_data): JSON text
//  - booleans: 0/1 integers
export const createPhotosTable = () =>
  sql`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      extension TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      aspect_ratio REAL DEFAULT 1.5,
      blur_data TEXT,
      title TEXT,
      title_zh TEXT,
      caption TEXT,
      caption_zh TEXT,
      semantic_description TEXT,
      semantic_description_zh TEXT,
      tags TEXT,
      tags_zh TEXT,
      make TEXT,
      model TEXT,
      focal_length INTEGER,
      focal_length_in_35mm_format INTEGER,
      lens_make TEXT,
      lens_model TEXT,
      f_number REAL,
      iso INTEGER,
      exposure_time REAL,
      exposure_compensation REAL,
      location_name TEXT,
      latitude REAL,
      longitude REAL,
      film TEXT,
      recipe_title TEXT,
      recipe_data TEXT,
      color_data TEXT,
      color_sort INTEGER,
      priority_order REAL,
      metadata_status TEXT,
      input_hash TEXT,
      taken_at TEXT NOT NULL,
      taken_at_naive TEXT NOT NULL,
      exclude_from_feeds INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `;

// Must provide id as 8-character nanoid
export const insertPhoto = (photo: PhotoDbInsert) =>
  safelyQuery(() => sql`
    INSERT INTO photos (
      id,
      url,
      extension,
      width,
      height,
      aspect_ratio,
      blur_data,
      title,
      title_zh,
      caption,
      caption_zh,
      semantic_description,
      semantic_description_zh,
      tags,
      tags_zh,
      make,
      model,
      focal_length,
      focal_length_in_35mm_format,
      lens_make,
      lens_model,
      f_number,
      iso,
      exposure_time,
      exposure_compensation,
      location_name,
      latitude,
      longitude,
      film,
      recipe_title,
      recipe_data,
      color_data,
      color_sort,
      priority_order,
      exclude_from_feeds,
      hidden,
      taken_at,
      taken_at_naive
    ) VALUES (
      ${photo.id},
      ${photo.url},
      ${photo.extension},
      ${photo.width},
      ${photo.height},
      ${photo.aspectRatio},
      ${photo.blurData},
      ${photo.title},
      ${photo.titleZh},
      ${photo.caption},
      ${photo.captionZh},
      ${photo.semanticDescription},
      ${photo.semanticDescriptionZh},
      ${convertArrayToJson(photo.tags)},
      ${convertArrayToJson(photo.tagsZh)},
      ${photo.make},
      ${photo.model},
      ${photo.focalLength},
      ${photo.focalLengthIn35MmFormat},
      ${photo.lensMake},
      ${photo.lensModel},
      ${photo.fNumber},
      ${photo.iso},
      ${photo.exposureTime},
      ${photo.exposureCompensation},
      ${photo.locationName},
      ${photo.latitude},
      ${photo.longitude},
      ${photo.film},
      ${photo.recipeTitle},
      ${photo.recipeData},
      ${photo.colorData},
      ${photo.colorSort},
      ${photo.priorityOrder},
      ${photo.excludeFromFeeds},
      ${photo.hidden},
      ${photo.takenAt},
      ${photo.takenAtNaive}
    )
  `, 'insertPhoto');

export const updatePhoto = (photo: PhotoDbInsert) =>
  safelyQuery(() => sql`
    UPDATE photos SET
      url=${photo.url},
      extension=${photo.extension},
      width=${photo.width},
      height=${photo.height},
      aspect_ratio=${photo.aspectRatio},
      blur_data=${photo.blurData},
      title=${photo.title},
      title_zh=${photo.titleZh},
      caption=${photo.caption},
      caption_zh=${photo.captionZh},
      semantic_description=${photo.semanticDescription},
      semantic_description_zh=${photo.semanticDescriptionZh},
      tags=${convertArrayToJson(photo.tags)},
      tags_zh=${convertArrayToJson(photo.tagsZh)},
      make=${photo.make},
      model=${photo.model},
      focal_length=${photo.focalLength},
      focal_length_in_35mm_format=${photo.focalLengthIn35MmFormat},
      lens_make=${photo.lensMake},
      lens_model=${photo.lensModel},
      f_number=${photo.fNumber},
      iso=${photo.iso},
      exposure_time=${photo.exposureTime},
      exposure_compensation=${photo.exposureCompensation},
      location_name=${photo.locationName},
      latitude=${photo.latitude},
      longitude=${photo.longitude},
      film=${photo.film},
      recipe_title=${photo.recipeTitle},
      recipe_data=${photo.recipeData},
      color_data=${photo.colorData},
      color_sort=${photo.colorSort},
      priority_order=${photo.priorityOrder || null},
      exclude_from_feeds=${photo.excludeFromFeeds},
      hidden=${photo.hidden},
      taken_at=${photo.takenAt},
      taken_at_naive=${photo.takenAtNaive},
      updated_at=${(new Date()).toISOString()}
    WHERE id=${photo.id}
  `, 'updatePhoto');

export const deletePhotoTagGlobally = (tag: string) =>
  safelyQuery(() => sql`
    UPDATE photos
    SET tags=(
      SELECT json_group_array(value)
      FROM json_each(tags)
      WHERE value <> ${tag}
    )
    WHERE EXISTS (
      SELECT 1 FROM json_each(COALESCE(tags, '[]')) WHERE value = ${tag}
    )
  `, 'deletePhotoTagGlobally');

export const renamePhotoTagGlobally = (tag: string, updatedTag: string) =>
  safelyQuery(() => sql`
    UPDATE photos
    SET tags=(
      SELECT json_group_array(
        CASE WHEN value = ${tag} THEN ${updatedTag} ELSE value END
      )
      FROM json_each(tags)
    )
    WHERE EXISTS (
      SELECT 1 FROM json_each(COALESCE(tags, '[]')) WHERE value = ${tag}
    )
  `, 'renamePhotoTagGlobally');

export const addTagsToPhotos = (tags: string[], photoIds: string[]) =>
  safelyQuery(() => query(`
    UPDATE photos
    SET tags = (
      SELECT json_group_array(DISTINCT value) FROM (
        SELECT value FROM json_each(COALESCE(tags, '[]'))
        UNION
        SELECT value FROM json_each($1)
      )
    )
    WHERE id IN (SELECT value FROM json_each($2))
  `, [
    JSON.stringify(tags),
    JSON.stringify(photoIds),
  ]), 'addTagsToPhotos');

export const deletePhotoRecipeGlobally = (recipe: string) =>
  safelyQuery(() => sql`
    UPDATE photos
    SET recipe_title=NULL
    WHERE recipe_title=${recipe}
  `, 'deletePhotoRecipeGlobally');

export const renamePhotoRecipeGlobally = (
  recipe: string,
  updatedRecipe: string,
) =>
  safelyQuery(() => sql`
    UPDATE photos
    SET recipe_title=${updatedRecipe}
    WHERE recipe_title=${recipe}
  `, 'renamePhotoRecipeGlobally');

export const deletePhoto = (id: string) =>
  safelyQuery(() => sql`
    DELETE FROM photos WHERE id=${id}
  `, 'deletePhoto');

export const getPhotosMostRecentUpdate = async () =>
  safelyQuery(() => sql`
    SELECT updated_at FROM photos ORDER BY updated_at DESC LIMIT 1
  `.then(({ rows }) => rows[0] ? rows[0].updated_at as Date : undefined)
  , 'getPhotosMostRecentUpdate');

export const getUniqueCameras = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT make||' '||model as camera, make, model,
      COUNT(*) as count,
      MAX(updated_at) as last_modified
    FROM photos
    WHERE hidden IS NOT TRUE
    AND trim(make) <> ''
    AND trim(model) <> ''
    GROUP BY make, model
    ORDER BY camera ASC
  `.then(({ rows }): Cameras => rows.map(({
      make, model, count, last_modified,
    }) => ({
      cameraKey: createCameraKey({ make, model }),
      camera: { make, model },
      count: parseInt(count, 10), 
      lastModified: last_modified as Date,
    })))
  , 'getUniqueCameras');

export const getUniqueLenses = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT lens_make||' '||lens_model as lens,
      lens_make, lens_model,
      COUNT(*) as count,
      MAX(updated_at) as last_modified
    FROM photos
    WHERE hidden IS NOT TRUE
    AND trim(lens_model) <> ''
    GROUP BY lens_make, lens_model
    ORDER BY lens ASC
  `.then(({ rows }): Lenses => rows
      .map(({ lens_make: make, lens_model: model, count, last_modified }) => ({
        lensKey: createLensKey({ make, model }),
        lens: { make, model },
        count: parseInt(count, 10), 
        lastModified: last_modified as Date,
      })))
  , 'getUniqueLenses');

export const getUniqueTags = async (includeHidden?: boolean) =>
  // FORK: also surface each tag's zh label by zipping tags + tags_zh (index-
  // matched json_extract, NULL when absent). Facet tags carry their vocabulary
  // zh; free-form subject tags carry the model-generated zh — so the
  // sidebar/⌘K can localize EVERY tag on the 中 toggle, not just the
  // controlled vocabulary.
  safelyQuery(() => query(`
    SELECT t.value as tag,
      COUNT(*) as count,
      MAX(p.updated_at) as last_modified,
      MAX(json_extract(
        COALESCE(p.tags_zh, '[]'), '$[' || t.key || ']'
      )) as tag_zh
    FROM photos p, json_each(COALESCE(p.tags, '[]')) t
    ${includeHidden ? '' : 'WHERE p.hidden IS NOT TRUE'}
    GROUP BY t.value
    ORDER BY tag ASC
  `).then(({ rows }): Tags =>
    rows.map(({ tag, count, last_modified, tag_zh }) => ({
      tag,
      count: parseInt(count, 10),
      lastModified: last_modified as Date,
      ...(tag_zh && tag_zh !== tag && { tagZh: tag_zh as string }),
    })))
  , 'getUniqueTags');

export const getUniqueRecipes = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT recipe_title,
      COUNT(*) as count,
      MAX(updated_at) as last_modified
    FROM photos
    WHERE hidden IS NOT TRUE AND recipe_title IS NOT NULL
    GROUP BY recipe_title
    ORDER BY recipe_title ASC
  `.then(({ rows }): Recipes => rows
      .map(({ recipe_title, count, last_modified }) => ({
        recipe: recipe_title,
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      })))
  , 'getUniqueRecipes');

export const getUniqueYears = async () =>
  safelyQuery(() => sql`
    SELECT
      DISTINCT strftime('%Y', taken_at) AS year,
      COUNT(*) as count,
      MAX(updated_at) as last_modified
    FROM photos
    WHERE hidden IS NOT TRUE
    GROUP BY year
    ORDER BY year DESC
  `.then(({ rows }): Years => rows.map(({ year, count, last_modified }) => ({
      year,
      count: parseInt(count, 10),
      lastModified: last_modified as Date,
    }))), 'getUniqueYears');

export const getRecipeTitleForData = async (
  data: string | object,
  film: string,
) =>
  // Includes legacy check on pre-stringified JSON
  safelyQuery(() => sql`
    SELECT recipe_title FROM photos
    WHERE hidden IS NOT TRUE
    AND recipe_data=${typeof data === 'string' ? data : JSON.stringify(data)}
    AND film=${film}
    LIMIT 1
  `
    .then(({ rows }) => rows[0]?.recipe_title as string | undefined)
  , 'getRecipeTitleForData');

export const getPhotosNeedingRecipeTitleCount = async (
  data: string,
  film: string,
  photoIdToExclude?: string,
) =>
  safelyQuery(() => sql`
    SELECT COUNT(*) as count
    FROM photos
    WHERE recipe_title IS NULL
    AND recipe_data=${data}
    AND film=${film}
    AND id <> ${photoIdToExclude}
  `.then(({ rows }) => parseInt(rows[0].count, 10))
  , 'getPhotosNeedingRecipeTitleCount');

export const updateAllMatchingRecipeTitles = (
  title: string,
  data: string,
  film: string,
) =>
  safelyQuery(() => sql`
    UPDATE photos
    SET recipe_title=${title}
    WHERE recipe_title IS NULL
    AND recipe_data=${data}
    AND film=${film}
  `, 'updateAllMatchingRecipeTitles');

export const getUniqueFilms = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT film,
      COUNT(*) as count,
      MAX(updated_at) as last_modified
    FROM photos
    WHERE hidden IS NOT TRUE AND film IS NOT NULL
    GROUP BY film
    ORDER BY film ASC
  `.then(({ rows }): Films => rows
      .map(({ film, count, last_modified }) => ({
        film,
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      })))
  , 'getUniqueFilms');

export const getUniqueFocalLengths = async () =>
  safelyQuery(() => sql`
    SELECT DISTINCT focal_length,
      COUNT(*) as count,
      MAX(updated_at) as last_modified
    FROM photos
    WHERE hidden IS NOT TRUE AND focal_length IS NOT NULL
    GROUP BY focal_length
    ORDER BY focal_length ASC
  `.then(({ rows }): FocalLengths => rows
      .map(({ focal_length, count, last_modified }) => ({
        focal: parseInt(focal_length, 10),
        count: parseInt(count, 10),
        lastModified: last_modified as Date,
      })))
  , 'getUniqueFocalLengths');

const _getPhotos = async (
  options: PhotoQueryOptions = {},
  fields = ['*'], {
    shouldParse = true,
    includeOrderBy = true,
  }: {
    shouldParse?: boolean,
    includeOrderBy?: boolean,
  } = {},
) => {
  const sql = [
    // 'COUNT' relied on Postgres's function-as-attribute quirk (`p.count` ==
    // `count(p)`); SQLite needs the explicit aggregate + alias.
    `SELECT ${fields
      .map(field => field === 'COUNT' ? 'COUNT(*) as count' : `p.${field}`)
      .join(', ')} FROM photos p`,
  ];

  const values = [] as (string | number)[];

  const joins = getJoinsFromOptions(options);

  if (joins) { sql.push(joins); }

  const {
    wheres,
    wheresValues,
    lastValuesIndex,
  } = getWheresFromOptions(options);
  
  if (wheres) {
    sql.push(wheres);
    values.push(...wheresValues);
  }

  if (includeOrderBy) {
    sql.push(getOrderByFromOptions(options));
  }

  const {
    limitAndOffset,
    limitAndOffsetValues,
  } = getLimitAndOffsetFromOptions(options, lastValuesIndex);

  // LIMIT + OFFSET
  sql.push(limitAndOffset);
  values.push(...limitAndOffsetValues);

  return query(sql.join(' '), values)
    .then(({ rows, rowCount }) => ({
      // Only parse results if there's at least one photo
      photos: shouldParse ? rows.map(parsePhotoFromDb) : rows,
      // Prefer explicit count before falling back to row count
      count: rows[0]?.count !== undefined
        ? parseInt(rows[0]?.count ?? '0', 10)
        : rowCount ?? 0,
    }));
};

export const getPhotos = async (options: PhotoQueryOptions = {}) =>
  safelyQuery(
    async () => _getPhotos(options).then(({ photos }) => photos),
    'getPhotos',
    // Seemingly necessary to pass `options` for expected cache behavior
    options,
  );

export const getPhotoIds = async (options: PhotoQueryOptions = {}) =>
  safelyQuery(
    async () => _getPhotos(options, ['id'], { shouldParse: false })
      .then(({ photos }) => photos.map(photo => photo.id)),
    'getPhotoIds',
    // Seemingly necessary to pass `options` for expected cache behavior
    options,
  );

export const getPhotoUrls = async (options: PhotoQueryOptions = {}) =>
  safelyQuery(
    async () => _getPhotos(
      options,
      ['id', 'title', 'url', 'hidden'],
      { shouldParse: false },
    )
      .then(({ photos }) =>
        photos as {
          id: string,
          title: string,
          url: string,
          hidden?: boolean,
        }[]),
    'getPhotoUrls',
    // Seemingly necessary to pass `options` for expected cache behavior
    options,
  );

export const getPhotoCount = async (options: PhotoQueryOptions = {}) =>
  safelyQuery(
    async () => _getPhotos(
      options,
      ['COUNT'],
      { shouldParse: false, includeOrderBy: false },
    )
      .then(({ count }) => count),
    'getPhotoCount',
    // Seemingly necessary to pass `options` for expected cache behavior
    options,
  );

export const getPhotosNearId = async (
  photoId: string,
  options: PhotoQueryOptions,
) =>
  safelyQuery(async () => {
    const { limit } = options;

    const joins = getJoinsFromOptions(options);

    const {
      wheres,
      wheresValues,
      lastValuesIndex,
    } = getWheresFromOptions(options);

    // PLOG-13: continue the SAME $N sequence through one ParamBuilder instead
    // of a second manual valuesIndex++ scheme alongside the wheres bindings.
    const pb = new ParamBuilder(lastValuesIndex);
    const idParam = pb.add(photoId);
    const limitParam = pb.add(limit as number);

    return query(
      `
        WITH twi AS (
          SELECT p.*, row_number()
          OVER (${getOrderByFromOptions(options)}) as row_number
          FROM photos p
          ${joins ? `${joins}` : ''}
          ${wheres}
        ),
        current AS (SELECT row_number FROM twi WHERE id = ${idParam})
        SELECT twi.*
        FROM twi, current
        WHERE twi.row_number >= current.row_number - 1
        LIMIT ${limitParam}
      `,
      [...wheresValues, ...pb.values],
    )
      .then(({ rows }) => {
        const photo = rows.find(({ id }) => id === photoId);
        const indexNumber = photo ? parseInt(photo.row_number) : undefined;
        return {
          photos: rows.map(parsePhotoFromDb),
          indexNumber,
        };
      });
  }, `getPhotosNearId: ${photoId}`);  

export const getPhotosMeta = (options: PhotoQueryOptions = {}) =>
  safelyQuery(async () => {
    let sql = `
      SELECT COUNT(*) as count,
      MIN(p.taken_at_naive) as start, MAX(p.taken_at_naive) as end,
      MIN(p.created_at) as start_created_at, MAX(p.created_at) as end_created_at
      FROM photos p
    `;
    const joins = getJoinsFromOptions(options);
    if (joins) { sql += ` ${joins}`; }
    const { wheres, wheresValues } = getWheresFromOptions(options);
    if (wheres) { sql += ` ${wheres}`; }
    return query(sql, wheresValues)
      .then(({ rows }) => ({
        count: parseInt(rows[0].count, 10),
        ...rows[0]?.start && rows[0]?.end
          ? { dateRange: {
            start: rows[0].start as string,
            end: rows[0].end as string,
          } as PhotoDateRangePostgres }
          : undefined,
        // Used to calculate upload time for 'recents'
        ...rows[0]?.start_created_at && rows[0]?.end_created_at
          ? { dateRangeCreatedAt: {
            start: rows[0].start_created_at as string,
            end: rows[0].end_created_at as string,
          } as PhotoDateRangePostgres }
          : undefined,
      }));
  }, 'getPhotosMeta');

export const getAllPublicPhotoIds = async ({ limit }: { limit?: number }) =>
  safelyQuery(() => (limit
    ? sql`SELECT id FROM photos WHERE hidden IS NOT TRUE LIMIT ${limit}`
    : sql`SELECT id FROM photos WHERE hidden IS NOT TRUE`)
    .then(({ rows }) => rows.map(({ id }) => id as string))
  , 'getPublicPhotoIds');

export const getAllPhotoIdsWithUpdatedAt = async () =>
  safelyQuery(() =>
    sql`SELECT id, updated_at FROM photos WHERE hidden IS NOT TRUE`
      .then(({ rows }) => rows.map(({ id, updated_at }) =>
        ({ id: id as string, updatedAt: updated_at as Date })))
  , 'getPhotoIdsAndUpdatedAt');

export const getPhoto = async (
  id: string,
  includeHidden?: boolean,
): Promise<Photo | undefined> =>
  safelyQuery(async () => {
    // Check for photo id forwarding and convert short ids to uuids
    const photoId = translatePhotoId(id);
    return (includeHidden
      ? sql<PhotoDb>`SELECT * FROM photos WHERE id=${photoId} LIMIT 1`
      // eslint-disable-next-line max-len
      : sql<PhotoDb>`SELECT * FROM photos WHERE id=${photoId} AND hidden IS NOT TRUE LIMIT 1`)
      .then(({ rows }) => rows.map(parsePhotoFromDb))
      .then(photos => photos.length > 0 ? photos[0] : undefined);
  }, 'getPhoto');

// Update queries

const outdatedWhereClauses = [
  `updated_at < $1`,
];

const outdatedWhereValues = [
  OUTDATED_UPDATE_AT_THRESHOLD.toISOString(),
];

const needsAiTextWhereClauses =
  AI_CONTENT_GENERATION_ENABLED
    ? AI_TEXT_AUTO_GENERATED_FIELDS
      .map(field => {
        switch (field) {
          case 'title': return `(title <> '') IS NOT TRUE`;
          case 'caption': return `(caption <> '') IS NOT TRUE`;
          case 'tags':
            return `(tags IS NULL OR json_array_length(tags) = 0)`;
          case 'semantic': return `(semantic_description <> '') IS NOT TRUE`;
        }
      })
    : [];

const needsColorDataWhereClauses = COLOR_SORT_ENABLED
  ? [`(
    color_data IS NULL OR
    color_sort IS NULL
  )`]
  : [];

const needsSyncWhereStatement =
  `WHERE ${[
    ...outdatedWhereClauses,
    ...needsAiTextWhereClauses,
    ...needsColorDataWhereClauses,
  ].join(' OR ')}`;

export const getPhotosInNeedOfUpdate = () =>
  safelyQuery(
    () => query(`
      SELECT * FROM photos
      ${needsSyncWhereStatement}
      ORDER BY created_at DESC
      LIMIT ${UPDATE_QUERY_LIMIT}
    `,
    outdatedWhereValues,
    )
      .then(({ rows }) => rows.map(parsePhotoFromDb)),
    'getPhotosInNeedOfUpdate',
  );

export const getPhotosInNeedOfUpdateCount = () =>
  safelyQuery(
    () => query(`
      SELECT COUNT(*) as count FROM photos
      ${needsSyncWhereStatement}
    `,
    outdatedWhereValues,
    )
      .then(({ rows }) => parseInt(rows[0].count, 10)),
    'getPhotosInNeedOfUpdateCount',
  );

// Backfills and experimentation

export const getColorDataForPhotos = () =>
  safelyQuery(() => sql<{
    id: string,
    url: string,
    color_data?: PhotoColorData,
  }>`
    SELECT id, url, color_data FROM photos
    LIMIT ${UPDATE_QUERY_LIMIT}
  `.then(({ rows }) => rows.map(({ id, url, color_data }) =>
        ({ id, url, colorData: color_data })))
  , 'getColorDataForPhotos');

export const updateColorDataForPhoto = (
  photoId: string,
  colorData: string,
  colorSort: number,
) =>
  safelyQuery(
    () => sql`
      UPDATE photos SET
      color_data=${colorData},
      color_sort=${colorSort}
      WHERE id=${photoId}
    `,
    'updateColorDataForPhoto',
  );
