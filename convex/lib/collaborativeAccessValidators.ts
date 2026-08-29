import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import schema from '../schema';
import { catalogueFactionDataValidator, factionDataValidator } from './factionData';

/**
 * Document validators derive from their authority, 'convex/schema.ts' (ADR-0002);
 * faction 'data' derives from the canonical faction Zod schema.
 * Do not restate table shapes by hand here.
 */
function docValidator<Table extends keyof typeof schema.tables>(table: Table) {
  return schema.tables[table].validator.extend({
    _id: v.id(table),
    _creationTime: v.number(),
  });
}

const groupValidator = docValidator('groups');

export const groupMemberValidator = docValidator('group_members');

export const membershipCommandAcknowledgementValidator = v.object({
  membershipId: v.id('group_members'),
  status: v.union(v.literal('pending'), v.literal('active'), v.literal('removed')),
});

const profileValidator = docValidator('profiles');

const factionValidator = docValidator('factions').extend({ data: factionDataValidator });

const rulesetValidator = docValidator('rulesets');

const publicViewerValidator = v.union(
  v.object({ kind: v.literal('anonymous') }),
  v.object({
    kind: v.literal('authenticated'),
    membership: v.union(v.literal('none'), v.literal('pending'), v.literal('active')),
  })
);

const assignedGroupSummaryValidator = v.object({
  id: v.id('groups'),
  name: v.string(),
  slug: v.string(),
});

const rulesetSummaryValidator = v.object({
  id: v.id('rulesets'),
  name: v.string(),
  slug: v.string(),
});

/*
 * A ruleset cited from someone's FAQ activity, which is the summary plus whatever the row holds for a cover.
 * The cover fields are picked off the schema rather than restated, so a change to how a cover is stored reaches this without anyone remembering it.
 * The plain summary above stays as it is: the faction catalogue uses it and has no cover to send.
 */
const rulesetCitationValidator = schema.tables.rulesets.validator.pick('cover', 'image_cover').extend({
  id: v.id('rulesets'),
  name: v.string(),
  slug: v.string(),
});

const profileSummaryValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  username: v.union(v.string(), v.null()),
  avatar_url: v.union(v.string(), v.null()),
});

/** The Profile summary chip (see CONTEXT.md); derive from this, never restate. */
export type ProfileSummary = Infer<typeof profileSummaryValidator>;

const groupViewerAccessValidator = v.object({
  kind: v.literal('group'),
  viewer: publicViewerValidator,
  capabilities: v.object({
    requestMembership: v.boolean(),
    rename: v.boolean(),
    delete: v.boolean(),
    addMember: v.boolean(),
  }),
});

const factionViewerAccessValidator = groupAssociatedViewerAccessValidator('faction');
const rulesetViewerAccessValidator = groupAssociatedViewerAccessValidator('ruleset');
const assetViewerAccessValidator = groupAssociatedViewerAccessValidator('asset');

const rosterEntryValidator = v.object({
  membershipId: v.id('group_members'),
  user: profileSummaryValidator,
  status: v.union(v.literal('pending'), v.literal('active')),
  requestedAt: v.string(),
  capabilities: v.object({
    approve: v.boolean(),
    reject: v.boolean(),
    remove: v.boolean(),
  }),
});

/** One capability surface for every Group-associated asset kind (see CONTEXT.md): factions, rulesets, and community Assets. */
function groupAssociatedViewerAccessValidator<Kind extends 'faction' | 'ruleset' | 'asset'>(kind: Kind) {
  return v.object({
    kind: v.literal(kind),
    assignedGroup: v.union(assignedGroupSummaryValidator, v.null()),
    viewer: publicViewerValidator,
    capabilities: v.object({
      requestMembership: v.boolean(),
      edit: v.boolean(),
      rename: v.boolean(),
      changeGroup: v.boolean(),
      delete: v.boolean(),
    }),
  });
}

export const assetPublishingValidator = v.object({
  status: v.union(v.literal('current'), v.null()),
  captureStatus: v.union(v.literal('scheduled'), v.literal('in_progress'), v.null()),
  publicationHref: v.union(v.string(), v.null()),
  lastPublishedAt: v.union(v.number(), v.null()),
});

export const factionDetailPageValidator = v.object({
  faction: factionValidator,
  owner: v.union(profileValidator, v.null()),
  assetPublishing: assetPublishingValidator,
  viewerAccess: factionViewerAccessValidator,
  assignableGroups: v.array(assignedGroupSummaryValidator),
  rulesets: v.array(rulesetSummaryValidator),
});

/**
 * A catalogue-shaped faction row: what '/factions', a ruleset's faction rail and a profile's faction list put on the wire.
 * Deliberately not a whole faction.
 * It carries what 'FactionCard' draws, what links and sorts the row, and the rulesets that caption it;
 * 'factions.getBySlug' remains the contract for anything that needs the authored blob.
 */
export const catalogueFactionValidator = schema.tables.factions.validator
  .pick('slug', 'created_at', 'updated_at')
  .extend({
    _id: v.id('factions'),
    data: catalogueFactionDataValidator,
    rulesets: v.array(rulesetSummaryValidator),
  });

export const rulesetPublicBundleValidator = v.object({
  ruleset: rulesetValidator,
  factions: v.array(catalogueFactionValidator),
  viewerAccess: rulesetViewerAccessValidator,
});

const faqAnswerValidator = docValidator('faq_answers');

const faqItemValidator = docValidator('faq_items');

const faqListItemValidator = faqItemValidator.extend({
  faq_answers: v.array(faqAnswerValidator),
  asker_profile: v.union(profileSummaryValidator, v.null()),
});

const profileFaqQuestionValidator = faqItemValidator.extend({
  ruleset: rulesetCitationValidator,
});

const profileFaqAnswerValidator = faqAnswerValidator.extend({
  faq_item: v.object({
    id: v.id('faq_items'),
    slug: v.string(),
    question: v.string(),
    ruleset_id: v.id('rulesets'),
    asked_by: v.id('users'),
    accepted_answer_id: v.union(v.id('faq_answers'), v.null()),
  }),
  asker_profile: v.union(profileSummaryValidator, v.null()),
  ruleset: rulesetCitationValidator,
});

export const profileDetailPageValidator = v.object({
  profile: profileValidator,
  faqAsked: v.array(profileFaqQuestionValidator),
  faqAnswers: v.array(profileFaqAnswerValidator),
  factions: v.array(catalogueFactionValidator),
  groupSummaries: v.array(assignedGroupSummaryValidator),
});

/** One slotted asset: enough to name it and link to it, and deliberately not enough to draw it. A slot list is not a catalogue. */
export const rulesetAssetSlotValidator = v.object({
  slot: v.string(),
  asset: v.object({
    id: v.id('assets'),
    type: v.string(),
    slug: v.string(),
    name: v.string(),
  }),
});

export const rulesetDetailPageValidator = v.union(
  rulesetPublicBundleValidator.extend({
    faqItems: v.array(faqListItemValidator),
    owner: v.union(profileSummaryValidator, v.null()),
    assignableGroups: v.array(assignedGroupSummaryValidator),
    assetSlots: v.array(rulesetAssetSlotValidator),
  }),
  v.null()
);

export const groupDetailPageValidator = v.object({
  group: groupValidator,
  factions: v.array(factionValidator),
  rulesets: v.array(rulesetValidator),
  owner: v.union(profileSummaryValidator, v.null()),
  viewerAccess: groupViewerAccessValidator,
  roster: v.array(rosterEntryValidator),
});

export {
  factionValidator,
  factionViewerAccessValidator,
  rulesetViewerAccessValidator,
  rulesetSummaryValidator,
  assignedGroupSummaryValidator,
  assetViewerAccessValidator,
  groupValidator,
  groupViewerAccessValidator,
  profileValidator,
  profileSummaryValidator,
  publicViewerValidator,
  rosterEntryValidator,
  rulesetValidator,
};
