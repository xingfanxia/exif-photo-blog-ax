import sleep from '@/utility/sleep';
import { ADMIN_SQL_DEBUG_ENABLED } from '@/app/config';

// Safe wrapper for queries. Table creation and schema migrations are applied
// EXPLICITLY by the ordered runner (`@/db/migrate` → `runMigrations`), NOT as
// a side-effect of a failed read (PLOG-3 removed the JIT-DDL-from-error path
// and its 3-deep nested migration catch). This wrapper now only:
//  - retries once on the transient Neon/Supabase "endpoint is in transition";
//  - logs with context and re-throws everything else (errors stay loud).
export const safelyQuery = async <T>(
  callback: () => Promise<T>,
  queryLabel: string,
  queryOptions?: object,
): Promise<T> => {
  let result: T;

  const start = new Date();

  try {
    result = await callback();
  } catch (e: any) {
    if (/endpoint is in transition/i.test(e.message)) {
      console.log(
        'SQL query error: endpoint is in transition (setting timeout)',
      );
      // Wait 5 seconds and try again
      await sleep(5000);
      try {
        result = await callback();
      } catch (e: any) {
        console.log(
          `SQL query error on retry (after 5000ms): ${e.message}`,
        );
        throw e;
      }
    } else {
      // Avoid re-logging common errors on initial installation
      if (/connect ECONNREFUSED/i.test(e.message)) {
        console.log('Database connection error');
      } else if (e.message !== 'The server does not support SSL connections') {
        console.log(`SQL query error (${queryLabel}): ${e.message}`, {
          error: e,
        });
      }
      throw e;
    }
  }

  if (ADMIN_SQL_DEBUG_ENABLED && queryLabel) {
    const time =
      (((new Date()).getTime() - start.getTime()) / 1000).toFixed(2);
    const message = `Debug query: ${queryLabel} (${time} seconds)`;
    if (queryOptions) {
      console.log(message, { options: queryOptions });
    } else {
      console.log(message);
    }
  }

  return result;
};
