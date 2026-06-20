import { POSTGRES_SSL_ENABLED } from '@/app/config';
import { removeParamsFromUrl } from '@/utility/url';
import { Pool, QueryResult, QueryResultRow } from 'pg';

export const pool = new Pool({
  ...process.env.POSTGRES_URL && {
    connectionString: removeParamsFromUrl(
      process.env.POSTGRES_URL,
      ['sslmode'],
    ),
  },
  // Supabase's pooler presents a cert chain Node doesn't verify by default
  // ("self-signed certificate in certificate chain" with bare `ssl: true`).
  // The connection is still TLS-encrypted; we skip chain verification for the
  // known Supabase host. (PLOG-8)
  ...POSTGRES_SSL_ENABLED && { ssl: { rejectUnauthorized: false } },
  // Keep the per-instance pool small: against Supabase's transaction pooler,
  // node-pg's default max (10) × many warm Fluid-Compute instances can exhaust
  // the pooler's connection budget under burst. (PLOG-8)
  max: 3,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

export type Primitive = string | number | boolean | undefined | null;

export const query = async <T extends QueryResultRow = any>(
  queryString: string,
  values: Primitive[] = [],
) => {
  const client = await pool.connect();
  let response: QueryResult<T>;
  try {
    response = await client.query<T>(queryString, values);
  } finally {
    client.release();
  }
  return response;
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
  query('SELECT COUNT(*) FROM pg_stat_user_tables');
