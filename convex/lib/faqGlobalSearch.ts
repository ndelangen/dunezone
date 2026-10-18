import { v } from 'convex/values';

import { FAQ_CATALOGUE_PAGE_SIZE, FAQ_CATALOGUE_QUERY_LIMIT } from '../../src/shared/faq/catalogueSearch';
import { FAQ_SEARCH_RULESET_LIMIT } from '../../src/shared/faq/globalSearch';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { ALL_PARTITION, countCataloguePartitions, selectCataloguePage } from './catalogueOrder';
import { faqListItemValidator } from './collaborativeAccessValidators';
import { faqEntryRulesetId, faqRulesetPartition } from './faqCatalogue';
import { faqItemsOfEntries, projectFaqListItems } from './faqRulesetList';

/* The rulesets the page offers to search within, by name; far more than exist, and a ruleset past it is still searched while none is picked. */
const FAQ_RULESET_OPTION_LIMIT = 300;

const rulesetCitation = v.object({ id: v.id('rulesets'), name: v.string(), slug: v.string() });

export const globalFaqRulesetOptionsValidator = v.array(
  v.object({
    id: v.id('rulesets'),
    name: v.string(),
    slug: v.string(),
    /** Its questions, so the picker can say how many each ruleset holds. */
    questions: v.number(),
  })
);

export const globalFaqPageValidator = v.object({
  /** The picked rulesets the search ran within, as slugs; a slug that names no live ruleset is dropped. */
  selected: v.array(v.string()),
  /** False until the reader searches for something; the page then shows how the FAQ works instead of results. */
  searched: v.boolean(),
  items: v.array(faqListItemValidator.extend({ ruleset: rulesetCitation })),
  /** Questions matching the search, across every page. */
  total: v.number(),
  /** False when the search matched more questions than one query reads, so `total` is a floor and the pages hold only the matches read. */
  complete: v.boolean(),
  /** The page these rows are, which may lie past `pageCount`, with no rows. */
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
});

/** Live rulesets that hold questions, by name, each with its question count from the catalogue's own order: what the reader can narrow a search to. */
export async function loadGlobalFaqRulesetOptions(ctx: QueryCtx) {
  const rulesets = await ctx.db
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

/** The live rulesets these slugs name, in slug order, each read once by its index. */
async function loadPickedRulesets(ctx: QueryCtx, slugs: string[]) {
  const rulesets = await Promise.all(
    [...new Set(slugs)].slice(0, FAQ_SEARCH_RULESET_LIMIT).map(
      async (slug) =>
        await ctx.db
          .query('rulesets')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .unique()
    )
  );
  return rulesets.filter((ruleset): ruleset is Doc<'rulesets'> => ruleset !== null && !ruleset.is_deleted);
}

/** Reads each ruleset once however many entries name it, so a filter over a thousand matches reads only the rulesets among them. */
function rulesetReader(ctx: QueryCtx) {
  const cache = new Map<string, Promise<Doc<'rulesets'> | null>>();
  return (id: string) => {
    let pending = cache.get(id);
    if (!pending) {
      const rulesetId = ctx.db.normalizeId('rulesets', id);
      pending = rulesetId ? ctx.db.get('rulesets', rulesetId) : Promise.resolve(null);
      cache.set(id, pending);
    }
    return pending;
  };
}

type RulesetReader = ReturnType<typeof rulesetReader>;

/** Whether an entry's question sits in a live ruleset, and in one of the picked ones when any are. */
async function inSearchedRuleset(entry: Doc<'catalogue_entries'>, pickedIds: Set<string>, rulesetOf: RulesetReader) {
  const id = faqEntryRulesetId(entry.facets);
  const allowed = id !== undefined && (pickedIds.size === 0 || pickedIds.has(id));
  const ruleset = allowed ? await rulesetOf(id) : null;
  return ruleset !== null && !ruleset.is_deleted;
}

/** The matches whose questions sit in a searched ruleset, in their order. */
function keepSearchedRulesets(picked: Doc<'rulesets'>[], rulesetOf: RulesetReader) {
  const pickedIds = new Set<string>(picked.map((ruleset) => ruleset._id));
  return async (matches: Doc<'catalogue_entries'>[]) => {
    const kept = await Promise.all(matches.map((entry) => inSearchedRuleset(entry, pickedIds, rulesetOf)));
    return matches.filter((_, index) => kept[index]);
  };
}

/** Each question with the ruleset it belongs to; a question whose ruleset is gone is left out. */
async function citeRulesets(items: Awaited<ReturnType<typeof projectFaqListItems>>, rulesetOf: RulesetReader) {
  const rulesets = await Promise.all(items.map(async (item) => await rulesetOf(item.ruleset_id)));
  return items.flatMap((item, index) => {
    const ruleset = rulesets[index];
    return ruleset ? [{ ...item, ruleset: { id: ruleset._id, name: ruleset.name, slug: ruleset.slug } }] : [];
  });
}

function pageNumber(page: number | undefined) {
  return page !== undefined && Number.isSafeInteger(page) && page > 1 ? page : 1;
}

/**
 * One page of questions matching a search across rulesets, best match first, the same for every viewer.
 * One picked ruleset searches its own list;
 * several, or none, search the list of every question and keep those in a picked, or any live, ruleset.
 * That list is read up to the catalogue's bound before it is narrowed, so `complete` says when the total is a floor.
 */
export async function loadGlobalFaqPage(ctx: QueryCtx, args: { q?: string; rulesets?: string[]; page?: number }) {
  const picked = await loadPickedRulesets(ctx, args.rulesets ?? []);
  const text = (args.q ?? '').slice(0, FAQ_CATALOGUE_QUERY_LIMIT).trim();
  const page = pageNumber(args.page);
  const base = {
    selected: picked.map((ruleset) => ruleset.slug).sort(),
    searched: text !== '',
    page,
    pageSize: FAQ_CATALOGUE_PAGE_SIZE,
  };
  if (!text) {
    return { ...base, items: [], total: 0, complete: true, pageCount: 1 };
  }

  const rulesetOf = rulesetReader(ctx);
  const own = picked.length === 1 ? picked[0]! : null;
  /*
   * Relevance decides the order while searching; the sort is only the catalogue's required order and never applies here.
   * A ruleset of its own is searched in its own list, so its matches are never crowded out by other rulesets'.
   */
  const selection = await selectCataloguePage(ctx, {
    kind: 'faq',
    partition: own ? faqRulesetPartition(own._id) : ALL_PARTITION,
    sort: 'created',
    direction: 'desc',
    page,
    pageSize: FAQ_CATALOGUE_PAGE_SIZE,
    search: { text, relevance: true },
    keep: own ? undefined : keepSearchedRulesets(picked, rulesetOf),
  });
  const items = await projectFaqListItems(ctx, await faqItemsOfEntries(ctx, selection.entries));
  return {
    ...base,
    items: await citeRulesets(items, rulesetOf),
    total: selection.total,
    complete: selection.exact,
    pageCount: Math.max(1, Math.ceil(selection.total / FAQ_CATALOGUE_PAGE_SIZE)),
  };
}
