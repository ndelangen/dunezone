import { v } from 'convex/values';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { CanonicalFactionStoredObject } from '../src/shared/factions/schema';
import { TOOL_HIDDEN_RULESETS } from '../src/shared/rulesets/hidden';
import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { publicQuery } from './functions';
import { resolveBackHref } from './lib/assetBacks';
import { assetDisplayName } from './lib/assetInput';
import { RULESET_FACTION_LIMIT } from './lib/rulesetFactionLinks';
import { rulesetDeck } from './lib/rulesetSlots';

const STARTING_SEATS = 6;

const factionValidator = v.object({
  id: v.id('factions'),
  name: v.string(),
  src: v.union(v.string(), v.null()),
  color: v.string(),
  peeks: v.boolean(),
  paid: v.boolean(),
  initialHand: v.number(),
});

/* Read selected faction definitions and token publications, without fetching other publication or card records. */
async function readFaction(ctx: QueryCtx, id: Id<'factions'>) {
  const row = await ctx.db.get('factions', id);
  if (!row || row.is_deleted) {
    return null;
  }
  const parsed = CanonicalFactionStoredObject.safeParse(row.data);
  if (!parsed.success) {
    return null;
  }
  const publication = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'faction-token').eq('asset_id', id))
    .unique();
  return {
    id,
    name: parsed.data.name,
    src: publication ? publishedHref('faction-token', id, publication.cache_token) : null,
    color: parsed.data.themeColor,
    /* These are the prototype's reminders, not an interpreter for custom faction powers. */
    peeks: row.slug === 'house-atreides',
    paid: row.slug === 'emperor',
    initialHand: row.slug === 'house-harkonnen' ? 2 : 1,
  };
}

/* Stop at six live factions, while bounding the work if old deleted links precede them. */
async function startingSeats(ctx: QueryCtx, rulesetId: Id<'rulesets'>) {
  const links = ctx.db.query('ruleset_factions').withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', rulesetId));
  const seats: NonNullable<Awaited<ReturnType<typeof readFaction>>>[] = [];
  let examined = 0;
  for await (const link of links) {
    const faction = await readFaction(ctx, link.faction_id);
    if (faction && !seats.some((seat) => seat.id === faction.id)) {
      seats.push(faction);
    }
    examined += 1;
    if (seats.length === STARTING_SEATS || examined === RULESET_FACTION_LIMIT) {
      break;
    }
  }
  return seats;
}

/** The selected ruleset's starting seats and card back, captured once before play; no card list or live auction data. */
export const setup = publicQuery({
  args: { rulesetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ruleset: v.object({ id: v.id('rulesets'), slug: v.string(), name: v.string() }),
      seats: v.array(factionValidator),
      deck: v.union(v.object({ name: v.string(), back: v.union(v.string(), v.null()) }), v.null()),
    })
  ),
  handler: async (ctx, { rulesetId }) => {
    const id = ctx.db.normalizeId('rulesets', rulesetId);
    const row = id ? await ctx.db.get('rulesets', id) : null;
    if (!row || row.is_deleted || TOOL_HIDDEN_RULESETS.has(row.slug)) {
      return null;
    }
    const [seats, deck] = await Promise.all([startingSeats(ctx, row._id), rulesetDeck(ctx, row._id, 'treachery')]);
    const back = deck ? await resolveBackHref(ctx, deck, new Map()) : null;
    return {
      ruleset: { id: row._id, slug: row.slug, name: row.name },
      seats,
      deck: deck ? { name: assetDisplayName(deck), back: back?.href ?? null } : null,
    };
  },
});

/** A picked faction's published token and inherited reminders, without subscribing to catalogue changes. */
export const faction = publicQuery({
  args: { factionId: v.string() },
  returns: v.union(factionValidator, v.null()),
  handler: async (ctx, { factionId }) => {
    const id = ctx.db.normalizeId('factions', factionId);
    return id ? await readFaction(ctx, id) : null;
  },
});
