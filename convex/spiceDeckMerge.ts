import { ConvexError, v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { retargetAssetReceipts } from './contentImports';
import { internalMutation } from './functions';
import { enqueueAssetPublication } from './lib/publication';
import { syncSpiceCardRelations } from './lib/spiceCardBoard';
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

/* The card at an address, retired or not; a rename leaves the old address to a redirect, which this does not follow. */
async function spiceCardAt(ctx: MutationCtx, slug: string) {
  return await ctx.db
    .query('assets')
    .withIndex('by_type_and_slug', (q) => q.eq('type', 'card-spice').eq('slug', slug))
    .first();
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
 * A pair whose copy is gone or retired, whose original never existed, or whose cards differ is skipped and reported instead.
 * A retired original is revived, since decks that listed it still point at it.
 * Every pair is checked before anything is written;
 * a dry run reports the plan and writes nothing.
 */
export const mergeDuplicateSpiceCards = internalMutation({
  args: { dryRun: v.boolean() },
  returns: v.object({
    cards: v.array(
      v.object({
        original: v.id('assets'),
        revived: v.boolean(),
        heldBy: v.array(v.object({ deck: v.id('assets'), count: v.number() })),
        copy: v.id('assets'),
        name: v.string(),
        text: v.string(),
        about: v.string(),
        board: v.union(v.string(), v.null()),
        group: v.union(v.id('groups'), v.null()),
        decks: v.array(v.object({ deck: v.id('assets'), before: v.number(), after: v.number() })),
      })
    ),
    skipped: v.array(v.object({ original: v.string(), copy: v.string(), reason: v.string() })),
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
    const skipped: { original: string; copy: string; reason: string }[] = [];
    const planned = await Promise.all(
      SPICE_PAIRS.map(async ([originalSlug, copySlug]) => {
        const [original, copy] = await Promise.all([spiceCardAt(ctx, originalSlug), spiceCardAt(ctx, copySlug)]);
        const skip = (reason: string) => {
          skipped.push({ original: originalSlug, copy: copySlug, reason });
          return null;
        };
        if (!copy || copy.is_deleted) {
          return skip('no live copy');
        }
        if (!original) {
          return skip('no original');
        }
        if (!sameCard(original, copy)) {
          return skip('name or amount differs');
        }
        if (boardConflict(original, copy)) {
          return skip('on different saved boards');
        }
        return { original, copy, memberships: await plannedMemberships(ctx, original, copy) };
      })
    );
    const pairs = planned.filter((pair) => pair !== null);
    const report = [];
    for (const { original, copy, memberships } of pairs) {
      const data = { ...copy.data, name: original.data.name };
      const group = original.group_id ?? copy.group_id;
      /* The decks that hold the original before the merge; `decks` lists what the merge adds to them. */
      const heldBy = await ctx.db
        .query('asset_relations')
        .withIndex('by_to_kind', (q) => q.eq('to_asset_id', original._id).eq('kind', DECK_CARD))
        .collect();
      if (!dryRun) {
        /* A retired original comes back: the Dreamrules deck still lists it, so the deck shows the card again. */
        await ctx.db.patch(original._id, { data, group_id: group, is_deleted: false, updated_at: nowIso() });
        /* The reverse rows are what redraw the card when its board or a token on it is saved. */
        await syncSpiceCardRelations(ctx, original._id, data);
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
        revived: original.is_deleted,
        heldBy: heldBy.map(({ from_asset_id, count }) => ({ deck: from_asset_id, count })),
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
    return { cards: report, skipped, receipts };
  },
});
