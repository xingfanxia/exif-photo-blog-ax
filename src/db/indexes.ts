import { parameterizeForDb, PHOTO_SEARCH_EXPRESSION } from '@/db';

// PLOG-4: indexes the query builder's predicates require. Each is its own
// `CREATE INDEX IF NOT EXISTS` statement applied via the migration runner —
// NOT stuffed into the single-statement `createPhotosTable`. All idempotent.
//
// Expression indexes (make/model/lens, search) are generated from the SAME
// `parameterizeForDb` / `PHOTO_SEARCH_EXPRESSION` the WHERE clauses use, so the
// planner's expression-match can't silently miss (a one-function-off
// expression index is dead weight).

export interface DbIndex {
  name: string;
  ddl: string;
}

// pg_trgm powers the title/caption/semantic ILIKE search via a GIN index.
export const PG_TRGM_EXTENSION_DDL =
  'CREATE EXTENSION IF NOT EXISTS pg_trgm';

const index = (name: string, body: string): DbIndex => ({
  name,
  ddl: `CREATE INDEX IF NOT EXISTS ${name} ON ${body}`,
});

export const PHOTO_INDEXES: DbIndex[] = [
  // Feed ordering with the always-present hidden predicate.
  index('idx_photos_hidden_taken_at', 'photos (hidden, taken_at DESC)'),
  index('idx_photos_hidden_created_at', 'photos (hidden, created_at DESC)'),
  // tag filter: `$1 = ANY(tags)`
  index('idx_photos_tags_gin', 'photos USING GIN (tags)'),
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
  // Full-text search: trigram GIN over the shared search expression.
  index(
    'idx_photos_search_trgm',
    `photos USING GIN ((${PHOTO_SEARCH_EXPRESSION}) gin_trgm_ops)`,
  ),
];
