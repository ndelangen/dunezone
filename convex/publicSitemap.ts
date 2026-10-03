import { zodToConvex } from 'convex-helpers/server/zod4';

import { sitemapArgsSchema, sitemapPageSchema, SITEMAP_PAGE_SIZE } from '../src/shared/publicDiscovery';
import { query } from './_generated/server';

/** Only public URL identity leaves the database; owners, content and publication state stay here. */
export const page = query({
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
    const result =
      args.collection === 'factions'
        ? await ctx.db
            .query('factions')
            .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
            .paginate(pagination)
        : await ctx.db
            .query('assets')
            .withIndex('by_type_deleted', (q) => q.eq('type', args.collection).eq('is_deleted', false))
            .paginate(pagination);
    const root = args.collection === 'factions' ? '/factions' : `/assets/${args.collection}`;
    return {
      entries: result.page
        .filter((row) => row.slug && !['create', '.', '..'].includes(row.slug) && !/[\\/]/.test(row.slug))
        .map((row) => ({
          pathname: `${root}/${encodeURIComponent(row.slug)}`,
          lastmod: Number.isFinite(Date.parse(row.updated_at)) ? new Date(row.updated_at).toISOString() : null,
        })),
      cursor: result.isDone ? null : result.continueCursor,
    };
  },
});
