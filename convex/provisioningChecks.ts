import { v } from 'convex/values';

import { internalQuery } from './_generated/server';
import { CLEARED_AFTER_CLONE, REQUIRED_AFTER_CLONE } from './lib/provisioningContract';

/**
 * The contract a cloned deployment must satisfy once its data stage finished.
 *
 * Command exit codes cannot prove this: a snapshot can import successfully while being empty, and
 * an empty `--replace` import into a table that no longer exists silently creates it and reports
 * success. Probing with `.first()` keeps the check constant-cost regardless of table size.
 *
 * Runs against cloned deployments only (local Docker and the cloud dev deployment); production is
 * never a clone target.
 */
export const assertRebuildContract = internalQuery({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const violations: string[] = [];

    for (const table of CLEARED_AFTER_CLONE) {
      if (await ctx.db.query(table).first()) {
        violations.push(`${table} still holds rows; the post-clone cleanup did not clear it`);
      }
    }
    for (const table of REQUIRED_AFTER_CLONE) {
      if (!(await ctx.db.query(table).first())) {
        violations.push(`${table} is empty; the production snapshot did not land`);
      }
    }

    if (violations.length > 0) {
      throw new Error(`Rebuild contract violated:\n- ${violations.join('\n- ')}`);
    }
    return { ok: true as const };
  },
});
