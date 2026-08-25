import type { SeedDocument, WorkerIdentity } from '@db/core/convexTestProtocol';

import { rulesetSeed } from './-index.stories.fixture';

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
