import { v } from 'convex/values';

import type { TableNames } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { identifiesSomeone, SNAPSHOT_REBUILD_CONTRACT } from './lib/provisioningContract';
import { storedRulebookDraft } from './rulebooks';

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
 * Each placeholder-only table holds one row, the snapshot's placeholder owner, so no account or profile from production is left.
 * The owner's `users` row has no email, phone, name or image.
 */
async function placeholderViolations(ctx: QueryCtx, tables: readonly TableNames[]): Promise<string[]> {
  const violations: string[] = [];
  for (const table of tables) {
    const rows = await ctx.db.query(table).take(2);
    if (rows.length !== 1) {
      violations.push(
        `${table} holds ${rows.length === 0 ? 'no rows' : 'more than one row'}; a snapshot holds its placeholder owner alone`
      );
    }
  }
  const users = await ctx.db.query('users').take(2);
  if (users.some(identifiesSomeone)) {
    violations.push('users holds a row with an email, phone, name or image');
  }
  return violations;
}

/**
 * Every live Rulebook needs the draft the load seeds, or its editor cannot open.
 * Unlike the probes above, it reads every Rulebook.
 */
async function rulebooksWithoutDrafts(ctx: QueryCtx): Promise<string[]> {
  let missing = 0;
  for await (const rulebook of ctx.db.query('rulebooks')) {
    if (!rulebook.is_deleted && (await storedRulebookDraft(ctx, rulebook._id)) === null) {
      missing += 1;
    }
  }
  return missing === 0
    ? []
    : [
        `${missing} live ${missing === 1 ? 'Rulebook has' : 'Rulebooks have'} no row in rulebook_drafts; a snapshot load seeds one from each current Edition`,
      ];
}

/** What each seeded table must hold after the load, so a table added to `seeded` fails typecheck until it has a check here. */
const seededChecks = {
  rulebook_drafts: rulebooksWithoutDrafts,
} satisfies Record<(typeof SNAPSHOT_REBUILD_CONTRACT.seeded)[number], (ctx: QueryCtx) => Promise<string[]>>;

/**
 * The contract a rebuilt deployment must satisfy once its snapshot load finished.
 *
 * Command exit codes cannot prove this: a snapshot can import successfully while being empty, and an exit code does not say which tables still hold rows.
 *
 * Runs against rebuilt deployments only (local Docker and the cloud dev deployment);
 * production is never a rebuild target.
 */
export const assertRebuildContract = internalQuery({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const contract = SNAPSHOT_REBUILD_CONTRACT;
    const uncleared = await tablesHolding(ctx, contract.empty, true);
    const unpopulated = await tablesHolding(ctx, contract.required, false);
    const unseeded = await Promise.all(contract.seeded.map((table) => seededChecks[table](ctx)));
    const violations = [
      ...uncleared.map((table) => `${table} still holds rows; a snapshot load leaves it empty`),
      ...unpopulated.map((table) => `${table} is empty; the snapshot data did not land`),
      ...unseeded.flat(),
      ...(await placeholderViolations(ctx, contract.placeholderOnly)),
    ];

    if (violations.length > 0) {
      throw new Error(`Rebuild contract violated:\n- ${violations.join('\n- ')}`);
    }
    return { ok: true as const };
  },
});
