import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { isAssetType } from '../src/shared/assets/types';
import { publicQuery } from './functions';
import { loadCataloguePickerOptions } from './lib/cataloguePickerOptions';
import { faqReferencePreviewValidator } from './lib/faqReferencePreviews';
import { faqReferencePair, loadLiveFaqQuestion } from './lib/faqReferences';

/** Each group pages independently, so a busy asset type cannot hide another type's choices. */
export const options = publicQuery({
  args: {
    group: v.string(),
    q: v.string(),
    paginationOpts: paginationOptsValidator,
    selection: v.optional(v.object({ faqQuestionId: v.id('faq_items') })),
  },
  returns: paginationResultValidator(
    v.object({ choice: faqReferencePreviewValidator, selected: v.union(v.boolean(), v.null()) })
  ),
  handler: async (ctx, args) => {
    if (args.group !== 'faction' && !isAssetType(args.group)) {
      throw new Error('Unknown catalogue type');
    }
    const kind = args.group === 'faction' ? 'faction' : 'asset';
    const partition = kind === 'faction' ? 'all' : args.group;
    if (args.selection) {
      await loadLiveFaqQuestion(ctx, args.selection.faqQuestionId);
    }
    const rows = await loadCataloguePickerOptions(ctx, { ...args, kind, partition });
    const page = await Promise.all(
      rows.page.map(async (choice) => ({
        choice,
        selected: args.selection ? Boolean(await faqReferencePair(ctx, args.selection.faqQuestionId, choice)) : null,
      }))
    );
    return { ...rows, page };
  },
});
