/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';

async function seed() {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Stock owner', isAdmin: true }));
  const faction = await t.run((ctx) =>
    ctx.db.insert('factions', {
      owner_id: ownerId,
      slug: 'emperor-test',
      data: {
        ...assetPublishingFaction,
        rules: {
          ...assetPublishingFaction.rules,
          advantages: [{ text: 'Spice in front of your Player Shield is yours to give.' }],
          fate: { title: '', text: 'Prison Planet: Play your fate card at any time to revive troops.' },
        },
      },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      is_deleted: false,
      group_id: null,
    })
  );
  return { t, faction };
}

test('a dry run reports the shield wording and the Fate heading and writes nothing', async () => {
  const { t, faction } = await seed();
  const report = await t.mutation(internal.glossaryFactionRepair.run, {
    factionSlugs: ['emperor-test', 'missing'],
    dryRun: true,
  });
  expect(report.missingFactions).toEqual(['missing']);
  expect(report.factions[0]!.changes.map(({ path, after }) => [path, after])).toEqual([
    ['rules.advantages[0].text', 'Spice in front of your Faction shield is yours to give.'],
    ['rules.fate.label', 'fate'],
  ]);
  const data = (await t.run((ctx) => ctx.db.get('factions', faction)))!.data;
  expect(data.rules.fate.label).toBeUndefined();
  expect(data.rules.advantages[0].text).toBe('Spice in front of your Player Shield is yours to give.');
});

test('a run writes the changes once and leaves names alone', async () => {
  const { t, faction } = await seed();
  await t.mutation(internal.glossaryFactionRepair.run, { factionSlugs: ['emperor-test'], dryRun: false });
  const data = (await t.run((ctx) => ctx.db.get('factions', faction)))!.data;
  expect(data.name).toBe(assetPublishingFaction.name);
  expect(data.rules.fate.label).toBe('fate');
  expect(data.rules.advantages[0].text).toBe('Spice in front of your Faction shield is yours to give.');
  const again = await t.mutation(internal.glossaryFactionRepair.run, { factionSlugs: ['emperor-test'], dryRun: false });
  expect(again).toEqual({ factions: [], missingFactions: [] });
});
