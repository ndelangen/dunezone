import { v } from 'convex/values';

import { compareCodeUnits } from '../src/shared/compareText';
import { internal } from './_generated/api';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { catalogueDrift as catalogueDriftOf } from './lib/catalogueEntries';
import { listOrderNamespaces, pruneOrderItems } from './lib/catalogueOrder';

/* The bounded scan the drift report reads on each side. */
const AUDIT_SCAN_LIMIT = 4096;

/**
 * Removes aggregate items whose entry is gone or keyed elsewhere, one namespace page per run, scheduling itself until every namespace is walked.
 * Only an entry deleted or edited without its trigger leaves one, so this is a repair to run by hand, never part of a deploy.
 */
export const catalogue_order_prune = internalMutation({
  args: { after: v.optional(v.string()), current: v.optional(v.string()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    /* Namespaces are walked in their JSON order, by value, so one emptied by the prune shifts nothing. */
    const namespaces = (await listOrderNamespaces(ctx))
      .map((namespace) => ({ namespace, name: JSON.stringify(namespace) }))
      .sort((left, right) => compareCodeUnits(left.name, right.name));
    const current = args.current ? namespaces.find(({ name }) => name === args.current) : undefined;
    const from = args.current ?? args.after;
    const next = current ?? namespaces.find(({ name }) => from === undefined || compareCodeUnits(name, from) > 0);
    const cursor = current ? args.cursor : undefined;
    if (!next) {
      return { done: true, pruned: 0 };
    }
    const page = await pruneOrderItems(ctx, next.namespace, cursor, 100);
    await ctx.scheduler.runAfter(
      0,
      internal.catalogueMaintenance.catalogue_order_prune,
      page.isDone ? { after: next.name } : { current: next.name, cursor: page.cursor }
    );
    return { done: false, pruned: page.pruned };
  },
});

/** Read-only drift report for one catalogue kind, both ways, within one bounded scan of each side. */
export const catalogueDrift = internalQuery({
  args: { kind: v.literal('faction'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => await catalogueDriftOf(ctx, args.kind, args.limit ?? AUDIT_SCAN_LIMIT),
});
