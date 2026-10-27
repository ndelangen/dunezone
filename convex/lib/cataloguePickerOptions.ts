import type { PaginationOptions } from 'convex/server';

import type { QueryCtx } from '../types';
import { readBoardListing } from './boardListing';
import { searchIndexText } from './catalogueOrder';
import { faqReferencePreview } from './faqReferencePreviews';
import { liveFaqReferenceTarget } from './faqReferenceTarget';
import type { FaqReferenceTarget } from './faqReferenceTarget';

function catalogueEntryTarget(ctx: QueryCtx, kind: 'faction' | 'asset', sourceId: string): FaqReferenceTarget | null {
  if (kind === 'faction') {
    const id = ctx.db.normalizeId('factions', sourceId);
    return id ? { kind, id } : null;
  }
  const id = ctx.db.normalizeId('assets', sourceId);
  return id ? { kind, id } : null;
}

/** The legacy FAQ picker and grouped picker share indexed search, paging and live target projection. */
export async function loadCataloguePickerOptions(
  ctx: QueryCtx,
  args: {
    kind: 'faction' | 'asset';
    partition: string;
    q: string;
    paginationOpts: PaginationOptions;
  }
) {
  const text = args.q.trim();
  const rows = text
    ? await ctx.db
        .query('catalogue_entries')
        .withSearchIndex('search_text', (q) =>
          q.search('search_text', searchIndexText(text)).eq('kind', args.kind).eq('partition', args.partition)
        )
        .paginate(args.paginationOpts)
    : await ctx.db
        .query('catalogue_entries')
        .withIndex('by_kind_partition_created', (q) => q.eq('kind', args.kind).eq('partition', args.partition))
        .order('desc')
        .paginate(args.paginationOpts);
  const page = await Promise.all(
    rows.page.map(async (entry) => {
      const target = catalogueEntryTarget(ctx, args.kind, entry.source_id);
      if (!target) {
        return null;
      }
      const board =
        target.kind === 'asset' && args.partition === 'board' ? await readBoardListing(ctx, target.id) : undefined;
      const live =
        board === undefined
          ? await liveFaqReferenceTarget(ctx, target)
          : board && !board.is_deleted
            ? { kind: 'asset' as const, asset: board }
            : null;
      return live ? await faqReferencePreview(ctx, live) : null;
    })
  );
  return { ...rows, page: page.filter((choice) => choice !== null) };
}
