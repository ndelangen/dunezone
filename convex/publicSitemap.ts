import { zodToConvex } from 'convex-helpers/server/zod4';

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

function entry(segments: string[], updatedAt?: string): Entry {
  return { pathname: `/${segments.map(encodeURIComponent).join('/')}`, lastmod: lastmod(updatedAt) };
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
    const done = (result: { isDone: boolean; continueCursor: string }, entries: (Entry | null)[]) => ({
      entries: entries.filter((value): value is Entry => value !== null),
      cursor: result.isDone ? null : result.continueCursor,
    });
    switch (args.collection) {
      case 'factions': {
        const result = await ctx.db
          .query('factions')
          .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
          .paginate(pagination);
        return done(
          result,
          result.page.map((row) => (usableSlug(row.slug) ? entry(['factions', row.slug], row.updated_at) : null))
        );
      }
      case 'rulesets': {
        const result = await ctx.db
          .query('rulesets')
          .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
          .paginate(pagination);
        return done(
          result,
          result.page.map((row) => (usableSlug(row.slug) ? entry(['rulesets', row.slug], row.updated_at) : null))
        );
      }
      case 'rulebooks': {
        const result = await ctx.db
          .query('rulebooks')
          .withIndex('by_is_deleted', (q) => q.eq('is_deleted', false))
          .paginate(pagination);
        return done(
          result,
          await Promise.all(
            result.page.map(async (row: Doc<'rulebooks'>) => {
              const ruleset = await rulesetSlug(row.ruleset_id);
              return ruleset && usableSlug(row.slug)
                ? entry(['rulesets', ruleset, 'rulebooks', row.slug], row.updated_at)
                : null;
            })
          )
        );
      }
      case 'faq': {
        /* FAQ questions have no deleted state of their own, so the scan runs in creation order over the table. */
        const result = await ctx.db.query('faq_items').paginate(pagination);
        return done(
          result,
          await Promise.all(
            result.page.map(async (row) => {
              const ruleset = await rulesetSlug(row.ruleset_id);
              return ruleset && usableSlug(row.slug)
                ? entry(['rulesets', ruleset, 'faq', row.slug], row.updated_at)
                : null;
            })
          )
        );
      }
      case 'profiles': {
        const result = await ctx.db
          .query('profiles')
          .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
          .paginate(pagination);
        return done(
          result,
          result.page.map((row) =>
            isActiveProfile(row) && !row.merged_into_profile_id && usableSlug(row.slug)
              ? entry(['profiles', row.slug], row.updated_at)
              : null
          )
        );
      }
      case 'groups': {
        /* Groups have no index on their deleted flag; the bounded scan skips deleted rows instead. */
        const result = await ctx.db.query('groups').paginate(pagination);
        return done(
          result,
          result.page.map((row) => (!row.is_deleted && usableSlug(row.slug) ? entry(['groups', row.slug]) : null))
        );
      }
      default: {
        const type = args.collection;
        const result = await ctx.db
          .query('assets')
          .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
          .paginate(pagination);
        return done(
          result,
          result.page.map((row) => (usableSlug(row.slug) ? entry(['assets', type, row.slug], row.updated_at) : null))
        );
      }
    }
  },
});
