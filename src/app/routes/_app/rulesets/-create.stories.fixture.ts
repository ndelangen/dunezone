import type { SeedDocument, WorkerIdentity } from '@db/core/convexTestProtocol';

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

export const createdRuleset = {
  name: 'WorkerCreatedRuleset',
  slug: 'workercreatedruleset',
  about: 'This ruleset was created by the real page and mutation inside an isolated Storybook worker database.',
};
