import { parameterizeForDb } from '@/db';

// PLOG-4 (SQLite dialect since TURSO-1): indexes the query builder's
// predicates require. Each is its own `CREATE INDEX IF NOT EXISTS` statement
// applied via the migration runner — NOT stuffed into the single-statement
// `createPhotosTable`. All idempotent.
//
// Expression indexes (make/model/lens) are generated from the SAME
// `parameterizeForDb` the WHERE clauses use, so the planner's expression-match
// can't silently miss (a one-function-off expression index is dead weight).
//
// Dropped in the Turso migration (no SQLite equivalent, and at this catalog's
// scale a seq scan is sub-millisecond anyway):
//  - the GIN array index on tags (tag filter now walks json_each)
//  - the pg_trgm GIN search index (search now LOWER(…) LIKE)

export interface DbIndex {
  name: string;
  ddl: string;
}

const index = (name: string, body: string): DbIndex => ({
  name,
  ddl: `CREATE INDEX IF NOT EXISTS ${name} ON ${body}`,
});

export const PHOTO_INDEXES: DbIndex[] = [
  // Feed ordering. `hidden IS NOT TRUE` (always present) isn't a clean
  // equality, so a composite `(hidden, …)` btree is mostly wasted; a PARTIAL
  // index bakes the predicate in and serves `ORDER BY … DESC LIMIT n`
  // directly (PLOG-4 H2). The public feed also filters exclude_from_feeds, so
  // a compound partial serves that hot shape (H3).
  index(
    'idx_photos_feed_taken_at',
    'photos (taken_at DESC) WHERE hidden IS NOT TRUE',
  ),
  index(
    'idx_photos_feed_created_at',
    'photos (created_at DESC) WHERE hidden IS NOT TRUE',
  ),
  index(
    'idx_photos_public_feed_taken_at',
    'photos (taken_at DESC) ' +
      'WHERE hidden IS NOT TRUE AND exclude_from_feeds IS NOT TRUE',
  ),
  // GROUP BY aggregation columns (camera/film/recipe/focal meta counts).
  index('idx_photos_make', 'photos (make)'),
  index('idx_photos_model', 'photos (model)'),
  index('idx_photos_film', 'photos (film)'),
  index('idx_photos_recipe_title', 'photos (recipe_title)'),
  index('idx_photos_focal_length', 'photos (focal_length)'),
  // Expression indexes matching parameterizeForDb's normalized equality.
  index('idx_photos_make_param', `photos ((${parameterizeForDb('make')}))`),
  index('idx_photos_model_param', `photos ((${parameterizeForDb('model')}))`),
  index(
    'idx_photos_lens_make_param',
    `photos ((${parameterizeForDb('lens_make')}))`,
  ),
  index(
    'idx_photos_lens_model_param',
    `photos ((${parameterizeForDb('lens_model')}))`,
  ),
];
