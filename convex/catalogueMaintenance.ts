import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { ownerAssetPage } from './lib/assetCatalogue';
import { catalogueDrift as catalogueDriftOf, reconcileCatalogueEntry } from './lib/catalogueEntries';
import { nextOrderNamespace, pruneOrderItems } from './lib/catalogueOrder';

/* The bounded scan the drift report reads on each side. */
const AUDIT_SCAN_LIMIT = 4096;

/* Each reconcile rereads the asset and its owner, so a page stays well inside one transaction. */
const OWNER_ASSET_PAGE = 50;

/** Carries an owner's new name, or their profile leaving or rejoining, into every one of their asset entries, a page per run. */
export const reconcileOwnerAssets = internalMutation({
  args: { ownerId: v.id('users'), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ownerAssetPage(ctx, args.ownerId, args.cursor, OWNER_ASSET_PAGE);
    for (const asset of page.page) {
      await reconcileCatalogueEntry(ctx, 'asset', asset._id);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.catalogueMaintenance.reconcileOwnerAssets, {
        ownerId: args.ownerId,
        cursor: page.continueCursor,
      });
    }
  },
});

/**
 * Removes aggregate items whose entry is gone or keyed elsewhere, one page of one namespace per run, scheduling itself until every namespace is walked.
 * Each run reads one namespace and one page of its items, so the walk stays bounded however many lists there are.
 * Only an entry deleted or edited without its trigger leaves such an item, so this is a repair to run by hand, never part of a deploy.
 */
export const catalogue_order_prune = internalMutation({
  args: {
    /* Where the namespace walk stands: the cursor before the namespace being pruned. */
    namespaces: v.optional(v.string()),
    /* The namespace being pruned and the cursor within it; a different namespace at the same spot starts from its first item. */
    current: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const walk = await nextOrderNamespace(ctx, args.namespaces);
    if (!walk.namespace) {
      return { done: true, pruned: 0 };
    }
    const name = JSON.stringify(walk.namespace);
    const page = await pruneOrderItems(ctx, walk.namespace, name === args.current ? args.cursor : undefined, 100);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.catalogueMaintenance.catalogue_order_prune, {
        namespaces: args.namespaces,
        current: name,
        cursor: page.cursor,
      });
    } else if (!walk.isDone) {
      await ctx.scheduler.runAfter(0, internal.catalogueMaintenance.catalogue_order_prune, { namespaces: walk.cursor });
    }
    return { done: page.isDone && walk.isDone, pruned: page.pruned };
  },
});

/** Read-only drift report for one catalogue kind, both ways, within one bounded scan of each side. */
export const catalogueDrift = internalQuery({
  args: {
    kind: v.union(
      v.literal('faction'),
      v.literal('asset'),
      v.literal('profile'),
      v.literal('faq'),
      v.literal('ruleset')
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => await catalogueDriftOf(ctx, args.kind, args.limit ?? AUDIT_SCAN_LIMIT),
});
