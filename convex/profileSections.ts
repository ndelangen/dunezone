import { v } from 'convex/values';

import { publicQuery } from './functions';
import {
  assignedGroupSummaryValidator,
  catalogueFactionValidator,
  profileFaqAnswerValidator,
  profileFaqQuestionValidator,
  profileValidator,
} from './lib/collaborativeAccessValidators';
import { loadProfileAnswersPage, loadProfileQuestionsPage, loadProfileSectionsBySlug } from './lib/profileSections';

/*
 * The profile page and the two paged lists under it, one cached answer each for every viewer.
 * `profiles.pageBySlug` carried every faction, answer and question at once;
 * it stays one release for the bundle deployed before this, and the contract release drops it.
 */

/** The profile a paged list belongs to, as its page names it and links back. */
const profileCitationValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  username: v.union(v.string(), v.null()),
});

/** The pager's facts: the list's count, and the page these rows are, which may lie past `pageCount`, with no rows. */
const pagedListValidator = {
  total: v.number(),
  /** Always true today: these lists are counted by the aggregate, never cut by a search. */
  complete: v.boolean(),
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
};

/**
 * A profile page: the profile, its Groups, and the first few of its factions, answers and questions, each list counted.
 * Null for an address no public profile answers to;
 * an address a rename left answers with the profile that moved, whose slug the page redirects to.
 */
export const page = publicQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      profile: profileValidator,
      groupSummaries: v.array(assignedGroupSummaryValidator),
      /** The newest few factions; the rest are in the catalogue under this member's filter. */
      factionPreview: v.array(catalogueFactionValidator),
      factionCount: v.number(),
      /** The newest few answers; the rest are on the profile's answers page. */
      answerPreview: v.array(profileFaqAnswerValidator),
      answerCount: v.number(),
      /** How many of the member's answers their question picked. */
      pickedAnswerCount: v.number(),
      /** The newest few questions; the rest are on the profile's questions page. */
      questionPreview: v.array(profileFaqQuestionValidator),
      questionCount: v.number(),
    })
  ),
  handler: async (ctx, args) => await loadProfileSectionsBySlug(ctx, args.slug),
});

/** One page of a member's answers, newest first; null for an address no public profile answers to. */
export const answers = publicQuery({
  args: { slug: v.string(), page: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({ profile: profileCitationValidator, items: v.array(profileFaqAnswerValidator), ...pagedListValidator })
  ),
  handler: async (ctx, args) => await loadProfileAnswersPage(ctx, args.slug, args.page),
});

/** One page of a member's questions, newest first; null for an address no public profile answers to. */
export const questions = publicQuery({
  args: { slug: v.string(), page: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({ profile: profileCitationValidator, items: v.array(profileFaqQuestionValidator), ...pagedListValidator })
  ),
  handler: async (ctx, args) => await loadProfileQuestionsPage(ctx, args.slug, args.page),
});
