import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { MutationCtx } from './_generated/server';
import { applicationTest } from './application.test.fixture';

const stamp = '2026-11-09T00:00:00.000Z';

async function seed(ctx: MutationCtx) {
  const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
  const ruleset = (name: string, fields: { is_deleted?: boolean; battle_dialing?: 'kiss' | 'basic' } = {}) =>
    ctx.db.insert('rulesets', {
      name,
      slug: name.toLowerCase(),
      about: '',
      owner_id: owner,
      group_id: null,
      is_deleted: fields.is_deleted ?? false,
      image_cover: null,
      created_at: stamp,
      updated_at: stamp,
      ...(fields.battle_dialing ? { battle_dialing: fields.battle_dialing } : {}),
    });
  await ruleset('KISS', { battle_dialing: 'kiss' });
  await ruleset('GF9');
  await ruleset('Retired', { is_deleted: true, battle_dialing: 'basic' });
}

test('offers every live ruleset by name with its battle dialing, Advanced where it has not chosen', async () => {
  const t = applicationTest();
  await t.run(seed);
  const rulesets = await t.query(api.battleWheelTool.rulesets, {});
  expect(rulesets.map(({ name, dialing }) => [name, dialing])).toEqual([
    ['GF9', 'advanced'],
    ['KISS', 'kiss'],
  ]);
});

test('reads a faction with its linked background as the preset is now, and nothing for a faction that is gone', async () => {
  const t = applicationTest();
  const preset: typeof assetPublishingFaction.background = {
    ...assetPublishingFaction.background,
    colors: ['#112233', '#445566'],
  };
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert('users', { account_state: 'active', name: 'Author', isAdmin: false });
    await ctx.db.insert('background_presets', {
      key: 'wheel-test',
      name: 'Wheel test',
      value: preset,
      revision: 1,
      updated_at: 1,
    });
    const row = (slug: string, is_deleted: boolean) =>
      ctx.db.insert('factions', {
        owner_id: owner,
        slug,
        data: {
          ...assetPublishingFaction,
          background: { ...assetPublishingFaction.background, source: { kind: 'preset', key: 'wheel-test' } },
        },
        group_id: null,
        is_deleted,
        created_at: stamp,
        updated_at: stamp,
      });
    return { live: await row('live', false), gone: await row('gone', true) };
  });
  expect(await t.query(api.battleWheelTool.faction, { factionId: ids.live })).toMatchObject({
    faction: { id: ids.live, slug: 'live', name: assetPublishingFaction.name },
    data: { background: preset },
  });
  expect(await t.query(api.battleWheelTool.faction, { factionId: ids.gone })).toBeNull();
  expect(await t.query(api.battleWheelTool.faction, { factionId: 'not-an-id' })).toBeNull();
});
