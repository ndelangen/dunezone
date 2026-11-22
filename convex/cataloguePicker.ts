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
    /* The factions a tool has seated, so a choice can say when another variant of its Faction is among them. */
    seated: v.optional(v.array(v.string())),
  },
  returns: paginationResultValidator(
    v.object({
      choice: faqReferencePreviewValidator,
      selected: v.union(v.boolean(), v.null()),
      /* A faction choice's variant name where its Faction has several live variants to tell apart, else null. */
      variant: v.union(v.string(), v.null()),
      /* The seated variant of a faction choice's Faction, when it is another variant than the choice; null otherwise. */
      seatedAs: v.union(v.string(), v.null()),
    })
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
      rows.page.map(async ({ choice, variant, seatedAs }) => ({
        choice,
        selected: args.selection ? Boolean(await faqReferencePair(ctx, args.selection.faqQuestionId, choice)) : null,
        variant,
        seatedAs,
      }))
    );
    return { ...rows, page };
  },
});
