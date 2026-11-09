import { expect, test } from 'vite-plus/test';

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
