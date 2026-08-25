import type { SeedDocument, WorkerIdentity } from '@db/core/convexTestProtocol';

function rulesetSeed(name: string, createdAt: string, key: string): SeedDocument[] {
  const ownerKey = `${key}-owner`;
  return [
    {
      key: ownerKey,
      table: 'users',
      value: { name: `${name} owner` },
    },
    {
      key,
      table: 'rulesets',
      value: {
        owner_id: { $seedRef: ownerKey },
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        about: `A deterministic Storybook record for ${name}.`,
        image_cover: null,
        group_id: null,
        created_at: createdAt,
        updated_at: createdAt,
        is_deleted: false,
      },
    },
  ];
}

export const createRulesetIdentity = {
  name: 'Storybook creator',
  subjectKey: 'creator',
} satisfies WorkerIdentity;

export const createRulesetSeed = [
  {
    key: createRulesetIdentity.subjectKey,
    table: 'users',
    value: { name: createRulesetIdentity.name },
  },
  {
    key: 'observer',
    table: 'users',
    value: { name: 'Storybook observer' },
  },
] satisfies SeedDocument[];

export const schedulerProbeSeed = [
  ...rulesetSeed('Scheduled rebuild rules', '2026-08-25T12:00:00.000Z', 'scheduler-ruleset'),
  {
    table: 'profiles',
    value: {
      user_id: { $seedRef: 'scheduler-ruleset-owner' },
      username: 'Scheduled rebuild owner',
      avatar_url: null,
      account_state: 'active',
      slug: 'scheduled-rebuild-owner',
      created_at: '2026-08-25T12:00:00.000Z',
      updated_at: '2026-08-25T12:00:00.000Z',
    },
  },
] satisfies SeedDocument[];

export const createdRuleset = {
  name: 'WorkerCreatedRuleset',
  slug: 'workercreatedruleset',
  about: 'This ruleset was created by the real page and mutation inside an isolated Storybook worker database.',
};
