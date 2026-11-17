import { Migrations } from '@convex-dev/migrations';
import type { FunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';

import { components, internal } from './_generated/api';
import { attachVariant } from './factionMerge';
import { internalMutation } from './functions';
import schema from './schema';
import type { QueryCtx } from './types';

/*
 * Production's duplicate factions (#2915): the same faction in other rulesets, each its own Faction until now.
 * Norbert chose on 17 November 2026 to merge these and only these; same-named factions of other authors stay apart.
 * A one-off family in its own module, deleted with its ids once production has run them.
 */
const migrations = new Migrations(components.migrations, {
  internalMutation,
  migrationsLocationPrefix: 'factionMergeMigrations:',
  schema,
});

/** Each moving variant's address, and the address of the GF9 variant it joins under; it keeps its name, which is its ruleset. */
export const DUPLICATE_MERGES: ReadonlyMap<string, string> = new Map([
  ['atreides-1-gf9-2-0', 'atreides-gf9'],
  ['house-atreides-dreamrules', 'atreides-gf9'],
  ['house-atreides-kiss-kiss', 'atreides-gf9'],
  ['harkonnen-1-gf9-2-0', 'harkonnen-gf9'],
  ['house-harkonnen-dreamrules', 'harkonnen-gf9'],
  ['house-harkonnen-kiss-kiss', 'harkonnen-gf9'],
  ['emperor-3-gf9-2-0', 'emperor-2-gf9'],
  ['emperor-dreamrules', 'emperor-2-gf9'],
  ['emperor-1-kiss', 'emperor-2-gf9'],
  ['fremen-3-gf9-2-0', 'fremen-2-gf9'],
  ['fremen-dreamrules', 'fremen-2-gf9'],
  ['fremen-1-kiss', 'fremen-2-gf9'],
  ['spacing-guild-3-gf9-2-0', 'spacing-guild-2-gf9'],
  ['spacing-guild-dreamrules', 'spacing-guild-2-gf9'],
  ['spacing-guild-1-kiss', 'spacing-guild-2-gf9'],
  ['bene-gesserit-2-gf9-2-0', 'bene-gesserit-1-gf9'],
  ['bene-gesserit-dreamrules', 'bene-gesserit-1-gf9'],
  ['bene-tleilax-dreamrules', 'tleilaxu-gf9'],
  ['bene-tleilax-kiss-kiss', 'tleilaxu-gf9'],
  ['ixians-dreamrules', 'ixians-1-gf9'],
  ['ecaz-ecaz-moritani-dreamrules', 'ecaz-gf9'],
  ['moritani-ecaz-moritani-dreamrules', 'moritani-gf9'],
]);

async function liveVariantAt(ctx: Pick<QueryCtx, 'db'>, slug: string) {
  const rows = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .collect();
  return rows.find((row) => !row.is_deleted) ?? null;
}

/**
 * Merges each listed variant into the Faction of its GF9 variant, under that variant, as the admin merge tool does.
 * A merged variant leaves its address, so a replay, and any deployment without these rows, writes nothing.
 * A listed variant whose GF9 variant is missing, or whose merge is refused, stays where it is, logged.
 * No verify follows, so a refusal cannot hold up later deploys;
 * the merged variants are checked on the live site instead.
 */
export const faction_duplicates_merge_v1 = migrations.define({
  table: 'factions',
  /* One merge per transaction: each stores the variant and schedules its branch and reference rewrites. */
  batchSize: 1,
  migrateOne: async (ctx, row) => {
    const parentSlug = DUPLICATE_MERGES.get(row.slug);
    if (!parentSlug || row.is_deleted) {
      return;
    }
    const parent = await liveVariantAt(ctx, parentSlug);
    if (!parent || parent.family_id === row.family_id) {
      console.warn(`Faction ${row.slug} was not merged: no live ${parentSlug} in another faction.`);
      return;
    }
    /*
     * A refusal (a name clash, a gone parent) is a ConvexError thrown before the merge writes, so it is logged rather than failing the deploy.
     * Anything else fails the transaction, which writes nothing.
     */
    try {
      const { slug } = await attachVariant(ctx, {
        faction_id: row._id,
        family_id: parent.family_id,
        parent_id: parent._id,
      });
      console.log(`Merged faction ${row.slug} into ${parentSlug}'s faction at ${slug}.`);
    } catch (error) {
      if (!(error instanceof ConvexError)) {
        throw error;
      }
      console.warn(`Faction ${row.slug} was not merged: ${String(error.data)}`);
    }
  },
});

/** Typed by hand, as `CATALOGUE_MIGRATION_IDS` is, so the generated api does not reference itself. */
export const FACTION_MERGE_MIGRATION_IDS: Record<string, FunctionReference<'mutation', 'internal'>> = {
  faction_duplicates_merge_v1: internal.factionMergeMigrations.faction_duplicates_merge_v1,
};
