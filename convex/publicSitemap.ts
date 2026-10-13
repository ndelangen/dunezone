import { zodToConvex } from 'convex-helpers/server/zod4';
import type { PaginationResult } from 'convex/server';

import { sitemapArgsSchema, sitemapPageSchema, SITEMAP_PAGE_SIZE } from '../src/shared/publicDiscovery';
import type { SitemapPage } from '../src/shared/publicDiscovery';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { publicQuery } from './functions';
import { isActiveProfile } from './lib/accountLifecycle';

type Entry = SitemapPage['entries'][number];

/** A slug that cannot name its own path segment, or that a fixed route already owns, never becomes a URL. */
function usableSlug(slug: string | undefined): slug is string {
  return !!slug && !['create', '.', '..'].includes(slug) && !/[\\/]/.test(slug);
}

function lastmod(updatedAt: string | undefined): string | null {
  return updatedAt && Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt).toISOString() : null;
}

/** The entry for a record whose own slug ends the path, or null when that slug cannot be a URL. */
function entry(prefix: string[], slug: string | undefined, updatedAt?: string): Entry | null {
  return usableSlug(slug)
    ? { pathname: `/${[...prefix, slug].map(encodeURIComponent).join('/')}`, lastmod: lastmod(updatedAt) }
    : null;
}

/** One database page becomes one sitemap page; rows the public page would not serve map to null and drop out. */
async function listed<Row>(
  result: PaginationResult<Row>,
  toEntry: (row: Row) => Entry | null | Promise<Entry | null>
): Promise<SitemapPage> {
  const entries = await Promise.all(result.page.map(toEntry));
  return {
    entries: entries.filter((value): value is Entry => value !== null),
    cursor: result.isDone ? null : result.continueCursor,
  };
}

/** Rulebooks and FAQ questions live under their Ruleset's slug, and leave the map with it when it is deleted. */
function liveRulesetSlugs(ctx: QueryCtx) {
  const seen = new Map<Id<'rulesets'>, string | null>();
  return async (id: Id<'rulesets'>) => {
    if (!seen.has(id)) {
      const ruleset = await ctx.db.get(id);
      seen.set(id, ruleset && !ruleset.is_deleted && usableSlug(ruleset.slug) ? ruleset.slug : null);
    }
    return seen.get(id)!;
  };
}

/** Only public URL identity leaves the database; owners, content and publication state stay here. */
export const page = publicQuery({
  args: zodToConvex(sitemapArgsSchema).fields,
  returns: zodToConvex(sitemapPageSchema),
  handler: async (ctx, rawArgs) => {
    const args = sitemapArgsSchema.parse(rawArgs);
    const pagination = {
      cursor: args.cursor,
      numItems: SITEMAP_PAGE_SIZE,
      maximumRowsRead: SITEMAP_PAGE_SIZE,
      maximumBytesRead: 2_000_000,
    };
    const rulesetSlug = liveRulesetSlugs(ctx);
    const underRuleset = (kind: string) => async (row: Doc<'rulebooks'> | Doc<'faq_items'>) => {
      const ruleset = await rulesetSlug(row.ruleset_id);
      return ruleset ? entry(['rulesets', ruleset, kind], row.slug, row.updated_at) : null;
    };
    switch (args.collection) {
      case 'factions':
        return await listed(
          await ctx.db
            .query('factions')
            .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
            .paginate(pagination),
          (row) => entry(['factions'], row.slug, row.updated_at)
        );
      case 'rulesets':
        return await listed(
          await ctx.db
            .query('rulesets')
            .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
            .paginate(pagination),
          (row) => entry(['rulesets'], row.slug, row.updated_at)
        );
      case 'rulebooks':
        return await listed(
          await ctx.db
            .query('rulebooks')
            .withIndex('by_is_deleted', (q) => q.eq('is_deleted', false))
            .paginate(pagination),
          underRuleset('rulebooks')
        );
      case 'faq':
        /* FAQ questions have no deleted state of their own, so the scan runs in creation order over the table. */
        return await listed(await ctx.db.query('faq_items').paginate(pagination), underRuleset('faq'));
      case 'profiles':
        return await listed(
          await ctx.db
            .query('profiles')
            .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
            .paginate(pagination),
          (row) =>
            isActiveProfile(row) && !row.merged_into_profile_id ? entry(['profiles'], row.slug, row.updated_at) : null
        );
      case 'groups':
        /* Groups have no index on their deleted flag; the bounded scan skips deleted rows instead. Groups carry no edit date. */
        return await listed(await ctx.db.query('groups').paginate(pagination), (row) =>
          row.is_deleted ? null : entry(['groups'], row.slug)
        );
      default: {
        const type = args.collection;
        return await listed(
          await ctx.db
            .query('assets')
            .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
            .paginate(pagination),
          (row) => entry(['assets', type], row.slug, row.updated_at)
        );
      }
    }
  },
});
