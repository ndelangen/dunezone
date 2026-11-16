import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { insertFaction } from './lib/factionFamilies';

/**
 * Writes a Faction and its Original variant straight to the database, the way `factions.create` does, and returns the variant's id.
 * The Faction takes `slug`, and the variant moves to `<slug>-original` under it.
 */
export async function insertFactionRow(
  ctx: MutationCtx,
  fields: Parameters<typeof insertFaction>[1]
): Promise<Id<'factions'>> {
  return (await insertFaction(ctx, fields))._id;
}
