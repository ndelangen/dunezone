import type { Triggers } from 'convex-helpers/server/triggers';
import { z } from 'zod';

import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import { toCatalogueFaction } from './factionCatalogue';
import type { CatalogueFaction } from './factionCatalogue';

/*
 * The version of the projection a card was written with.
 * Production never reruns a finished migration, so a change to what `toCatalogueFaction` outputs leaves every existing card stale until its faction is saved again.
 * Such a change bumps this number and ships a new `faction_cards_v*` migration id that rewrites every card; a reader treats a card of another version as missing.
 */
export const FACTION_CARD_PROJECTION = 1;

/*
 * The card a faction list draws, derived at the faction write in the same transaction by the catalogue's own projection.
 * A row whose stored data no longer parses keeps `data: null`, so a broken legacy faction never blocks its own write.
 * Today such a faction makes the whole catalogue throw; a card reader drops it from lists instead.
 */
export function factionCardData(faction: Doc<'factions'>): CatalogueFaction['data'] | null {
  try {
    return toCatalogueFaction(faction, []).data;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return null;
    }
    throw error;
  }
}

function cardFields(faction: Doc<'factions'>) {
  return {
    faction_id: faction._id,
    owner_id: faction.owner_id,
    group_id: faction.group_id,
    slug: faction.slug,
    created_at: faction.created_at,
    updated_at: faction.updated_at,
    is_deleted: faction.is_deleted,
    faction_creation_time: faction._creationTime,
    projection: FACTION_CARD_PROJECTION,
    data: factionCardData(faction),
  };
}

/** Writes, replaces or removes the card for one faction; rerunning it on an unchanged faction writes nothing. */
export async function syncFactionCard(ctx: MutationCtx, id: Id<'factions'>, faction: Doc<'factions'> | null) {
  const previous = await ctx.db
    .query('faction_cards')
    .withIndex('by_faction', (q) => q.eq('faction_id', id))
    .unique();
  if (!faction) {
    if (previous) {
      await ctx.db.delete(previous._id);
    }
    return;
  }
  const fields = cardFields(faction);
  if (!previous) {
    await ctx.db.insert('faction_cards', fields);
    return;
  }
  const { _id, _creationTime, ...stored } = previous;
  if (canonicalJson(stored) !== canonicalJson(fields)) {
    await ctx.db.replace(_id, fields);
  }
}

export function registerFactionCardTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    await syncFactionCard(ctx, change.id, change.newDoc);
  });
}
