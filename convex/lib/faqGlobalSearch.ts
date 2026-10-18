import { v } from 'convex/values';

import { FAQ_CATALOGUE_PAGE_SIZE, FAQ_CATALOGUE_QUERY_LIMIT } from '../../src/shared/faq/catalogueSearch';
import { FAQ_SEARCH_RULESET_LIMIT } from '../../src/shared/faq/globalSearch';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { ALL_PARTITION, countCataloguePartitions, selectCataloguePage } from './catalogueOrder';
import { faqListItemValidator } from './collaborativeAccessValidators';
import { faqRulesetPartition } from './faqCatalogue';
import { faqItemsOfEntries, projectFaqListItems } from './faqRulesetList';

/* The rulesets the page offers to search within, by name; far more than exist, and a ruleset past it is still searched while none is picked. */
const FAQ_RULESET_OPTION_LIMIT = 300;

const rulesetOptionValidator = v.object({
  id: v.id('rulesets'),
  name: v.string(),
  slug: v.string(),
  /** Its questions, so the picker can say how many each ruleset holds. */
  questions: v.number(),
});

export const globalFaqPageValidator = v.object({
  /** Every live ruleset with at least one question, by name: what the reader can narrow the search to. */
  rulesets: v.array(rulesetOptionValidator),
  /** The picked rulesets the search ran within, as slugs; a slug that names no ruleset with questions is dropped. */
  selected: v.array(v.string()),
  /** False until the reader searches for something; the page then shows how the FAQ works instead of results. */
  searched: v.boolean(),
  items: v.array(
    faqListItemValidator.extend({ ruleset: v.object({ id: v.id('rulesets'), name: v.string(), slug: v.string() }) })
  ),
  /** Questions matching the search, across every page. */
  total: v.number(),
  /** False when the search matched more questions than one query reads, so `total` is a floor. */
  complete: v.boolean(),
  /** The page these rows are, which may lie past `pageCount`, with no rows. */
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
});

type RulesetOption = { id: Id<'rulesets'>; name: string; slug: string; questions: number };

/** Live rulesets that hold questions, by name, each with its question count from the catalogue's own order. */
async function loadRulesetOptions(ctx: QueryCtx): Promise<RulesetOption[]> {
  const rulesets: Doc<'rulesets'>[] = await ctx.db
    .query('rulesets')
    .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
    .take(FAQ_RULESET_OPTION_LIMIT);
  const counts = await countCataloguePartitions(
    ctx,
    'faq',
    rulesets.map((ruleset) => faqRulesetPartition(ruleset._id))
  );
  return rulesets
    .map((ruleset, index) => ({ id: ruleset._id, name: ruleset.name, slug: ruleset.slug, questions: counts[index]! }))
    .filter((option) => option.questions > 0);
}

/**
 * One page of questions matching a search across rulesets, best match first, the same for every viewer.
 * One picked ruleset searches its own list;
 * several, or none, search the list of every question and keep those in a live picked ruleset.
 */
export async function loadGlobalFaqPage(ctx: QueryCtx, args: { q?: string; rulesets?: string[]; page?: number }) {
  const options = await loadRulesetOptions(ctx);
  const wanted = new Set((args.rulesets ?? []).slice(0, FAQ_SEARCH_RULESET_LIMIT));
  const picked = options.filter((option) => wanted.has(option.slug));
  const text = args.q?.slice(0, FAQ_CATALOGUE_QUERY_LIMIT).trim() ?? '';
  const page = Number.isSafeInteger(args.page) && args.page! > 1 ? args.page! : 1;
  const base = {
    rulesets: options,
    selected: picked.map((option) => option.slug),
    searched: text !== '',
    page,
    pageSize: FAQ_CATALOGUE_PAGE_SIZE,
  };
  if (!text) {
    return { ...base, items: [], total: 0, complete: true, pageCount: 1 };
  }

  const searchable = new Set<string>((picked.length > 0 ? picked : options).map((option) => option.id));
  const selection = await selectCataloguePage(ctx, {
    kind: 'faq',
    partition: picked.length === 1 ? faqRulesetPartition(picked[0]!.id) : ALL_PARTITION,
    sort: 'created',
    direction: 'desc',
    page,
    pageSize: FAQ_CATALOGUE_PAGE_SIZE,
    search: { text, relevance: true },
    keep: picked.length === 1 ? undefined : (entry) => entry.facets.some((facet) => searchable.has(facet)),
  });
  const items = await projectFaqListItems(ctx, await faqItemsOfEntries(ctx, selection.entries));
  const byId = new Map(options.map((option) => [option.id as string, option]));
  return {
    ...base,
    items: items.map((item) => {
      const { id, name, slug } = byId.get(item.ruleset_id)!;
      return { ...item, ruleset: { id, name, slug } };
    }),
    total: selection.total,
    complete: selection.exact,
    pageCount: Math.max(1, Math.ceil(selection.total / FAQ_CATALOGUE_PAGE_SIZE)),
  };
}
