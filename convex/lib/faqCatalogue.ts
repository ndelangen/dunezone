import { compareCodeUnits } from '../../src/shared/compareText';
import type { FaqTag } from '../../src/shared/faq/tags';
import type { Id } from '../_generated/dataModel';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';

/*
 * A question has no length cap, but its entry is written once per list it is in and read by the hundred when searched,
 * so it carries a bounded prefix: enough to find any real question by its words, and to order and count it.
 */
const FAQ_SEARCH_TEXT_LIMIT = 2000;
const FAQ_NAME_KEY_LIMIT = 200;

/** The list of one ruleset's questions. */
export function faqRulesetPartition(rulesetId: Id<'rulesets'>) {
  return rulesetId as string;
}

/** The ruleset a question's entry belongs to: its one facet that is a ruleset's own list, as every other facet names a ruleset and something more. */
export function faqEntryRulesetId(facets: readonly string[]) {
  return facets.find((facet) => !facet.includes(':'));
}

/** The list of one ruleset's questions carrying one tag. */
export function faqTagPartition(rulesetId: Id<'rulesets'>, tag: FaqTag) {
  return `${rulesetId}:tag:${tag}`;
}

/** The list of one ruleset's questions with an accepted answer, kept so the ruleset's page can count them. */
export function faqAnsweredPartition(rulesetId: Id<'rulesets'>) {
  return `${rulesetId}:answered`;
}

/**
 * The FAQ kind of `catalogue_entries`: one entry per question in its ruleset's list, in one list per tag, and in the answered list once accepted.
 * A question is found by its own words.
 */
export const faqCatalogueKind: CatalogueKind = {
  sorts: ['name', 'created'],
  expected: async (ctx, sourceId) => {
    const itemId = ctx.db.normalizeId('faq_items', sourceId);
    const item = itemId ? await ctx.db.get('faq_items', itemId) : null;
    if (!item) {
      return null;
    }
    const tags = [...new Set(item.tags ?? [])].sort(compareCodeUnits);
    return {
      kind: 'faq',
      source_id: item._id,
      slug: item.slug,
      search_text: catalogueSearchText([item.question.slice(0, FAQ_SEARCH_TEXT_LIMIT)]),
      name_key: catalogueNameKey(item.question.slice(0, FAQ_NAME_KEY_LIMIT)),
      created_at: catalogueTimestamp(item.created_at),
      updated_at: catalogueTimestamp(item.updated_at),
      edited_at: catalogueEditedAt(item.created_at, item.updated_at),
      complexity: 0,
      complexity_score: 0,
      facets: [
        faqRulesetPartition(item.ruleset_id),
        ...tags.map((tag) => faqTagPartition(item.ruleset_id, tag)),
        ...(item.accepted_answer_id ? [faqAnsweredPartition(item.ruleset_id)] : []),
      ],
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db.query('faq_items').take(limit);
    return rows.map((row) => row._id);
  },
};
