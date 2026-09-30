import { v } from 'convex/values';

import type { TableNames } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { REBUILD_CONTRACTS } from './lib/provisioningContract';
import type { RebuildSource } from './lib/provisioningContract';

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
 * A snapshot carries one account, its placeholder owner, which has no email, phone, name or image.
 * It carries no profile of an account that is being deleted or was deleted.
 */
async function snapshotAccountViolations(ctx: QueryCtx): Promise<string[]> {
  const violations: string[] = [];
  const users = await ctx.db.query('users').take(2);
  if (users.length !== 1) {
    violations.push(
      `users holds ${users.length === 0 ? 'no rows' : 'more than one row'}; a snapshot holds its placeholder owner alone`
    );
  }
  if (users.some((user) => [user.email, user.phone, user.name, user.image].some((value) => value !== undefined))) {
    violations.push('users holds a row with an email, phone, name or image');
  }
  for (const state of ['deletion_pending', 'deleted'] as const) {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_account_state_username', (q) => q.eq('account_state', state))
      .first();
    if (profile !== null) {
      violations.push(`profiles holds a ${state} account`);
    }
  }
  return violations;
}

const emptyReason: Record<RebuildSource, string> = {
  snapshot: 'a snapshot load leaves it empty',
  production: 'the post-clone cleanup did not clear it',
};

/**
 * The contract a rebuilt deployment must satisfy once its data stage finished.
 *
 * Command exit codes cannot prove this: a snapshot can import successfully while being empty, and an empty `--replace` import into a table that no longer exists silently creates it and reports success.
 *
 * Runs against rebuilt deployments only (local Docker and the cloud dev deployment);
 * production is never a rebuild target.
 */
export const assertRebuildContract = internalQuery({
  args: { source: v.union(v.literal('snapshot'), v.literal('production')) },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const contract = REBUILD_CONTRACTS[args.source];
    const uncleared = await tablesHolding(ctx, contract.empty, true);
    const unpopulated = await tablesHolding(ctx, contract.required, false);
    const violations = [
      ...uncleared.map((table) => `${table} still holds rows; ${emptyReason[args.source]}`),
      ...unpopulated.map((table) => `${table} is empty; the ${args.source} data did not land`),
      ...(args.source === 'snapshot' ? await snapshotAccountViolations(ctx) : []),
    ];

    if (violations.length > 0) {
      throw new Error(`Rebuild contract violated:\n- ${violations.join('\n- ')}`);
    }
    return { ok: true as const };
  },
});
