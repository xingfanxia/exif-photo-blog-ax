import { ADMIN_SQL_DEBUG_ENABLED } from '@/app/config';

// PLOG-13: encapsulates the `$N` parameter sequence so query assembly stops
// hand-threading a mutable `valuesIndex` alongside a parallel values array
// (the off-by-one source). `pb.add(value)` records the value AND returns its
// placeholder in one call; `values`/`nextIndex` expose the accumulated state.
export class ParamBuilder {
  private readonly _values: (string | number)[] = [];

  constructor(private readonly startIndex = 1) {}

  // Record a bound value and return its `$N` placeholder.
  add(value: string | number): string {
    this._values.push(value);
    return `$${this.startIndex + this._values.length - 1}`;
  }

  get values(): (string | number)[] {
    return this._values;
  }

  // The next index a caller would use (== the old `lastValuesIndex`).
  get nextIndex(): number {
    return this.startIndex + this._values.length;
  }
}

// Safe wrapper for queries. Table creation and schema migrations are applied
// EXPLICITLY by the ordered runner (`@/db/migrate` → `runMigrations`), NOT as
// a side-effect of a failed read (PLOG-3 removed the JIT-DDL-from-error path
// and its 3-deep nested migration catch). This wrapper logs with context and
// re-throws (errors stay loud); the old Neon/Supabase-specific retry went
// away with Postgres (TURSO-1).
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
    console.log(`SQL query error (${queryLabel}): ${e.message}`, {
      error: e,
    });
    throw e;
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
