import { createClient, type Client, type InValue } from '@libsql/client/web';

// libSQL (Turso) client — replaces the Supabase Postgres `pg` Pool
// (TURSO-1, 2026-07-11). Exposes the same call surface the app already used
// (`query(text, values)` + a `sql` tagged template that emits `$N`
// placeholders) so query call sites keep their shape; SQLite-dialect
// differences live in the query text at each site, not here.
//
// The `$N` placeholders are rewritten to SQLite's native `?N` form at execute
// time, so ParamBuilder (`@/db/query`) and the tagged template stay untouched.
//
// The web (fetch-based) client is used deliberately: no native binding, works
// on Vercel Fluid Compute, and stateless HTTP suits serverless. The DB lives
// in aws-ap-northeast-1 (Tokyo), co-located with the Vercel `hnd1` region pin.

export type Primitive = string | number | boolean | undefined | null;

export interface QueryResultRow {
  [column: string]: any
}

export interface QueryResult<T extends QueryResultRow = QueryResultRow> {
  rows: T[]
  rowCount: number
}

let _client: Client | undefined;

const getClient = (): Client => {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error('TURSO_DATABASE_URL is not set');
    }
    _client = createClient({
      // Force HTTP hrana (the web client would otherwise treat `libsql://`
      // as websocket): stateless per-request fetch, no socket to cold-start.
      url: url.replace(/^libsql:/, 'https:'),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
};

// Postgres `timestamptz` columns came back from `pg` as JS Dates and the
// domain types (PhotoDb, etc.) rely on that. SQLite stores ISO-8601 UTC text
// (`strftime('%Y-%m-%dT%H:%M:%fZ', …)` / `Date.toISOString()`), so revive
// these columns — and ONLY these; `taken_at_naive` stays a naive string.
const DATE_COLUMNS = new Set([
  'taken_at',
  'updated_at',
  'created_at',
  'applied_at',
  'last_modified',
]);

// Postgres array (`varchar[]`) and JSONB columns are stored as JSON text in
// SQLite; parse back to the arrays/objects `pg` used to hand the app.
const JSON_COLUMNS = new Set([
  'tags',
  'tags_zh',
  'recipe_data',
  'color_data',
  'location',
]);

// Postgres BOOLEAN columns are stored as 0/1 integers.
const BOOLEAN_COLUMNS = new Set([
  'hidden',
  'exclude_from_feeds',
]);

const convertRowValue = (column: string, value: unknown): unknown => {
  if (value === null || value === undefined) { return value; }
  if (DATE_COLUMNS.has(column) && typeof value === 'string') {
    return new Date(value);
  }
  if (JSON_COLUMNS.has(column) && typeof value === 'string') {
    return JSON.parse(value);
  }
  if (BOOLEAN_COLUMNS.has(column) && typeof value === 'number') {
    return Boolean(value);
  }
  return value;
};

const convertArg = (value: Primitive): InValue => {
  if (value === undefined) { return null; }
  if (typeof value === 'boolean') { return value ? 1 : 0; }
  return value;
};

// Rewrite `$1 … $N` (the pg placeholder style ParamBuilder and the `sql`
// template emit) to SQLite's positional `?1 … ?N`. Safe against JSON-path
// literals like '$[0]' — only `$<digits>` matches.
const convertPlaceholders = (queryString: string) =>
  queryString.replace(/\$(\d+)/g, '?$1');

export const query = async <T extends QueryResultRow = any>(
  queryString: string,
  values: Primitive[] = [],
): Promise<QueryResult<T>> => {
  const result = await getClient().execute({
    sql: convertPlaceholders(queryString),
    args: values.map(convertArg),
  });

  const rows = result.rows.map(row => {
    const converted: QueryResultRow = {};
    result.columns.forEach((column, index) => {
      converted[column] = convertRowValue(column, row[index]);
    });
    return converted as T;
  });

  return {
    rows,
    rowCount: rows.length || result.rowsAffected || 0,
  };
};

export const sql = <T extends QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: Primitive[]
) => {
  if (!isTemplateStringsArray(strings) || !Array.isArray(values)) {
    throw new Error('Invalid template literal argument');
  }

  let result = strings[0] ?? '';

  for (let i = 1; i < strings.length; i++) {
    result += `$${i}${strings[i] ?? ''}`;
  }

  return query<T>(result, values);
};

const isTemplateStringsArray = (
  strings: unknown,
): strings is TemplateStringsArray => {
  return (
    Array.isArray(strings) && 'raw' in strings && Array.isArray(strings.raw)
  );
};

export const testDatabaseConnection = async () =>
  query('SELECT COUNT(*) AS count FROM sqlite_master');

// Scripts (batch-upload, backfills) used to `pool.end()`; the HTTP client
// holds no sockets but close anyway for symmetry.
export const closeDb = () => {
  _client?.close();
  _client = undefined;
};
