import { v } from 'convex/values';

const groupValidator = v.object({
  _id: v.id('groups'),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  created_at: v.string(),
  created_by: v.id('users'),
});

export const groupMemberValidator = v.object({
  _id: v.id('group_members'),
  _creationTime: v.number(),
  group_id: v.id('groups'),
  user_id: v.id('users'),
  status: v.union(v.literal('pending'), v.literal('active'), v.literal('removed')),
  requested_at: v.string(),
  approved_at: v.union(v.string(), v.null()),
  approved_by: v.union(v.id('users'), v.null()),
});

export const membershipCommandAcknowledgementValidator = v.object({
  membershipId: v.id('group_members'),
  status: v.union(v.literal('pending'), v.literal('active'), v.literal('removed')),
});

const profileValidator = v.object({
  _id: v.id('profiles'),
  _creationTime: v.number(),
  user_id: v.id('users'),
  username: v.union(v.string(), v.null()),
  avatar_url: v.union(v.string(), v.null()),
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
});

const factionValidator = v.object({
  _id: v.id('factions'),
  _creationTime: v.number(),
  owner_id: v.id('users'),
  data: v.any(),
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  is_deleted: v.boolean(),
  group_id: v.union(v.id('groups'), v.null()),
});

const rulesetValidator = v.object({
  _id: v.id('rulesets'),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  owner_id: v.id('users'),
  group_id: v.union(v.id('groups'), v.null()),
  is_deleted: v.boolean(),
  image_cover: v.union(v.string(), v.null()),
});

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

const profileSummaryValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  username: v.union(v.string(), v.null()),
  avatar_url: v.union(v.string(), v.null()),
});

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

const rosterEntryValidator = v.object({
  membershipId: v.id('group_members'),
  user: v.object({
    id: v.id('profiles'),
    slug: v.string(),
    username: v.union(v.string(), v.null()),
    avatar_url: v.union(v.string(), v.null()),
  }),
  status: v.union(v.literal('pending'), v.literal('active')),
  requestedAt: v.string(),
  capabilities: v.object({
    approve: v.boolean(),
    reject: v.boolean(),
    remove: v.boolean(),
  }),
});

function assetViewerAccessValidator(kind: 'faction' | 'ruleset') {
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

const groupAccessValidator = v.object({
  group: groupValidator,
  members: v.array(
    v.object({
      membership: groupMemberValidator,
      profile: v.union(profileSummaryValidator, v.null()),
    })
  ),
});

const assetPublishingValidator = v.object({
  status: v.union(v.literal('current'), v.null()),
  captureStatus: v.union(v.literal('scheduled'), v.literal('in_progress'), v.null()),
  publicationHref: v.union(v.string(), v.null()),
  lastPublishedAt: v.union(v.number(), v.null()),
});

export const factionDetailPageValidator = v.object({
  faction: factionValidator,
  owner: profileValidator,
  group: v.union(groupValidator, v.null()),
  memberships: v.array(groupMemberValidator),
  groups: v.array(groupValidator),
  groupAccess: v.union(groupAccessValidator, v.null()),
  assetPublishing: assetPublishingValidator,
  viewerAccess: assetViewerAccessValidator('faction'),
  assignableGroups: v.array(assignedGroupSummaryValidator),
  rulesets: v.array(rulesetSummaryValidator),
});

const rulesetFactionSummaryValidator = v.object({
  factionId: v.id('factions'),
  name: v.string(),
  urlSlug: v.string(),
  identity: v.union(v.object({ logo: v.string(), background: v.any() }), v.null()),
});

export const rulesetPublicBundleValidator = v.object({
  ruleset: rulesetValidator,
  factions: v.array(rulesetFactionSummaryValidator),
  canEditRuleset: v.boolean(),
  viewerAccess: assetViewerAccessValidator('ruleset'),
});

const faqTagValidator = v.union(
  v.literal('rules'),
  v.literal('army_list'),
  v.literal('strategy'),
  v.literal('balance'),
  v.literal('errata'),
  v.literal('other')
);

const faqAnswerValidator = v.object({
  _id: v.id('faq_answers'),
  _creationTime: v.number(),
  faq_item_id: v.id('faq_items'),
  answer: v.string(),
  answered_by: v.id('users'),
  created_at: v.string(),
});

const faqItemValidator = v.object({
  _id: v.id('faq_items'),
  _creationTime: v.number(),
  ruleset_id: v.id('rulesets'),
  slug: v.string(),
  question: v.string(),
  tags: v.optional(v.array(faqTagValidator)),
  asked_by: v.id('users'),
  created_at: v.string(),
  updated_at: v.string(),
  accepted_answer_id: v.union(v.id('faq_answers'), v.null()),
});

const faqListItemValidator = faqItemValidator.extend({
  faq_answers: v.array(faqAnswerValidator),
  asker_profile: v.union(profileSummaryValidator, v.null()),
});

const profileFaqQuestionValidator = faqItemValidator.extend({
  ruleset: rulesetSummaryValidator,
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
  ruleset: rulesetSummaryValidator,
});

const profileFactionValidator = factionValidator.extend({
  rulesets: v.array(rulesetSummaryValidator),
});

export const profileDetailPageValidator = v.object({
  profile: profileValidator,
  memberships: v.array(groupMemberValidator),
  groups: v.array(groupValidator),
  faqAsked: v.array(profileFaqQuestionValidator),
  faqAnswers: v.array(profileFaqAnswerValidator),
  factions: v.array(profileFactionValidator),
  groupSummaries: v.array(assignedGroupSummaryValidator),
});

const membershipWithGroupValidator = groupMemberValidator.extend({
  groups: v.union(assignedGroupSummaryValidator, v.null()),
});

export const rulesetDetailPageValidator = v.union(
  rulesetPublicBundleValidator.extend({
    groupAccess: v.union(groupAccessValidator, v.null()),
    faqItems: v.array(faqListItemValidator),
    owner: v.union(profileSummaryValidator, v.null()),
    viewerAssignableMemberships: v.union(v.array(membershipWithGroupValidator), v.null()),
    assignableGroups: v.array(assignedGroupSummaryValidator),
  }),
  v.null()
);

export const groupDetailPageValidator = v.object({
  group: groupValidator,
  members: v.array(groupMemberValidator),
  factions: v.array(factionValidator),
  rulesets: v.array(rulesetValidator),
  profiles: v.array(profileValidator),
  viewerAccess: groupViewerAccessValidator,
  roster: v.array(rosterEntryValidator),
});

export {
  factionValidator,
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
