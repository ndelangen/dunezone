/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { GF9_LEADER_SKILLS } from '../src/shared/assets/gf9LeaderSkills';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { internal } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { GF9_SEED_WORDING } from './lib/glossaryStockWording';

const [oldSeed, newSeed] = [...GF9_SEED_WORDING][0]!;
const seededCard = GF9_LEADER_SKILLS.find((card) => card.battleText === newSeed)!;
const oldCard = (battleText: string) => ({ ...seededCard, battleText });

async function seed() {
  const t = applicationTest();
  const ownerId = await t.run((ctx) => ctx.db.insert('users', { name: 'Stock owner', isAdmin: true }));
  const otherId = await t.run((ctx) => ctx.db.insert('users', { name: 'Someone else' }));
  const row = (owner: typeof ownerId, slug: string, data: unknown) =>
    t.run((ctx) =>
      ctx.db.insert('assets', {
        owner_id: owner,
        type: 'card-leaderability',
        data,
        slug,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      })
    );
  const stock = await row(ownerId, 'stock', oldCard(oldSeed));
  const edited = await row(ownerId, 'edited', oldCard(`${oldSeed} Edited.`));
  const copy = await row(otherId, 'copy', oldCard(oldSeed));
  const faction = await t.run((ctx) =>
    ctx.db.insert('factions', {
      owner_id: ownerId,
      slug: 'house-test',
      data: {
        ...assetPublishingFaction,
        rules: {
          ...assetPublishingFaction.rules,
          startText: '10 forces in Arrakeen and 10 in reserves.',
          revivalText: '2 forces.',
          advantages: [{ text: 'Once you have lost 7 forces you gain the Kwiatz Haderach.' }],
          fate: { ...assetPublishingFaction.rules.fate, text: 'Play it before Ship & Move.' },
          alliance: { text: 'Your ally may ship forces at half price.' },
        },
        troops: [{ ...assetPublishingFaction.troops[0]!, name: 'Forces', description: 'Plain forces.' }],
      },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      is_deleted: false,
      group_id: null,
    })
  );
  return { t, ownerId, stock, edited, copy, faction };
}

test('a dry run reports the glossary fixes and writes nothing', async () => {
  const { t, ownerId, stock, faction } = await seed();
  const report = await t.mutation(internal.glossaryWordingRepair.run, {
    factionSlugs: ['house-test', 'missing'],
    ownerId,
    dryRun: true,
  });
  expect(report.missingFactions).toEqual(['missing']);
  expect(report.assets).toEqual([
    {
      id: stock,
      type: 'card-leaderability',
      slug: 'stock',
      changes: [{ path: 'battleText', before: oldSeed, after: newSeed }],
    },
  ]);
  expect(report.factions[0]!.changes.map(({ path, after }) => [path, after])).toEqual([
    ['rules.startText', '10 troops in Arrakeen and 10 in reserves.'],
    ['rules.revivalText', '2 troops.'],
    ['rules.advantages[0].text', 'Once you have lost 7 troops you gain the Kwisatz Haderach.'],
    ['rules.fate.text', 'Play it before Shipment and Movement.'],
    ['rules.alliance.text', 'Your ally may ship troops at half price.'],
    ['troops[0].description', 'Plain troops.'],
  ]);
  expect((await t.run((ctx) => ctx.db.get('factions', faction)))!.data.rules.revivalText).toBe('2 forces.');
  expect((await t.run((ctx) => ctx.db.get('assets', stock)))!.data.battleText).toBe(oldSeed);
});

test('a run rewrites untouched stock text and the named factions, keeping names, paths and edits', async () => {
  const { t, ownerId, stock, edited, copy, faction } = await seed();
  await t.mutation(internal.glossaryWordingRepair.run, { factionSlugs: ['house-test'], ownerId, dryRun: false });
  expect((await t.run((ctx) => ctx.db.get('assets', stock)))!.data.battleText).toBe(newSeed);
  expect((await t.run((ctx) => ctx.db.get('assets', edited)))!.data.battleText).toBe(`${oldSeed} Edited.`);
  expect((await t.run((ctx) => ctx.db.get('assets', copy)))!.data.battleText).toBe(oldSeed);
  const data = (await t.run((ctx) => ctx.db.get('factions', faction)))!.data;
  expect(data.name).toBe(assetPublishingFaction.name);
  expect(data.logo).toBe(assetPublishingFaction.logo);
  expect(data.troops[0].name).toBe('Forces');
  expect(data.rules.startText).toBe('10 troops in Arrakeen and 10 in reserves.');
  const again = await t.mutation(internal.glossaryWordingRepair.run, {
    factionSlugs: ['house-test'],
    ownerId,
    dryRun: false,
  });
  expect(again).toEqual({ factions: [], assets: [], missingFactions: [] });
});
