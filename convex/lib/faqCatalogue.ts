import { compareCodeUnits } from '../../src/shared/compareText';
import { FAQ_CATALOGUE_PAGE_SIZE, FAQ_CATALOGUE_QUERY_LIMIT } from '../../src/shared/faq/catalogueSearch';
import type { FaqTag } from '../../src/shared/faq/tags';
import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';
import {
  catalogueSearchLimit,
  catalogueSearchReach,
  selectCataloguePage,
  selectCatalogueSearch,
} from './catalogueOrder';
import { faqItemsOfEntries, projectFaqListItems } from './faqRulesetList';

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

/** What a ruleset's FAQ page asks for, as the route's search parameters reach `faq.rulesetFaq`. */
export type RulesetFaqQuery = {
  q?: string;
  tag?: FaqTag;
  page?: number;
  /** How many of the best matches a search shows; "Load more" asks again with a larger one. */
  limit?: number;
};

/** The text a FAQ search runs: the query cut to the longest search the FAQ runs, then trimmed; empty when nothing is searched. */
export function rulesetFaqSearchText(q: string | undefined) {
  return q?.slice(0, FAQ_CATALOGUE_QUERY_LIMIT).trim() ?? '';
}

/** The list a page reads: the ruleset's questions, or those carrying the tag picked. */
function rulesetFaqListPartition(rulesetId: Id<'rulesets'>, tag: FaqTag | undefined) {
  return tag ? faqTagPartition(rulesetId, tag) : faqRulesetPartition(rulesetId);
}

/**
 * One page of a ruleset's FAQ, newest first, with the counts the pager draws.
 * A searched `q` without a limit is an old bundle's paged search, best match first;
 * it is kept one release for the bundle deployed before this and dropped in the contract release.
 * A page past the end answers with no rows and the real page count, so the reader can be told where the questions end.
 */
export async function loadRulesetFaqPage(ctx: QueryCtx, rulesetId: Id<'rulesets'>, query: RulesetFaqQuery) {
  const text = rulesetFaqSearchText(query.q);
  const page = Number.isSafeInteger(query.page) && query.page! > 1 ? query.page! : 1;
  const selection = await selectCataloguePage(ctx, {
    kind: 'faq',
    partition: rulesetFaqListPartition(rulesetId, query.tag),
    sort: 'created',
    direction: 'desc',
    page,
    pageSize: FAQ_CATALOGUE_PAGE_SIZE,
    search: text ? { text, relevance: true } : undefined,
  });
  return {
    items: await projectFaqListItems(ctx, await faqItemsOfEntries(ctx, selection.entries)),
    total: selection.total,
    complete: selection.exact,
    page,
    pageCount: Math.max(1, Math.ceil(selection.total / FAQ_CATALOGUE_PAGE_SIZE)),
    pageSize: FAQ_CATALOGUE_PAGE_SIZE,
  };
}

/**
 * The best questions matching a search in one ruleset's FAQ, with whether there are more: no count and no pages, and "Load more" asks again with a larger limit.
 * A tag picked is the list searched, so the search stays within it.
 */
export async function loadRulesetFaqSearch(ctx: QueryCtx, rulesetId: Id<'rulesets'>, query: RulesetFaqQuery) {
  const limit = catalogueSearchLimit(query.limit, FAQ_CATALOGUE_PAGE_SIZE);
  const selection = await selectCatalogueSearch(ctx, {
    kind: 'faq',
    partition: rulesetFaqListPartition(rulesetId, query.tag),
    text: rulesetFaqSearchText(query.q),
    limit,
  });
  return {
    mode: 'search' as const,
    items: await projectFaqListItems(ctx, await faqItemsOfEntries(ctx, selection.entries)),
    ...catalogueSearchReach(selection, limit, FAQ_CATALOGUE_PAGE_SIZE),
    limit,
  };
}
