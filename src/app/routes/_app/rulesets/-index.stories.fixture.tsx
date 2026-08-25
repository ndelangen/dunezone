import type { SeedDocument } from '@db/core/convexTestProtocol';

export function rulesetSeed(name: string, createdAt: string, key: string): SeedDocument[] {
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

export const initialRulesetsSeed = [
  ...rulesetSeed('Arrakis Tournament Rules', '2026-08-25T08:00:00.000Z', 'arrakis'),
  ...rulesetSeed('Compact Duel Rules', '2026-08-25T09:00:00.000Z', 'duel'),
];

export const subscriptionRulesetSeed = rulesetSeed('Sietch Challenge Rules', '2026-08-25T11:00:00.000Z', 'sietch');

export const firstConcurrencySeed = rulesetSeed('First lane', '2026-08-25T10:00:00.000Z', 'first');
export const secondConcurrencySeed = rulesetSeed('Second lane', '2026-08-25T10:00:00.000Z', 'second');
