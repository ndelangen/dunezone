import { v } from 'convex/values';

import type { TableNames } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { CLEARED_AFTER_CLONE, REQUIRED_AFTER_CLONE } from './lib/provisioningContract';

/** Probing with `.first()` keeps every check constant-cost regardless of table size. */
async function tablesHolding(ctx: QueryCtx, tables: readonly TableNames[], rows: boolean): Promise<TableNames[]> {
  const probed = await Promise.all(
    tables.map(async (table) => ({
      table,
      hasRows: (await ctx.db.query(table).first()) !== null,
    }))
  );
  return probed.filter((entry) => entry.hasRows === rows).map((entry) => entry.table);
}

/**
 * The contract a cloned deployment must satisfy once its data stage finished.
 *
 * Command exit codes cannot prove this: a snapshot can import successfully while being empty, and an empty `--replace`
 * import into a table that no longer exists silently creates it and reports success.
 *
 * Runs against cloned deployments only (local Docker and the cloud dev deployment); production is never a clone target.
 */
export const assertRebuildContract = internalQuery({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const uncleared = await tablesHolding(ctx, CLEARED_AFTER_CLONE, true);
    const unpopulated = await tablesHolding(ctx, REQUIRED_AFTER_CLONE, false);
    const violations = [
      ...uncleared.map((table) => `${table} still holds rows; the post-clone cleanup did not clear it`),
      ...unpopulated.map((table) => `${table} is empty; the production snapshot did not land`),
    ];

    if (violations.length > 0) {
      throw new Error(`Rebuild contract violated:\n- ${violations.join('\n- ')}`);
    }
    return { ok: true as const };
  },
});
