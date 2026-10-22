import { PROFILE_ACTIVITY_PAGE_SIZE } from '../../src/shared/profiles/catalogueSearch';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { answererPartition, pickedAnswererPartition } from './answerCatalogue';
import { countCataloguePartitions, selectCataloguePage } from './catalogueOrder';
import type { CataloguePageSelection } from './catalogueOrder';
import { factionOwnerPartition, loadFactionCardsOfEntries } from './factionCatalogue';
import { faqAskerPartition } from './faqCatalogue';
import { projectAnswersGiven, projectQuestionsAsked } from './faqProfileActivity';
import { faqItemsOfEntries } from './faqRulesetList';
import { loadProfileGroupSummaries, publicProfileBySlug } from './profileDetail';

/*
 * The profile page's sections, each a first slice of one catalogue list with that list's count, and the pages the "All N" links open.
 * A member's factions are the faction catalogue's list for their owner facet, their questions the FAQ kind's list for their asker facet, and their answers the answer kind's own lists;
 * every slice and every page is the aggregate's, so the page costs the same however much a member has made.
 */

/** Factions the profile shows; "All N factions" opens the catalogue narrowed to the member for the rest. */
export const PROFILE_FACTION_PREVIEW_SIZE = 3;
/** Answers and questions the profile shows; "All N" opens the profile's own paged list for the rest. */
export const PROFILE_FAQ_PREVIEW_SIZE = 5;

/** The newest entries of one list, from its first page. */
async function newestEntries(ctx: QueryCtx, kind: string, partition: string, pageSize: number, page = 1) {
  return await selectCataloguePage(ctx, { kind, partition, sort: 'created', direction: 'desc', page, pageSize });
}

/** The answers a page of entries names, in its order; an entry whose answer is gone is skipped. */
async function answersOfEntries(ctx: QueryCtx, entries: Doc<'catalogue_entries'>[]) {
  const answers: Doc<'faq_answers'>[] = [];
  for (const entry of entries) {
    const answerId = ctx.db.normalizeId('faq_answers', entry.source_id);
    const answer = answerId ? await ctx.db.get('faq_answers', answerId) : null;
    if (!answer) {
      /* Drift: the page comes up one row short until the backfill or the answer's next write. */
      console.warn(`Catalogue entry for FAQ answer ${entry.source_id} has no answer.`);
      continue;
    }
    answers.push(answer);
  }
  return answers;
}

async function loadAnswersGiven(ctx: QueryCtx, entries: Doc<'catalogue_entries'>[]) {
  return await projectAnswersGiven(ctx, await answersOfEntries(ctx, entries));
}

async function loadQuestionsAsked(ctx: QueryCtx, entries: Doc<'catalogue_entries'>[]) {
  return await projectQuestionsAsked(ctx, await faqItemsOfEntries(ctx, entries));
}

/** The member's lists, counted in one aggregate read. */
async function profileSectionCounts(ctx: QueryCtx, userId: Id<'users'>) {
  const [[factionCount = 0], [answerCount = 0, pickedAnswerCount = 0], [questionCount = 0]] = await Promise.all([
    countCataloguePartitions(ctx, 'faction', [factionOwnerPartition(userId)], 'name'),
    countCataloguePartitions(ctx, 'answer', [answererPartition(userId), pickedAnswererPartition(userId)], 'created'),
    countCataloguePartitions(ctx, 'faq', [faqAskerPartition(userId)], 'name'),
  ]);
  return { factionCount, answerCount, pickedAnswerCount, questionCount };
}

/**
 * The profile page, the same for every viewer: the profile, its Groups, and the first few of its factions, answers and questions with each list's count.
 * Null for an address no public profile answers to.
 */
export async function loadProfileSectionsBySlug(ctx: QueryCtx, slug: string) {
  const profile = await publicProfileBySlug(ctx, slug);
  if (!profile) {
    return null;
  }
  const userId = profile.user_id;
  const [groupSummaries, counts, factions, answers, questions] = await Promise.all([
    loadProfileGroupSummaries(ctx, userId),
    profileSectionCounts(ctx, userId),
    newestEntries(ctx, 'faction', factionOwnerPartition(userId), PROFILE_FACTION_PREVIEW_SIZE),
    newestEntries(ctx, 'answer', answererPartition(userId), PROFILE_FAQ_PREVIEW_SIZE),
    newestEntries(ctx, 'faq', faqAskerPartition(userId), PROFILE_FAQ_PREVIEW_SIZE),
  ]);
  return {
    profile,
    groupSummaries,
    ...counts,
    factionPreview: await loadFactionCardsOfEntries(ctx, factions.entries),
    answerPreview: await loadAnswersGiven(ctx, answers.entries),
    questionPreview: await loadQuestionsAsked(ctx, questions.entries),
  };
}

/** The pager's facts for one page of a list: its count and where this page sits, which may lie past the last. */
function pageFacts(selection: CataloguePageSelection, page: number) {
  return {
    total: selection.total,
    complete: selection.exact,
    page,
    pageCount: Math.max(1, Math.ceil(selection.total / PROFILE_ACTIVITY_PAGE_SIZE)),
    pageSize: PROFILE_ACTIVITY_PAGE_SIZE,
  };
}

/** The page asked for, from 1; anything else is the first. */
function requestedPage(page: number | undefined) {
  return Number.isSafeInteger(page) && page! > 1 ? page! : 1;
}

/** The profile a paged list belongs to, as its page cites it. */
function profileCitation(profile: Doc<'profiles'>) {
  return { id: profile._id, slug: profile.slug, username: profile.username };
}

/**
 * One page of a member's answers, newest first, with the counts the pager draws.
 * Null for an address no public profile answers to;
 * a page past the end answers with no rows and the real page count, so the reader can be told where the answers end.
 */
export async function loadProfileAnswersPage(ctx: QueryCtx, slug: string, page: number | undefined) {
  const profile = await publicProfileBySlug(ctx, slug);
  if (!profile) {
    return null;
  }
  const requested = requestedPage(page);
  const selection = await newestEntries(
    ctx,
    'answer',
    answererPartition(profile.user_id),
    PROFILE_ACTIVITY_PAGE_SIZE,
    requested
  );
  return {
    profile: profileCitation(profile),
    items: await loadAnswersGiven(ctx, selection.entries),
    ...pageFacts(selection, requested),
  };
}

/** One page of a member's questions, newest first, with the counts the pager draws; as `loadProfileAnswersPage` otherwise. */
export async function loadProfileQuestionsPage(ctx: QueryCtx, slug: string, page: number | undefined) {
  const profile = await publicProfileBySlug(ctx, slug);
  if (!profile) {
    return null;
  }
  const requested = requestedPage(page);
  const selection = await newestEntries(
    ctx,
    'faq',
    faqAskerPartition(profile.user_id),
    PROFILE_ACTIVITY_PAGE_SIZE,
    requested
  );
  return {
    profile: profileCitation(profile),
    items: await loadQuestionsAsked(ctx, selection.entries),
    ...pageFacts(selection, requested),
  };
}
