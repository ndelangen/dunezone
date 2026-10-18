import { v } from 'convex/values';

import { compareCodeUnits } from '../../src/shared/compareText';
import { FAQ_CATALOGUE_PAGE_SIZE, FAQ_CATALOGUE_QUERY_LIMIT } from '../../src/shared/faq/catalogueSearch';
import { FAQ_SEARCH_RULESET_LIMIT } from '../../src/shared/faq/globalSearch';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import {
  ALL_PARTITION,
  catalogueSearchLimit,
  catalogueSearchReach,
  countCataloguePartitions,
  selectCatalogueSearch,
} from './catalogueOrder';
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
  /** The best matches first, at most `limit` of them; a search shows no count and no pages, and loads more by asking for a larger limit. */
  items: v.array(faqListItemValidator.extend({ ruleset: rulesetCitation })),
  /** Whether a larger limit would show more questions. */
  hasMore: v.boolean(),
  /** Whether more questions may match than one search shows, so the reader should add a word rather than load more. */
  capped: v.boolean(),
  /** The limit these rows answer, after clamping. */
  limit: v.number(),
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

/** Reads each ruleset once however many entries name it, starting from the ones already read, so a filter over a thousand matches reads only the rulesets among them. */
function rulesetReader(ctx: QueryCtx, known: Doc<'rulesets'>[]) {
  const cache = new Map<string, Promise<Doc<'rulesets'> | null>>(
    known.map((ruleset) => [ruleset._id, Promise.resolve(ruleset)])
  );
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

/** Whether an entry's question sits in a live ruleset. */
async function inLiveRuleset(entry: Doc<'catalogue_entries'>, rulesetOf: RulesetReader) {
  const id = faqEntryRulesetId(entry.facets);
  const ruleset = id === undefined ? null : await rulesetOf(id);
  return ruleset !== null && !ruleset.is_deleted;
}

/** The matches whose questions sit in a live ruleset, in their order. */
function keepLiveRulesets(rulesetOf: RulesetReader) {
  return async (matches: Doc<'catalogue_entries'>[]) => {
    const kept = await Promise.all(matches.map((entry) => inLiveRuleset(entry, rulesetOf)));
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

/**
 * The best questions matching a search across rulesets, the same for every viewer, with whether there are more.
 * Picked rulesets are searched in their own lists, taken in turn, so one ruleset's matches never crowd out another's;
 * none searches the list of every question and keeps those in a live ruleset.
 */
export async function loadGlobalFaqPage(ctx: QueryCtx, args: { q?: string; rulesets?: string[]; limit?: number }) {
  const picked = await loadPickedRulesets(ctx, args.rulesets ?? []);
  const text = (args.q ?? '').slice(0, FAQ_CATALOGUE_QUERY_LIMIT).trim();
  const limit = catalogueSearchLimit(args.limit, FAQ_CATALOGUE_PAGE_SIZE);
  const base = {
    selected: picked.map((ruleset) => ruleset.slug).sort(compareCodeUnits),
    searched: text !== '',
    limit,
  };
  if (!text) {
    return { ...base, items: [], hasMore: false, capped: false };
  }

  const rulesetOf = rulesetReader(ctx, picked);
  const selection = await selectCatalogueSearch(ctx, {
    kind: 'faq',
    partition: ALL_PARTITION,
    partitions: picked.length > 0 ? picked.map((ruleset) => faqRulesetPartition(ruleset._id)) : undefined,
    text,
    limit,
    keep: picked.length > 0 ? undefined : keepLiveRulesets(rulesetOf),
  });
  const items = await projectFaqListItems(ctx, await faqItemsOfEntries(ctx, selection.entries));
  return {
    ...base,
    items: await citeRulesets(items, rulesetOf),
    ...catalogueSearchReach(selection, limit, FAQ_CATALOGUE_PAGE_SIZE),
  };
}
