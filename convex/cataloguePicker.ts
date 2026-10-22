import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { isAssetType } from '../src/shared/assets/types';
import { publicQuery } from './functions';
import { faqReferencePreview, faqReferencePreviewValidator } from './lib/faqReferencePreviews';
import { liveFaqReferenceTarget } from './lib/faqReferences';

/** Each group pages independently, so a busy asset type cannot hide another type's choices. */
export const options = publicQuery({
  args: { group: v.string(), q: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(faqReferencePreviewValidator),
  handler: async (ctx, args) => {
    if (args.group !== 'faction' && !isAssetType(args.group)) {
      throw new Error('Unknown catalogue type');
    }
    const kind = args.group === 'faction' ? 'faction' : 'asset';
    const partition = kind === 'faction' ? 'all' : args.group;
    const text = args.q.trim();
    const rows = text
      ? await ctx.db
          .query('catalogue_entries')
          .withSearchIndex('search_text', (q) =>
            q.search('search_text', text).eq('kind', kind).eq('partition', partition)
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('catalogue_entries')
          .withIndex('by_kind_partition_created', (q) => q.eq('kind', kind).eq('partition', partition))
          .order('desc')
          .paginate(args.paginationOpts);
    const page = await Promise.all(
      rows.page.map(async (entry) => {
        const target =
          kind === 'faction'
            ? { kind: 'faction' as const, id: ctx.db.normalizeId('factions', entry.source_id) }
            : { kind: 'asset' as const, id: ctx.db.normalizeId('assets', entry.source_id) };
        if (!target.id) {
          return null;
        }
        const live =
          target.kind === 'faction'
            ? await liveFaqReferenceTarget(ctx, { kind: target.kind, id: target.id })
            : await liveFaqReferenceTarget(ctx, { kind: target.kind, id: target.id });
        return live ? await faqReferencePreview(ctx, live) : null;
      })
    );
    return { ...rows, page: page.filter((row) => row !== null) };
  },
});
