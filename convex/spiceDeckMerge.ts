import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internalMutation } from './functions';
import { enqueueAssetPublication } from './lib/publication';
import { nowIso } from './lib/utils';
import type { MutationCtx } from './types';

const DECK_CARD = 'deck-card';

/*
 * The GF9 import (#2384) copied the fifteen Spice territory cards the Dreamrules deck already held.
 * Each pair names the original's address and the copy's; two copies shortened their name to fit the printed title.
 */
const SPICE_PAIRS: readonly (readonly [original: string, copy: string])[] = [
  ['broken-land', 'broken-land-1'],
  ['cielago-north', 'cielago-north-1'],
  ['cielago-south', 'cielago-south-1'],
  ['funeral-plain', 'funeral-plain-1'],
  ['habbanya-erg', 'habbanya-erg-1'],
  ['habbanya-ridge-flat', 'habbanya-r-flat'],
  ['hagga-basin', 'hagga-basin-1'],
  ['old-gap', 'old-gap-1'],
  ['red-chasm', 'red-chasm-1'],
  ['rock-outcroppings', 'rock-outcrops'],
  ['sihaya-ridge', 'sihaya-ridge-1'],
  ['south-mesa', 'south-mesa-1'],
  ['the-great-flat', 'the-great-flat-1'],
  ['the-minor-erg', 'the-minor-erg-1'],
  ['wind-pass-north', 'wind-pass-north-1'],
];

/* What makes two Spice cards the same card; the copy's caption and About text are carried over, its name is not. */
const SAME_CARD = ['subName', 'amount', 'icon', 'highlights', 'board', 'overlays'] as const;

async function liveSpiceCard(ctx: MutationCtx, slug: string) {
  const row = await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'card-spice').eq('slug', slug))
    .first();
  if (!row || row.is_deleted) {
    throw new ConvexError(`No live Spice card at card-spice/${slug}`);
  }
  return row;
}

/** Moves every deck membership from `from` onto `to`, adding counts where a deck already holds both. */
async function moveDeckMemberships(ctx: MutationCtx, from: Id<'assets'>, to: Id<'assets'>, dryRun: boolean) {
  const memberships = await ctx.db
    .query('asset_relations')
    .withIndex('by_to_kind', (q) => q.eq('to_asset_id', from).eq('kind', DECK_CARD))
    .collect();
  const decks: Id<'assets'>[] = [];
  for (const membership of memberships) {
    decks.push(membership.from_asset_id);
    if (dryRun) {
      continue;
    }
    const existing = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_to_kind', (q) =>
        q.eq('from_asset_id', membership.from_asset_id).eq('to_asset_id', to).eq('kind', DECK_CARD)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + membership.count });
      await ctx.db.delete(membership._id);
    } else {
      await ctx.db.patch(membership._id, { to_asset_id: to });
    }
  }
  return decks;
}

function sameCard(original: Doc<'assets'>, copy: Doc<'assets'>) {
  return SAME_CARD.every((field) => JSON.stringify(original.data[field]) === JSON.stringify(copy.data[field]));
}

/**
 * Folds each GF9 copy into its original: the original takes the copy's caption and About text, every deck that held the copy holds the original, and the copy is retired the way `softDelete` retires an Asset, so its address stays reserved and a repeated import cannot recreate it.
 * Every pair is checked before anything is written;
 * a dry run reports the plan and writes nothing.
 */
export const mergeDuplicateSpiceCards = internalMutation({
  args: { dryRun: v.boolean() },
  returns: v.array(
    v.object({
      original: v.id('assets'),
      copy: v.id('assets'),
      name: v.string(),
      text: v.string(),
      decks: v.array(v.id('assets')),
    })
  ),
  handler: async (ctx, { dryRun }) => {
    const pairs = await Promise.all(
      SPICE_PAIRS.map(async ([originalSlug, copySlug]) => {
        const [original, copy] = await Promise.all([liveSpiceCard(ctx, originalSlug), liveSpiceCard(ctx, copySlug)]);
        if (!sameCard(original, copy)) {
          throw new ConvexError(`card-spice/${copySlug} is not a copy of card-spice/${originalSlug}`);
        }
        return { original, copy };
      })
    );
    const report = [];
    for (const { original, copy } of pairs) {
      const data = { ...original.data, text: copy.data.text ?? '', about: copy.data.about ?? '' };
      if (!dryRun) {
        await ctx.db.patch(original._id, { data, updated_at: nowIso() });
        await enqueueAssetPublication(ctx, { ...original, data });
      }
      const decks = await moveDeckMemberships(ctx, copy._id, original._id, dryRun);
      if (!dryRun) {
        await ctx.db.patch(copy._id, { is_deleted: true, updated_at: nowIso() });
      }
      report.push({
        original: original._id,
        copy: copy._id,
        name: String(original.data.name),
        text: String(data.text),
        decks,
      });
    }
    return report;
  },
});
