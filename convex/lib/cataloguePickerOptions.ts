import type { PaginationOptions } from 'convex/server';

import type { QueryCtx } from '../types';
import { readBoardListing } from './boardListing';
import { searchIndexText } from './catalogueOrder';
import { pickerVariantLabel, seatedSiblingName, seatedVariants } from './factionFamilies';
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

/**
 * The legacy FAQ picker and grouped picker share indexed search, paging and live target projection.
 * Each choice comes with its variant's name where its Faction has several, and null otherwise or on an asset.
 * Given the factions a tool has seated, a faction choice also names the seated sibling that keeps it from the table.
 */
export async function loadCataloguePickerOptions(
  ctx: QueryCtx,
  args: {
    kind: 'faction' | 'asset';
    partition: string;
    q: string;
    paginationOpts: PaginationOptions;
    seated?: readonly string[];
  }
) {
  const text = args.q.trim();
  const seated = args.kind === 'faction' && args.seated ? await seatedVariants(ctx, args.seated) : [];
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
      if (!live) {
        return null;
      }
      return {
        choice: await faqReferencePreview(ctx, live),
        variant: live.kind === 'faction' ? await pickerVariantLabel(ctx, live.faction) : null,
        seatedAs: live.kind === 'faction' ? seatedSiblingName(seated, live.faction) : null,
      };
    })
  );
  return { ...rows, page: page.filter((choice) => choice !== null) };
}
