import { ConvexError, v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { retargetAssetReceipts } from './contentImports';
import { internalMutation } from './functions';
import { enqueueAssetPublication } from './lib/publication';
import { nowIso } from './lib/utils';
import type { MutationCtx } from './types';

const DECK_CARD = 'deck-card';

/*
 * The GF9 import (#2384) copied the fifteen Spice territory cards the Dreamrules deck already held.
 * Each pair names the original's address and the copy's.
 * Two copies first shortened their name to fit the printed title, then took the full name back, which moved them to `-1` addresses.
 */
const SPICE_PAIRS: readonly (readonly [original: string, copy: string])[] = [
  ['broken-land', 'broken-land-1'],
  ['cielago-north', 'cielago-north-1'],
  ['cielago-south', 'cielago-south-1'],
  ['funeral-plain', 'funeral-plain-1'],
  ['habbanya-erg', 'habbanya-erg-1'],
  ['habbanya-ridge-flat', 'habbanya-ridge-flat-1'],
  ['hagga-basin', 'hagga-basin-1'],
  ['old-gap', 'old-gap-1'],
  ['red-chasm', 'red-chasm-1'],
  ['rock-outcroppings', 'rock-outcroppings-1'],
  ['sihaya-ridge', 'sihaya-ridge-1'],
  ['south-mesa', 'south-mesa-1'],
  ['the-great-flat', 'the-great-flat-1'],
  ['the-minor-erg', 'the-minor-erg-1'],
  ['wind-pass-north', 'wind-pass-north-1'],
];

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

/* The deck editor and imports refuse a member count above this. */
const MAX_MEMBER_COUNT = 99;

/**
 * Where each deck that holds `copy` will hold `original` instead, with the original's count in that deck before and after.
 * A deck that already holds both adds the counts, and a total past the editor's limit stops the merge.
 */
async function plannedMemberships(ctx: MutationCtx, original: Doc<'assets'>, copy: Doc<'assets'>) {
  const memberships = await ctx.db
    .query('asset_relations')
    .withIndex('by_to_kind', (q) => q.eq('to_asset_id', copy._id).eq('kind', DECK_CARD))
    .collect();
  return await Promise.all(
    memberships.map(async (membership) => {
      const existing = await ctx.db
        .query('asset_relations')
        .withIndex('by_from_to_kind', (q) =>
          q.eq('from_asset_id', membership.from_asset_id).eq('to_asset_id', original._id).eq('kind', DECK_CARD)
        )
        .unique();
      const before = existing?.count ?? 0;
      const after = before + membership.count;
      if (after > MAX_MEMBER_COUNT) {
        throw new ConvexError(
          `Deck ${membership.from_asset_id} would hold card-spice/${original.slug} ${after} times, past the limit of ${MAX_MEMBER_COUNT}`
        );
      }
      return { membership, existing, before, after };
    })
  );
}

/*
 * Two Spice cards are the same card when they share a name and a spice amount.
 * The copy is the newer of the two: GF9 maintains it, and some copies already moved onto a saved board.
 * So the original takes the copy's whole face and About, keeping only its own name.
 */
function sameCard(original: Doc<'assets'>, copy: Doc<'assets'>) {
  return original.data.name === copy.data.name && original.data.amount === copy.data.amount;
}

/* An original already on a saved board keeps it unless the copy links the same board; anything else needs a person. */
function boardConflict(original: Doc<'assets'>, copy: Doc<'assets'>) {
  const mine = original.data.board?.asset_id;
  return mine !== undefined && mine !== copy.data.board?.asset_id;
}

/**
 * Folds each GF9 copy into its original: the original takes the copy's face and About, keeping its own name, every deck that held the copy holds the original, and the copy is retired the way `softDelete` retires an Asset, so its address stays reserved and a repeated import cannot recreate it.
 * An ungrouped original joins the copy's Group, as the GF9 import did with the shared Arrakis board, so the package's maintainers keep editing it.
 * Import receipts that named a copy follow it to the original and record the merged state, so the next GF9 import reads the cards and the decks that hold them as unchanged.
 * Every pair is checked before anything is written;
 * a dry run reports the plan and writes nothing.
 */
export const mergeDuplicateSpiceCards = internalMutation({
  args: { dryRun: v.boolean() },
  returns: v.object({
    cards: v.array(
      v.object({
        original: v.id('assets'),
        copy: v.id('assets'),
        name: v.string(),
        text: v.string(),
        about: v.string(),
        board: v.union(v.string(), v.null()),
        group: v.union(v.id('groups'), v.null()),
        decks: v.array(v.object({ deck: v.id('assets'), before: v.number(), after: v.number() })),
      })
    ),
    receipts: v.array(
      v.object({
        receipt: v.id('content_import_receipts'),
        packageKey: v.string(),
        itemKey: v.string(),
        subjectId: v.string(),
      })
    ),
  }),
  handler: async (ctx, { dryRun }) => {
    const pairs = await Promise.all(
      SPICE_PAIRS.map(async ([originalSlug, copySlug]) => {
        const [original, copy] = await Promise.all([liveSpiceCard(ctx, originalSlug), liveSpiceCard(ctx, copySlug)]);
        if (!sameCard(original, copy)) {
          throw new ConvexError(`card-spice/${copySlug} is not a copy of card-spice/${originalSlug}`);
        }
        if (boardConflict(original, copy)) {
          throw new ConvexError(`card-spice/${originalSlug} and card-spice/${copySlug} sit on different saved boards`);
        }
        return { original, copy, memberships: await plannedMemberships(ctx, original, copy) };
      })
    );
    const report = [];
    for (const { original, copy, memberships } of pairs) {
      const data = { ...copy.data, name: original.data.name };
      const group = original.group_id ?? copy.group_id;
      if (!dryRun) {
        await ctx.db.patch(original._id, { data, group_id: group, updated_at: nowIso() });
        await enqueueAssetPublication(ctx, { ...original, data });
        for (const { membership, existing, after } of memberships) {
          if (existing) {
            await ctx.db.patch(existing._id, { count: after });
            await ctx.db.delete(membership._id);
          } else {
            await ctx.db.patch(membership._id, { to_asset_id: original._id });
          }
        }
        await ctx.db.patch(copy._id, { is_deleted: true, updated_at: nowIso() });
      }
      report.push({
        original: original._id,
        copy: copy._id,
        name: String(original.data.name),
        text: String(data.text ?? ''),
        about: String(data.about ?? ''),
        board: data.board?.asset_id ?? null,
        group,
        decks: memberships.map(({ membership, before, after }) => ({ deck: membership.from_asset_id, before, after })),
      });
    }
    const receipts = await retargetAssetReceipts(
      ctx,
      new Map(pairs.map(({ original, copy }) => [copy._id as string, original._id as string])),
      report.flatMap(({ decks }) => decks.map(({ deck }) => deck)),
      dryRun
    );
    return { cards: report, receipts };
  },
});
