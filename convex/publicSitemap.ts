import { zodToConvex } from 'convex-helpers/server/zod4';
import type { PaginationResult } from 'convex/server';

import type { AssetType } from '../src/shared/assets/types';
import {
  sitemapArgsSchema,
  sitemapPageSchema,
  SITEMAP_ASSET_COLLECTIONS,
  SITEMAP_PAGE_SIZE,
} from '../src/shared/publicDiscovery';
import type { SitemapPage } from '../src/shared/publicDiscovery';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { publicQuery } from './functions';
import { isPublicProfile } from './lib/accountLifecycle';
import { ownPublishedFace } from './lib/assetBacks';
import { liveGroupOrNull } from './lib/collaborativeAccess';

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
  const entries = await Promise.all(result.page.map(async (row) => toEntry(row)));
  return {
    entries: entries.filter((value): value is Entry => value !== null),
    cursor: result.isDone ? null : result.continueCursor,
  };
}

/** Rulebooks and FAQ questions live under their Ruleset's slug, and leave the map with it when it is deleted. */
function liveRulesetSlugs(ctx: QueryCtx) {
  /* Rows of one page resolve concurrently, so the lookup itself is shared, not only its answer. */
  const seen = new Map<Id<'rulesets'>, Promise<string | null>>();
  return (id: Id<'rulesets'>) => {
    let slug = seen.get(id);
    if (!slug) {
      slug = ctx.db
        .get(id)
        .then((ruleset) => (ruleset && !ruleset.is_deleted && usableSlug(ruleset.slug) ? ruleset.slug : null));
      seen.set(id, slug);
    }
    return slug;
  };
}

/** A record whose page lives at `/<prefix>/<slug>` and whose last edit is its `updated_at`. */
const at = (prefix: string[]) => (row: { slug?: string; updated_at?: string }) =>
  entry(prefix, row.slug, row.updated_at);

/** Only public URL identity leaves the database; owners, content and publication state stay here. */
export const page = publicQuery({
  args: zodToConvex(sitemapArgsSchema).fields,
  returns: zodToConvex(sitemapPageSchema),
  handler: async (ctx, rawArgs) => {
    const { collection, cursor } = sitemapArgsSchema.parse(rawArgs);
    const pagination = {
      cursor,
      numItems: SITEMAP_PAGE_SIZE,
      maximumRowsRead: SITEMAP_PAGE_SIZE,
      maximumBytesRead: 2_000_000,
    };
    const rulesetSlug = liveRulesetSlugs(ctx);
    const underRuleset = (kind: string) => async (row: Doc<'rulebooks'> | Doc<'faq_items'>) => {
      const ruleset = await rulesetSlug(row.ruleset_id);
      return ruleset ? entry(['rulesets', ruleset, kind], row.slug, row.updated_at) : null;
    };
    switch (collection) {
      case 'factions': {
        const rows = ctx.db.query('factions').withIndex('by_deleted', (q) => q.eq('is_deleted', false));
        return await listed(await rows.paginate(pagination), at(['factions']));
      }
      case 'rulesets': {
        const rows = ctx.db.query('rulesets').withIndex('by_deleted_name', (q) => q.eq('is_deleted', false));
        return await listed(await rows.paginate(pagination), at(['rulesets']));
      }
      case 'rulebooks': {
        const rows = ctx.db.query('rulebooks').withIndex('by_is_deleted', (q) => q.eq('is_deleted', false));
        return await listed(await rows.paginate(pagination), underRuleset('rulebooks'));
      }
      case 'faq':
        /* FAQ questions have no deleted state of their own, so the scan runs in creation order over the table. */
        return await listed(await ctx.db.query('faq_items').paginate(pagination), underRuleset('faq'));
      case 'profiles': {
        const rows = ctx.db
          .query('profiles')
          .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'));
        return await listed(await rows.paginate(pagination), (row) =>
          isPublicProfile(row) ? at(['profiles'])(row) : null
        );
      }
      case 'groups':
        /* Groups have no index on their deleted flag; the bounded scan skips deleted rows instead. Groups carry no edit date. */
        return await listed(await ctx.db.query('groups').paginate(pagination), (row) => {
          const group = liveGroupOrNull(row);
          return group && entry(['groups'], group.slug);
        });
    }
    if (!SITEMAP_ASSET_COLLECTIONS.includes(collection as AssetType)) {
      throw new Error(`No sitemap collection named ${collection}`);
    }
    const rows = ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', collection).eq('is_deleted', false));
    const assetEntry = at(['assets', collection]);
    /* The page's own face rides along, so image search ties the generated image to the page that shows it. */
    return await listed(await rows.paginate(pagination), (row) => {
      const found = assetEntry(row);
      const image = ownPublishedFace(row);
      return found && image ? { ...found, image } : found;
    });
  },
});
